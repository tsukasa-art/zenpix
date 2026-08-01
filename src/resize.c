/*
 * resize.c — Lanczos-3 image resize (scalar reference + RGBA SIMD dispatch)
 *
 * Algorithm: horizontal pass (u8 → f32 intermediate) then vertical pass (f32 → u8).
 * Supports ch = 1/2/3/4, arbitrary src/dst dimensions, optional pthreads V-pass.
 *
 * Exported symbols:
 *   pict_resize_lanczos3 — resize raw pixel buffer (caller-allocated dst)
 */

#include "pict_resize.h"
#define PICT_RESIZE_SIMD_IMPLEMENTATION 1
#include "resize_simd.h"

#ifdef _WIN32
#  define _USE_MATH_DEFINES
#endif
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* Keep architecture-specific intrinsics private to this translation unit. */
#if defined(PICT_SIMD_NEON)
#  include "resize_simd_neon.c"
#elif defined(PICT_SIMD_SSE2)
#  include "resize_simd_sse2.c"
#endif

#ifdef PICT_RESIZE_TESTING
#  ifdef _WIN32
#    include <windows.h>
static volatile LONG64 g_simd_h_rows;
static volatile LONG64 g_simd_v_rows;
void pict_resize_test_reset_simd_counts(void) {
    InterlockedExchange64(&g_simd_h_rows, 0);
    InterlockedExchange64(&g_simd_v_rows, 0);
}
uint64_t pict_resize_test_simd_h_rows(void) {
    return (uint64_t)InterlockedCompareExchange64(&g_simd_h_rows, 0, 0);
}
uint64_t pict_resize_test_simd_v_rows(void) {
    return (uint64_t)InterlockedCompareExchange64(&g_simd_v_rows, 0, 0);
}
#    define PICT_RECORD_SIMD_H() InterlockedIncrement64(&g_simd_h_rows)
#    define PICT_RECORD_SIMD_V() InterlockedIncrement64(&g_simd_v_rows)
#  else
#    include <stdatomic.h>
static _Atomic uint64_t g_simd_h_rows;
static _Atomic uint64_t g_simd_v_rows;
void pict_resize_test_reset_simd_counts(void) {
    atomic_store(&g_simd_h_rows, 0);
    atomic_store(&g_simd_v_rows, 0);
}
uint64_t pict_resize_test_simd_h_rows(void) { return atomic_load(&g_simd_h_rows); }
uint64_t pict_resize_test_simd_v_rows(void) { return atomic_load(&g_simd_v_rows); }
#    define PICT_RECORD_SIMD_H() atomic_fetch_add(&g_simd_h_rows, 1)
#    define PICT_RECORD_SIMD_V() atomic_fetch_add(&g_simd_v_rows, 1)
#  endif
#else
#  define PICT_RECORD_SIMD_H() ((void)0)
#  define PICT_RECORD_SIMD_V() ((void)0)
#endif

#ifdef __APPLE__
#  include <sys/sysctl.h>
#elif defined(_WIN32)
#  include <windows.h>
#else
#  include <unistd.h>
#endif

#ifndef _WIN32
#  include <pthread.h>
#endif

static void *v_pass_chunk_run(void *arg);  /* forward declaration for Win32 wrapper */

#ifdef _WIN32
typedef HANDLE pict_thread_t;
static DWORD WINAPI vpass_thread_fn(LPVOID arg) { v_pass_chunk_run(arg); return 0; }
#  define PICT_THREAD_CREATE(th, arg) ((*(th)) = CreateThread(NULL, 0, vpass_thread_fn, (arg), 0, NULL), (*(th)) == NULL ? -1 : 0)
#  define PICT_THREAD_JOIN(th)        (WaitForSingleObject((th), INFINITE), CloseHandle(th))
#else
typedef pthread_t pict_thread_t;
#  define PICT_THREAD_CREATE(th, arg) pthread_create((th), NULL, v_pass_chunk_run, (arg))
#  define PICT_THREAD_JOIN(th)        pthread_join((th), NULL)
#endif

/* ── Lanczos-3 kernel ────────────────────────────────────────────────────── */

static float lanczos_kernel(float x) {
    float ax = fabsf(x);
    if (ax == 0.0f) return 1.0f;
    if (ax >= 3.0f) return 0.0f;
    float pi_x   = (float)M_PI * x;
    float pi_x_a = (float)M_PI * x / 3.0f;
    return (sinf(pi_x) / pi_x) * (sinf(pi_x_a) / pi_x_a);
}

/* ── H-pass: one src row (u8) → one f32 row ─────────────────────────────── */

static void h_pass_row_scalar(
    const uint8_t *src_row, float *out_row,
    uint32_t src_w, uint32_t dst_w, int ch, float scale_x)
{
    float support = 3.0f / (scale_x < 1.0f ? scale_x : 1.0f);
    for (uint32_t dx = 0; dx < dst_w; dx++) {
        float sx_center = ((float)dx + 0.5f) / scale_x - 0.5f;
        int64_t sx_min = (int64_t)floorf(sx_center - support);
        int64_t sx_max = (int64_t)ceilf(sx_center + support);

        double sum[4] = {0, 0, 0, 0};
        double weight_sum = 0.0;

        for (int64_t sx = sx_min; sx <= sx_max; sx++) {
            float w = lanczos_kernel(((float)sx - sx_center) *
                                     (scale_x < 1.0f ? scale_x : 1.0f));
            if (w == 0.0f) continue;
            int64_t clamped = sx < 0 ? 0 : sx >= (int64_t)src_w ? (int64_t)src_w - 1 : sx;
            for (int c = 0; c < ch; c++)
                sum[c] += (double)src_row[(size_t)clamped * (size_t)ch + (size_t)c] * w;
            weight_sum += w;
        }
        for (int c = 0; c < ch; c++)
            out_row[(size_t)dx * (size_t)ch + (size_t)c] = (float)(sum[c] / weight_sum);
    }
}

/* ── V-pass: one dst row from f32 intermediate buffer ────────────────────── */

static void v_pass_row_scalar(
    const float *inter,   /* sh × row_stride f32 */
    uint8_t *dst_row,
    uint32_t dy, uint32_t src_h, uint32_t dst_w, int ch,
    float scale_y, float support_y, size_t row_stride)
{
    float sy_center = ((float)dy + 0.5f) / scale_y - 0.5f;
    int64_t sy_min = (int64_t)floorf(sy_center - support_y);
    int64_t sy_max = (int64_t)ceilf(sy_center + support_y);

    for (uint32_t dx = 0; dx < dst_w; dx++) {
        double sum[4] = {0, 0, 0, 0};
        double weight_sum = 0.0;

        for (int64_t sy = sy_min; sy <= sy_max; sy++) {
            float w = lanczos_kernel(((float)sy - sy_center) *
                                     (scale_y < 1.0f ? scale_y : 1.0f));
            if (w == 0.0f) continue;
            int64_t clamped = sy < 0 ? 0 : sy >= (int64_t)src_h ? (int64_t)src_h - 1 : sy;
            const float *row = inter + (size_t)clamped * row_stride;
            for (int c = 0; c < ch; c++)
                sum[c] += (double)row[(size_t)dx * (size_t)ch + (size_t)c] * w;
            weight_sum += w;
        }

        for (int c = 0; c < ch; c++) {
            double val = sum[c] / weight_sum;
            val = val < 0.0 ? 0.0 : val > 255.0 ? 255.0 : val;
            dst_row[(size_t)dx * (size_t)ch + (size_t)c] = (uint8_t)(val + 0.5);
        }
    }
}

/* ── V-pass multi-thread ─────────────────────────────────────────────────── */

typedef struct {
    const float *inter;
    uint8_t     *dst;
    uint32_t     dy_start;
    uint32_t     dy_end;
    uint32_t     src_h;
    uint32_t     dst_w;
    int          ch;
    float        scale_y;
    float        support_y;
    size_t       row_stride;
    int          use_simd;
} VPassChunk;

static void *v_pass_chunk_run(void *arg) {
    const VPassChunk *c = (const VPassChunk *)arg;
    size_t out_stride = (size_t)c->dst_w * (size_t)c->ch;
#if PICT_SIMD_AVAILABLE
    if (c->use_simd) {
        for (uint32_t dy = c->dy_start; dy < c->dy_end; dy++) {
            pict_v_pass_row_rgba_simd(
                c->inter, c->dst + (size_t)dy * out_stride,
                dy, c->src_h, c->dst_w,
                c->scale_y, c->support_y, c->row_stride);
            PICT_RECORD_SIMD_V();
        }
        return NULL;
    }
#endif
    for (uint32_t dy = c->dy_start; dy < c->dy_end; dy++) {
        v_pass_row_scalar(c->inter, c->dst + (size_t)dy * out_stride,
                          dy, c->src_h, c->dst_w, c->ch,
                          c->scale_y, c->support_y, c->row_stride);
    }
    return NULL;
}

static uint32_t cpu_count(void) {
#ifdef _WIN32
    SYSTEM_INFO si;
    GetSystemInfo(&si);
    return (uint32_t)(si.dwNumberOfProcessors > 0 ? si.dwNumberOfProcessors : 1);
#elif defined(__APPLE__)
    int n = 1;
    size_t sz = sizeof(n);
    sysctlbyname("hw.logicalcpu", &n, &sz, NULL, 0);
    return (uint32_t)(n > 0 ? n : 1);
#else
    long n = sysconf(_SC_NPROCESSORS_ONLN);
    return (uint32_t)(n > 0 ? n : 1);
#endif
}

/* ── Public API ──────────────────────────────────────────────────────────── */

static int pict_resize_lanczos3_impl(
    const uint8_t *src, uint32_t src_w, uint32_t src_h,
    uint8_t       *dst, uint32_t dst_w, uint32_t dst_h,
    int ch, uint32_t n_threads, int force_scalar)
{
    if (!src || !dst) return -1;
    if (src_w == 0 || src_h == 0 || dst_w == 0 || dst_h == 0) return -1;
    if (ch < 1 || ch > 4) return -1;

    float scale_x = (float)dst_w / (float)src_w;
    float scale_y = (float)dst_h / (float)src_h;
    float support_y = 3.0f / (scale_y < 1.0f ? scale_y : 1.0f);
    int use_simd = PICT_SIMD_AVAILABLE && ch == 4 && !force_scalar;

    size_t row_stride = (size_t)dst_w * (size_t)ch;
    float *inter = (float *)malloc((size_t)src_h * row_stride * sizeof(float));
    if (!inter) return -2;

    /* H-pass: dispatch once per image so scalar fallback has no per-row branch. */
#if PICT_SIMD_AVAILABLE
    if (use_simd) {
        for (uint32_t y = 0; y < src_h; y++) {
            pict_h_pass_row_rgba_simd(
                src + (size_t)y * (size_t)src_w * 4u,
                inter + (size_t)y * row_stride,
                src_w, dst_w, scale_x);
            PICT_RECORD_SIMD_H();
        }
    } else
#endif
    {
        for (uint32_t y = 0; y < src_h; y++) {
            h_pass_row_scalar(src + (size_t)y * (size_t)src_w * (size_t)ch,
                              inter + (size_t)y * row_stride,
                              src_w, dst_w, ch, scale_x);
        }
    }

    /* V-pass */
    uint32_t actual_threads = n_threads == 0 ? cpu_count() : n_threads;
    if (actual_threads > dst_h) actual_threads = dst_h;
    if (actual_threads <= 1 || dst_h < 64) {
        /* single-thread */
        size_t out_stride = (size_t)dst_w * (size_t)ch;
#if PICT_SIMD_AVAILABLE
        if (use_simd) {
            for (uint32_t dy = 0; dy < dst_h; dy++) {
                pict_v_pass_row_rgba_simd(
                    inter, dst + (size_t)dy * out_stride,
                    dy, src_h, dst_w,
                    scale_y, support_y, row_stride);
                PICT_RECORD_SIMD_V();
            }
        } else
#endif
        {
            for (uint32_t dy = 0; dy < dst_h; dy++) {
                v_pass_row_scalar(inter, dst + (size_t)dy * out_stride,
                                  dy, src_h, dst_w, ch,
                                  scale_y, support_y, row_stride);
            }
        }
    } else {
        VPassChunk    *chunks  = (VPassChunk    *)malloc(actual_threads * sizeof(VPassChunk));
        pict_thread_t *threads = (pict_thread_t *)malloc(actual_threads * sizeof(pict_thread_t));
        if (!chunks || !threads) {
            free(chunks); free(threads); free(inter); return -2;
        }
        uint32_t rows_per = dst_h / actual_threads;
        for (uint32_t i = 0; i < actual_threads; i++) {
            chunks[i] = (VPassChunk){
                .inter      = inter,
                .dst        = dst,
                .dy_start   = i * rows_per,
                .dy_end     = (i == actual_threads - 1) ? dst_h : (i + 1) * rows_per,
                .src_h      = src_h,
                .dst_w      = dst_w,
                .ch         = ch,
                .scale_y    = scale_y,
                .support_y  = support_y,
                .row_stride = row_stride,
                .use_simd   = use_simd,
            };
        }
        for (uint32_t i = 0; i + 1 < actual_threads; i++)
            PICT_THREAD_CREATE(&threads[i], &chunks[i]);
        v_pass_chunk_run(&chunks[actual_threads - 1]);
        for (uint32_t i = 0; i + 1 < actual_threads; i++)
            PICT_THREAD_JOIN(threads[i]);
        free(chunks);
        free(threads);
    }

    free(inter);
    return 0;
}

int pict_resize_lanczos3(
    const uint8_t *src, uint32_t src_w, uint32_t src_h,
    uint8_t       *dst, uint32_t dst_w, uint32_t dst_h,
    int ch, uint32_t n_threads)
{
    return pict_resize_lanczos3_impl(
        src, src_w, src_h, dst, dst_w, dst_h, ch, n_threads, 0);
}

#ifdef PICT_RESIZE_TESTING
int pict_resize_lanczos3_test_mode(
    const uint8_t *src, uint32_t src_w, uint32_t src_h,
    uint8_t       *dst, uint32_t dst_w, uint32_t dst_h,
    int ch, uint32_t n_threads, int force_scalar)
{
    return pict_resize_lanczos3_impl(
        src, src_w, src_h, dst, dst_w, dst_h, ch, n_threads, force_scalar);
}
#endif
