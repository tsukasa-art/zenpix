/*
 * Direct C correctness test for the scalar reference and architecture SIMD
 * paths. The production ABI stays unchanged; test mode exposes an internal
 * force-scalar switch and row counters from the same resize.c source.
 */

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "pict_resize.h"
#include "resize_simd.h"

int pict_resize_lanczos3_test_mode(
    const uint8_t *src, uint32_t src_w, uint32_t src_h,
    uint8_t *dst, uint32_t dst_w, uint32_t dst_h,
    int ch, uint32_t n_threads, int force_scalar);
void pict_resize_test_reset_simd_counts(void);
uint64_t pict_resize_test_simd_h_rows(void);
uint64_t pict_resize_test_simd_v_rows(void);

typedef enum {
    PATTERN_UNIFORM,
    PATTERN_GRADIENT,
    PATTERN_CHECKER,
    PATTERN_RANDOM,
    PATTERN_EDGES,
} Pattern;

typedef struct {
    const char *name;
    uint32_t src_w, src_h, dst_w, dst_h;
    Pattern pattern;
} Case;

static uint32_t rng_state = 0x6d2b79f5u;

static uint8_t next_random_u8(void) {
    uint32_t x = rng_state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    rng_state = x;
    return (uint8_t)(x >> 24);
}

static void fill_pixels(uint8_t *pixels, uint32_t w, uint32_t h, int ch, Pattern pattern) {
    rng_state = 0x6d2b79f5u;
    for (uint32_t y = 0; y < h; y++) {
        for (uint32_t x = 0; x < w; x++) {
            size_t base = ((size_t)y * w + x) * (size_t)ch;
            for (int c = 0; c < ch; c++) {
                uint8_t value;
                switch (pattern) {
                case PATTERN_UNIFORM:
                    value = (uint8_t)(37 + c * 53);
                    break;
                case PATTERN_GRADIENT:
                    value = (uint8_t)((x * (17u + (uint32_t)c * 5u) +
                                       y * (29u + (uint32_t)c * 7u) +
                                       (uint32_t)c * 41u) & 255u);
                    break;
                case PATTERN_CHECKER:
                    value = (uint8_t)((((x / 2u) + (y / 3u) + (uint32_t)c) & 1u) ? 255 : 0);
                    break;
                case PATTERN_RANDOM:
                    value = next_random_u8();
                    break;
                case PATTERN_EDGES:
                    if (x == 0 || y == 0 || x + 1 == w || y + 1 == h)
                        value = (uint8_t)(255u - (uint32_t)c * 47u);
                    else
                        value = (uint8_t)((uint32_t)c * 31u);
                    break;
                default:
                    value = 0;
                }
                pixels[base + (size_t)c] = value;
            }
        }
    }
}

static int compare_buffers(
    const char *label, const uint8_t *scalar, const uint8_t *simd, size_t len)
{
    size_t diff0 = 0, diff1 = 0, diff_over = 0;
    unsigned max_diff = 0;
    size_t max_index = 0;
    for (size_t i = 0; i < len; i++) {
        unsigned d = scalar[i] > simd[i] ? scalar[i] - simd[i] : simd[i] - scalar[i];
        if (d == 0) diff0++;
        else if (d == 1) diff1++;
        else diff_over++;
        if (d > max_diff) { max_diff = d; max_index = i; }
    }

    printf("%s max_diff=%u diff0=%zu diff1=%zu diff_gt1=%zu\n",
           label, max_diff, diff0, diff1, diff_over);
    if (max_diff > 1) {
        fprintf(stderr,
                "FAIL: %s exceeded +/-1 LSB at byte %zu (scalar=%u simd=%u)\n",
                label, max_index, scalar[max_index], simd[max_index]);
        return 1;
    }
    return 0;
}

static int run_rgba_case(const Case *tc, uint32_t threads) {
    size_t src_len = (size_t)tc->src_w * tc->src_h * 4u;
    size_t dst_len = (size_t)tc->dst_w * tc->dst_h * 4u;
    uint8_t *src = (uint8_t *)malloc(src_len);
    uint8_t *scalar = (uint8_t *)malloc(dst_len);
    uint8_t *simd = (uint8_t *)malloc(dst_len);
    if (!src || !scalar || !simd) {
        free(src); free(scalar); free(simd);
        fprintf(stderr, "FAIL: allocation in %s\n", tc->name);
        return 1;
    }

    fill_pixels(src, tc->src_w, tc->src_h, 4, tc->pattern);
    int scalar_rc = pict_resize_lanczos3_test_mode(
        src, tc->src_w, tc->src_h, scalar, tc->dst_w, tc->dst_h, 4, threads, 1);
    pict_resize_test_reset_simd_counts();
    int simd_rc = pict_resize_lanczos3_test_mode(
        src, tc->src_w, tc->src_h, simd, tc->dst_w, tc->dst_h, 4, threads, 0);

    char label[160];
    snprintf(label, sizeof(label), "%s threads=%u %ux%u->%ux%u",
             tc->name, threads, tc->src_w, tc->src_h, tc->dst_w, tc->dst_h);
    int failed = 0;
    if (scalar_rc != 0 || simd_rc != 0) {
        fprintf(stderr, "FAIL: %s rc scalar=%d simd=%d\n", label, scalar_rc, simd_rc);
        failed = 1;
    } else {
        failed = compare_buffers(label, scalar, simd, dst_len);
    }

#if PICT_SIMD_AVAILABLE
    uint64_t h_rows = pict_resize_test_simd_h_rows();
    uint64_t v_rows = pict_resize_test_simd_v_rows();
    if (h_rows != tc->src_h || v_rows != tc->dst_h) {
        fprintf(stderr,
                "FAIL: %s SIMD path counts H=%llu/%u V=%llu/%u\n",
                label, (unsigned long long)h_rows, tc->src_h,
                (unsigned long long)v_rows, tc->dst_h);
        failed = 1;
    }
#else
    if (pict_resize_test_simd_h_rows() != 0 || pict_resize_test_simd_v_rows() != 0) {
        fprintf(stderr, "FAIL: %s scalar build recorded SIMD use\n", label);
        failed = 1;
    }
#endif

    free(src); free(scalar); free(simd);
    return failed;
}

static int run_rgb_fallback(void) {
    const uint32_t sw = 61, sh = 67, dw = 29, dh = 73;
    size_t src_len = (size_t)sw * sh * 3u;
    size_t dst_len = (size_t)dw * dh * 3u;
    uint8_t *src = (uint8_t *)malloc(src_len);
    uint8_t *scalar = (uint8_t *)malloc(dst_len);
    uint8_t *automatic = (uint8_t *)malloc(dst_len);
    if (!src || !scalar || !automatic) {
        free(src); free(scalar); free(automatic);
        return 1;
    }
    fill_pixels(src, sw, sh, 3, PATTERN_RANDOM);
    int rc1 = pict_resize_lanczos3_test_mode(src, sw, sh, scalar, dw, dh, 3, 1, 1);
    pict_resize_test_reset_simd_counts();
    int rc2 = pict_resize_lanczos3_test_mode(src, sw, sh, automatic, dw, dh, 3, 4, 0);
    int failed = rc1 != 0 || rc2 != 0 || memcmp(scalar, automatic, dst_len) != 0;
    if (pict_resize_test_simd_h_rows() != 0 || pict_resize_test_simd_v_rows() != 0)
        failed = 1;
    printf("RGB scalar fallback exact=%s SIMD_rows=%llu/%llu\n",
           failed ? "no" : "yes",
           (unsigned long long)pict_resize_test_simd_h_rows(),
           (unsigned long long)pict_resize_test_simd_v_rows());
    free(src); free(scalar); free(automatic);
    return failed;
}

int main(void) {
    const Case cases[] = {
        {"downscale-gradient", 73, 59, 19, 13, PATTERN_GRADIENT},
        {"upscale-checker", 11, 9, 37, 31, PATTERN_CHECKER},
        {"identity-random", 23, 17, 23, 17, PATTERN_RANDOM},
        {"uniform-tall", 32, 20, 7, 71, PATTERN_UNIFORM},
        {"edge-clamp-upscale", 3, 2, 41, 67, PATTERN_EDGES},
        {"multithread-random", 101, 83, 67, 79, PATTERN_RANDOM},
    };

    int failed = 0;
    printf("backend=%s\n",
#if defined(PICT_SIMD_NEON)
           "NEON"
#elif defined(PICT_SIMD_SSE2)
           "SSE2"
#else
           "scalar"
#endif
    );
    for (size_t i = 0; i < sizeof(cases) / sizeof(cases[0]); i++) {
        failed += run_rgba_case(&cases[i], 1);
        failed += run_rgba_case(&cases[i], 4);
    }
    failed += run_rgb_fallback();

    if (failed) {
        fprintf(stderr, "%d resize SIMD correctness check(s) failed\n", failed);
        return 1;
    }
    printf("All resize SIMD correctness checks passed.\n");
    return 0;
}
