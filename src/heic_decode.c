/*
 * heic_decode.c — runtime-dlopen bridge for libheif
 *
 * libheif is loaded lazily at first use via dlopen(). If the library is not
 * installed on the user's machine, pict_heic_decode() returns -1 without
 * crashing, and the rest of zenpix continues to work normally.
 *
 * No link-time dependency on libheif — libpict.{dylib,so} does not list
 * libheif in its NEEDED/LC_LOAD_DYLIB entries.
 */

#include <dlfcn.h>
#include <pthread.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* ── Minimal libheif ABI types (stable since libheif 1.x) ─────────────────
 * We define our own to avoid a build-time header dependency.
 * Integer values match the libheif public API. */

typedef struct heif_context     heif_context;
typedef struct heif_image_handle heif_image_handle;
typedef struct heif_image       heif_image;

typedef struct {
    int         code;      /* 0 = heif_error_Ok */
    int         subcode;
    const char *message;
} heif_error_t;

/* heif_colorspace */
#define HEIF_COLORSPACE_RGB       1
/* heif_chroma */
#define HEIF_CHROMA_INTERLEAVED_RGB  10
#define HEIF_CHROMA_INTERLEAVED_RGBA 11
/* heif_channel */
#define HEIF_CHANNEL_INTERLEAVED  10

/* ── Function pointer table ────────────────────────────────────────────── */
typedef struct {
    heif_context*       (*context_alloc)(void);
    void                (*context_free)(heif_context*);
    heif_error_t        (*context_read_from_memory_without_copy)(
                             heif_context*, const void*, size_t, const void*);
    heif_error_t        (*context_get_primary_image_handle)(
                             heif_context*, heif_image_handle**);
    int                 (*image_handle_has_alpha_channel)(const heif_image_handle*);
    heif_error_t        (*decode_image)(
                             const heif_image_handle*, heif_image**,
                             int /*colorspace*/, int /*chroma*/, const void*);
    const uint8_t*      (*image_get_plane_readonly)(
                             const heif_image*, int /*channel*/, int*);
    int                 (*image_handle_get_width)(const heif_image_handle*);
    int                 (*image_handle_get_height)(const heif_image_handle*);
    void                (*image_release)(heif_image*);
    void                (*image_handle_release)(heif_image_handle*);
} HeifFuncs;

static HeifFuncs        g_heif       = {0};
static int              g_available  = 0;
static pthread_once_t   g_once       = PTHREAD_ONCE_INIT;

static void try_load_heif(void) {
    static const char *candidates[] = {
#ifdef __APPLE__
        "libheif.dylib",
        "libheif.1.dylib",
        "/opt/homebrew/lib/libheif.dylib",
        "/usr/local/lib/libheif.dylib",
#else
        "libheif.so.1",
        "libheif.so",
#endif
        NULL,
    };

    void *lib = NULL;
    for (int i = 0; candidates[i]; i++) {
        lib = dlopen(candidates[i], RTLD_LAZY | RTLD_LOCAL);
        if (lib) break;
    }
    if (!lib) return;

#define LOAD(fn) \
    g_heif.fn = (typeof(g_heif.fn))dlsym(lib, "heif_" #fn); \
    if (!g_heif.fn) return;

    LOAD(context_alloc)
    LOAD(context_free)
    LOAD(context_read_from_memory_without_copy)
    LOAD(context_get_primary_image_handle)
    LOAD(image_handle_has_alpha_channel)
    LOAD(decode_image)
    LOAD(image_get_plane_readonly)
    LOAD(image_handle_get_width)
    LOAD(image_handle_get_height)
    LOAD(image_release)
    LOAD(image_handle_release)
#undef LOAD

    g_available = 1;
}

/* ── Public API ─────────────────────────────────────────────────────────── */

int pict_heic_decode(
    const uint8_t *src,
    size_t         src_len,
    uint8_t      **out_data,
    uint32_t      *out_w,
    uint32_t      *out_h,
    uint32_t      *out_ch)
{
    pthread_once(&g_once, try_load_heif);
    if (!g_available) return -1;
    if (!src || !out_data || !out_w || !out_h || !out_ch || src_len == 0) return -1;

    heif_context *ctx = g_heif.context_alloc();
    if (!ctx) return -1;

    heif_error_t err;
    err = g_heif.context_read_from_memory_without_copy(ctx, src, src_len, NULL);
    if (err.code != 0) { g_heif.context_free(ctx); return -1; }

    heif_image_handle *handle = NULL;
    err = g_heif.context_get_primary_image_handle(ctx, &handle);
    if (err.code != 0) { g_heif.context_free(ctx); return -1; }

    int has_alpha = g_heif.image_handle_has_alpha_channel(handle);
    int channels  = has_alpha ? 4 : 3;
    int chroma    = has_alpha ? HEIF_CHROMA_INTERLEAVED_RGBA : HEIF_CHROMA_INTERLEAVED_RGB;

    heif_image *img = NULL;
    err = g_heif.decode_image(handle, &img, HEIF_COLORSPACE_RGB, chroma, NULL);
    if (err.code != 0) {
        g_heif.image_handle_release(handle);
        g_heif.context_free(ctx);
        return -1;
    }

    int stride = 0;
    const uint8_t *plane = g_heif.image_get_plane_readonly(img, HEIF_CHANNEL_INTERLEAVED, &stride);
    if (!plane) {
        g_heif.image_release(img);
        g_heif.image_handle_release(handle);
        g_heif.context_free(ctx);
        return -1;
    }

    int w = g_heif.image_handle_get_width(handle);
    int h = g_heif.image_handle_get_height(handle);

    size_t row_bytes = (size_t)w * (size_t)channels;
    size_t total     = row_bytes * (size_t)h;
    uint8_t *buf = (uint8_t *)malloc(total);
    if (!buf) {
        g_heif.image_release(img);
        g_heif.image_handle_release(handle);
        g_heif.context_free(ctx);
        return -1;
    }

    for (int y = 0; y < h; y++) {
        memcpy(buf + (size_t)y * row_bytes,
               plane + (size_t)y * (size_t)stride,
               row_bytes);
    }

    g_heif.image_release(img);
    g_heif.image_handle_release(handle);
    g_heif.context_free(ctx);

    *out_data = buf;
    *out_w    = (uint32_t)w;
    *out_h    = (uint32_t)h;
    *out_ch   = (uint32_t)channels;
    return 0;
}

void pict_heic_decode_free(uint8_t *data) {
    free(data);
}
