/*
 * pict.c — top-level FFI entry points for libpict
 *
 * Mirrors the ABI exported by the Zig-based libpict (root.zig).
 * All returned buffers must be freed with pict_free_buffer(ptr, len).
 *
 * Memory contract:
 *   - All returned pixel/encoded buffers are malloc'd.
 *   - Caller frees with pict_free_buffer(ptr, len).
 *   - On failure, returns NULL and leaves out_len unchanged.
 */

#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

/* ── Codec bridge declarations ───────────────────────────────────────────── */

/* jpeg_decode.c */
int pict_jpeg_decode(
    const unsigned char *src, unsigned long src_len,
    unsigned char **out_data, unsigned int *out_width, unsigned int *out_height,
    unsigned int *out_channels, unsigned char **out_icc, unsigned int *out_icc_len);
void pict_jpeg_free(unsigned char *data);
void pict_jpeg_icc_free(unsigned char *icc);
unsigned char pict_jpeg_orientation(const unsigned char *data, unsigned long len);

/* png_decode.c */
int pict_png_decode(
    const unsigned char *src, size_t src_len,
    unsigned char **out_data, unsigned int *out_width, unsigned int *out_height,
    unsigned int *out_channels, unsigned char **out_icc, size_t *out_icc_len);
int pict_png_encode(
    const unsigned char *pixels, unsigned int width, unsigned int height,
    unsigned int channels, int compression,
    const unsigned char *icc, size_t icc_len,
    unsigned char **out_png, size_t *out_len);
void pict_png_free(unsigned char *data);

/* webp_decode.c */
int pict_webp_decode(
    const unsigned char *src, size_t src_len,
    unsigned char **out_data, unsigned int *out_width, unsigned int *out_height,
    unsigned int *out_channels, unsigned char **out_icc, size_t *out_icc_len);
void pict_webp_decode_free(unsigned char *data);
void pict_webp_icc_free(unsigned char *icc);

/* webp_encode.c */
int pict_webp_encode(
    const uint8_t *pixels, int width, int height, int channels,
    float quality, int lossless,
    uint8_t **out_data, size_t *out_size);
int pict_webp_encode_with_icc(
    const uint8_t *pixels, int width, int height, int channels,
    float quality, int lossless,
    const uint8_t *icc, unsigned int icc_len,
    uint8_t **out_data, size_t *out_size);
void pict_webp_free(uint8_t *data);

/* avif_decode.c */
int pict_avif_decode(
    const uint8_t *src, size_t src_len,
    uint8_t **out_data, uint32_t *out_width, uint32_t *out_height,
    uint32_t *out_channels, uint8_t **out_icc, size_t *out_icc_len);
void pict_avif_decode_free(uint8_t *data);
void pict_avif_icc_free(uint8_t *icc);

/* avif_encode.c */
int pict_avif_encode(
    const uint8_t *pixels, uint32_t width, uint32_t height, int channels,
    int quality, int speed, int threads,
    const uint8_t *icc, size_t icc_len,
    uint8_t **out_data, size_t *out_size);
void pict_avif_free(uint8_t *data);

/* gif_decode.c */
int pict_gif_decode(
    const uint8_t *src, size_t src_len,
    uint8_t **out_data, uint32_t *out_width, uint32_t *out_height);
void pict_gif_decode_free(uint8_t *data);

/* heic_decode.c */
int pict_heic_decode(
    const uint8_t *src, size_t src_len,
    uint8_t **out_data, uint32_t *out_width, uint32_t *out_height, int *out_channels);
void pict_heic_decode_free(uint8_t *data);

/* resize.c */
int pict_resize_lanczos3(
    const uint8_t *src, uint32_t src_w, uint32_t src_h,
    uint8_t *dst, uint32_t dst_w, uint32_t dst_h,
    int ch, uint32_t n_threads);

/* ── Format detection ────────────────────────────────────────────────────── */

typedef enum {
    FMT_UNKNOWN = 0,
    FMT_JPEG,
    FMT_PNG,
    FMT_WEBP,
    FMT_AVIF,
    FMT_HEIC,
    FMT_GIF,
} ImageFormat;

static ImageFormat detect_format(const uint8_t *data, size_t len) {
    if (!data || len < 4) return FMT_UNKNOWN;
    /* JPEG: FF D8 FF */
    if (len >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF)
        return FMT_JPEG;
    /* PNG: 89 50 4E 47 */
    if (len >= 4 && data[0] == 0x89 && data[1] == 'P' && data[2] == 'N' && data[3] == 'G')
        return FMT_PNG;
    /* WebP: RIFF????WEBP */
    if (len >= 12 && data[0]=='R' && data[1]=='I' && data[2]=='F' && data[3]=='F' &&
        data[8]=='W' && data[9]=='E' && data[10]=='B' && data[11]=='P')
        return FMT_WEBP;
    /* GIF: GIF87a / GIF89a */
    if (len >= 6 && data[0]=='G' && data[1]=='I' && data[2]=='F' &&
        data[3]=='8' && (data[4]=='7' || data[4]=='9') && data[5]=='a')
        return FMT_GIF;
    /* AVIF / HEIC: ISO Base Media File Format ftyp box */
    if (len >= 12) {
        /* ftyp box starts at byte 4 */
        if (data[4]=='f' && data[5]=='t' && data[6]=='y' && data[7]=='p') {
            const char *brand = (const char *)(data + 8);
            /* AVIF brands: avif, avis */
            if (strncmp(brand, "avif", 4) == 0 || strncmp(brand, "avis", 4) == 0)
                return FMT_AVIF;
            /* HEIC brands: heic, heix, hevc, hevx, mif1, msf1 */
            if (strncmp(brand, "heic", 4) == 0 || strncmp(brand, "heix", 4) == 0 ||
                strncmp(brand, "hevc", 4) == 0 || strncmp(brand, "hevx", 4) == 0 ||
                strncmp(brand, "mif1", 4) == 0 || strncmp(brand, "msf1", 4) == 0)
                return FMT_HEIC;
        }
    }
    return FMT_UNKNOWN;
}

/* ── Overflow-safe multiply ──────────────────────────────────────────────── */

static int mul3_checked(size_t a, size_t b, size_t c, size_t *result) {
    if (b != 0 && a > SIZE_MAX / b) return -1;
    size_t ab = a * b;
    if (c != 0 && ab > SIZE_MAX / c) return -1;
    *result = ab * c;
    return 0;
}

/* ── Decode (v3) — format detection + ICC passthrough ───────────────────── */

uint8_t *pict_decode_v3(
    const uint8_t *data, size_t len,
    uint32_t *out_w, uint32_t *out_h, uint8_t *out_ch, size_t *out_len,
    uint8_t **out_icc, size_t *out_icc_len)
{
    if (!data || !out_w || !out_h || !out_ch || !out_len) return NULL;
    /* out_icc and out_icc_len must both be provided or both NULL */
    if ((out_icc == NULL) != (out_icc_len == NULL)) return NULL;
    int want_icc = out_icc != NULL;
    if (want_icc) { *out_icc = NULL; *out_icc_len = 0; }

    ImageFormat fmt = detect_format(data, len);
    uint8_t *pixels = NULL;
    unsigned int w = 0, h = 0, ch = 0;
    unsigned char *icc = NULL;

    switch (fmt) {
    case FMT_JPEG: {
        unsigned int icc_len32 = 0;
        int rc = pict_jpeg_decode(data, (unsigned long)len, &pixels, &w, &h, &ch,
                                  want_icc ? &icc : NULL,
                                  want_icc ? &icc_len32 : NULL);
        if (rc != 0 || !pixels) return NULL;
        if (want_icc && icc) { *out_icc = icc; *out_icc_len = icc_len32; }
        break;
    }
    case FMT_PNG: {
        size_t icc_len_sz = 0;
        int rc = pict_png_decode(data, len, &pixels, &w, &h, &ch,
                                 want_icc ? &icc : NULL,
                                 want_icc ? &icc_len_sz : NULL);
        if (rc != 0 || !pixels) return NULL;
        if (want_icc && icc) { *out_icc = icc; *out_icc_len = icc_len_sz; }
        break;
    }
    case FMT_WEBP: {
        size_t icc_len_sz = 0;
        int rc = pict_webp_decode(data, len, &pixels, &w, &h, &ch,
                                  want_icc ? &icc : NULL,
                                  want_icc ? &icc_len_sz : NULL);
        if (rc != 0 || !pixels) return NULL;
        if (want_icc && icc) { *out_icc = icc; *out_icc_len = icc_len_sz; }
        break;
    }
    case FMT_AVIF: {
        uint32_t w32 = 0, h32 = 0, ch32 = 0;
        size_t icc_len_sz = 0;
        int rc = pict_avif_decode(data, len, &pixels, &w32, &h32, &ch32,
                                  want_icc ? &icc : NULL,
                                  want_icc ? &icc_len_sz : NULL);
        if (rc != 0 || !pixels) return NULL;
        w = w32; h = h32; ch = (unsigned int)ch32;
        if (want_icc && icc) { *out_icc = icc; *out_icc_len = icc_len_sz; }
        break;
    }
    case FMT_GIF: {
        uint32_t gw = 0, gh = 0;
        int rc = pict_gif_decode(data, len, &pixels, &gw, &gh);
        if (rc != 0 || !pixels) return NULL;
        w = gw; h = gh; ch = 3; /* gif_decode always outputs RGB */
        break;
    }
    case FMT_HEIC: {
        uint32_t w32 = 0, h32 = 0; int ich = 0;
        int rc = pict_heic_decode(data, len, &pixels, &w32, &h32, &ich);
        if (rc != 0 || !pixels) return NULL;
        w = w32; h = h32; ch = (unsigned int)ich;
        break;
    }
    default:
        return NULL;
    }

    size_t pixel_size;
    if (mul3_checked(w, h, ch, &pixel_size) != 0) { free(pixels); return NULL; }

    *out_w   = w;
    *out_h   = h;
    *out_ch  = (uint8_t)ch;
    *out_len = pixel_size;
    return pixels;
}

/* v2: same as v3 without ICC */
uint8_t *pict_decode_v2(
    const uint8_t *data, size_t len,
    uint32_t *out_w, uint32_t *out_h, uint8_t *out_ch, size_t *out_len)
{
    return pict_decode_v3(data, len, out_w, out_h, out_ch, out_len, NULL, NULL);
}

/* v1 (deprecated): no out_len */
uint8_t *pict_decode(
    const uint8_t *data, size_t len,
    uint32_t *out_w, uint32_t *out_h, uint8_t *out_ch)
{
    size_t tmp = 0;
    return pict_decode_v2(data, len, out_w, out_h, out_ch, &tmp);
}

/* ── Resize ──────────────────────────────────────────────────────────────── */

uint8_t *pict_resize(
    const uint8_t *src,
    uint32_t src_w, uint32_t src_h, uint8_t channels,
    uint32_t dst_w, uint32_t dst_h, uint32_t n_threads,
    size_t *out_len)
{
    if (!src || !out_len) return NULL;
    if (src_w == 0 || src_h == 0 || dst_w == 0 || dst_h == 0 || channels == 0) return NULL;

    size_t dst_size;
    if (mul3_checked(dst_w, dst_h, channels, &dst_size) != 0) return NULL;

    uint8_t *dst = (uint8_t *)malloc(dst_size);
    if (!dst) return NULL;

    if (pict_resize_lanczos3(src, src_w, src_h, dst, dst_w, dst_h, channels, n_threads) != 0) {
        free(dst);
        return NULL;
    }
    *out_len = dst_size;
    return dst;
}

/* pict_resize_v2: adds fit modes (0=stretch, 1=contain, 2=cover) */
uint8_t *pict_resize_v2(
    const uint8_t *src,
    uint32_t src_w, uint32_t src_h, uint8_t channels,
    uint32_t dst_w, uint32_t dst_h, uint8_t fit, uint32_t n_threads,
    uint32_t *out_actual_w, uint32_t *out_actual_h, size_t *out_len)
{
    if (!src || !out_len) return NULL;
    if (src_w == 0 || src_h == 0 || dst_w == 0 || dst_h == 0 || channels == 0) return NULL;

    uint32_t actual_w = dst_w, actual_h = dst_h;
    uint32_t scaled_w = dst_w, scaled_h = dst_h;

    if (fit == 1) { /* contain */
        double sx = (double)dst_w / src_w, sy = (double)dst_h / src_h;
        double s = sx < sy ? sx : sy;
        actual_w = scaled_w = (uint32_t)round((double)src_w * s);
        actual_h = scaled_h = (uint32_t)round((double)src_h * s);
        if (actual_w < 1) actual_w = scaled_w = 1;
        if (actual_h < 1) actual_h = scaled_h = 1;
    } else if (fit == 2) { /* cover */
        double sx = (double)dst_w / src_w, sy = (double)dst_h / src_h;
        double s = sx > sy ? sx : sy;
        scaled_w = (uint32_t)round((double)src_w * s);
        scaled_h = (uint32_t)round((double)src_h * s);
        if (scaled_w < dst_w) scaled_w = dst_w;
        if (scaled_h < dst_h) scaled_h = dst_h;
    }

    size_t src_size;
    if (mul3_checked(src_w, src_h, channels, &src_size) != 0) return NULL;

    if (fit == 2 && (scaled_w != actual_w || scaled_h != actual_h)) {
        /* cover: scale to intermediate, then center-crop */
        size_t mid_size;
        if (mul3_checked(scaled_w, scaled_h, channels, &mid_size) != 0) return NULL;
        uint8_t *mid = (uint8_t *)malloc(mid_size);
        if (!mid) return NULL;
        if (pict_resize_lanczos3(src, src_w, src_h, mid, scaled_w, scaled_h, channels, n_threads) != 0) {
            free(mid); return NULL;
        }
        uint32_t crop_left = (scaled_w - actual_w) / 2;
        uint32_t crop_top  = (scaled_h - actual_h) / 2;
        size_t dst_size;
        if (mul3_checked(actual_w, actual_h, channels, &dst_size) != 0) { free(mid); return NULL; }
        uint8_t *dst = (uint8_t *)malloc(dst_size);
        if (!dst) { free(mid); return NULL; }
        size_t ch = channels;
        for (uint32_t y = 0; y < actual_h; y++) {
            size_t src_off = ((size_t)(crop_top + y) * scaled_w + crop_left) * ch;
            size_t dst_off = (size_t)y * actual_w * ch;
            memcpy(dst + dst_off, mid + src_off, actual_w * ch);
        }
        free(mid);
        if (out_actual_w) *out_actual_w = actual_w;
        if (out_actual_h) *out_actual_h = actual_h;
        *out_len = dst_size;
        return dst;
    }

    /* stretch / contain */
    size_t dst_size;
    if (mul3_checked(actual_w, actual_h, channels, &dst_size) != 0) return NULL;
    uint8_t *dst = (uint8_t *)malloc(dst_size);
    if (!dst) return NULL;
    if (pict_resize_lanczos3(src, src_w, src_h, dst, actual_w, actual_h, channels, n_threads) != 0) {
        free(dst); return NULL;
    }
    if (out_actual_w) *out_actual_w = actual_w;
    if (out_actual_h) *out_actual_h = actual_h;
    *out_len = dst_size;
    return dst;
}

/* ── Encode ──────────────────────────────────────────────────────────────── */

uint8_t *pict_encode_webp_v2(
    const uint8_t *pixels, uint32_t width, uint32_t height, uint8_t channels,
    float quality, int lossless,
    const uint8_t *icc, size_t icc_len, size_t *out_len)
{
    if (!pixels || !out_len || width == 0 || height == 0 || channels == 0) return NULL;
    uint8_t *out = NULL;
    size_t sz = 0;
    int rc;
    if (icc != NULL && icc_len > 0) {
        rc = pict_webp_encode_with_icc(pixels, (int)width, (int)height, (int)channels,
                                       quality, lossless,
                                       icc, (unsigned int)icc_len, &out, &sz);
    } else {
        rc = pict_webp_encode(pixels, (int)width, (int)height, (int)channels,
                              quality, lossless, &out, &sz);
    }
    if (rc != 0 || !out) return NULL;
    *out_len = sz;
    return out;
}

uint8_t *pict_encode_webp(
    const uint8_t *pixels, uint32_t width, uint32_t height, uint8_t channels,
    float quality, int lossless, size_t *out_len)
{
    return pict_encode_webp_v2(pixels, width, height, channels, quality, lossless, NULL, 0, out_len);
}

uint8_t *pict_encode_avif(
    const uint8_t *pixels, uint32_t width, uint32_t height, uint8_t channels,
    uint8_t quality, uint8_t speed, uint8_t threads, size_t *out_len)
{
    if (!pixels || !out_len || width == 0 || height == 0) return NULL;
    if (channels != 3 && channels != 4) return NULL;
    if (quality > 100 || speed > 10) return NULL;
    uint8_t *out = NULL;
    size_t sz = 0;
    if (pict_avif_encode(pixels, width, height, channels, quality, speed, threads,
                         NULL, 0, &out, &sz) != 0 || !out)
        return NULL;
    *out_len = sz;
    return out;
}

uint8_t *pict_encode_png(
    const uint8_t *pixels, uint32_t width, uint32_t height, uint8_t channels,
    uint8_t compression, const uint8_t *icc, size_t icc_len, size_t *out_len)
{
    if (!pixels || !out_len || width == 0 || height == 0) return NULL;
    if (channels != 3 && channels != 4) return NULL;
    uint8_t *out = NULL;
    size_t sz = 0;
    if (pict_png_encode(pixels, width, height, channels, compression,
                        icc, icc_len, &out, &sz) != 0 || !out)
        return NULL;
    *out_len = sz;
    return out;
}

/* ── Crop ────────────────────────────────────────────────────────────────── */

uint8_t *pict_crop(
    const uint8_t *pixels,
    uint32_t src_w, uint32_t src_h, uint8_t channels,
    uint32_t left, uint32_t top, uint32_t crop_w, uint32_t crop_h,
    size_t *out_len)
{
    if (!pixels || !out_len) return NULL;
    if (src_w == 0 || src_h == 0 || channels == 0) return NULL;
    if (crop_w == 0 || crop_h == 0) return NULL;
    if ((uint64_t)left + crop_w > src_w || (uint64_t)top + crop_h > src_h) return NULL;

    size_t dst_size;
    if (mul3_checked(crop_w, crop_h, channels, &dst_size) != 0) return NULL;
    uint8_t *dst = (uint8_t *)malloc(dst_size);
    if (!dst) return NULL;

    size_t ch = channels;
    for (uint32_t y = 0; y < crop_h; y++) {
        size_t src_off = ((size_t)(top + y) * src_w + left) * ch;
        size_t dst_off = (size_t)y * crop_w * ch;
        memcpy(dst + dst_off, pixels + src_off, crop_w * ch);
    }
    *out_len = dst_size;
    return dst;
}

/* ── Rotate (EXIF orientation 1-8) ──────────────────────────────────────── */

uint8_t *pict_rotate(
    const uint8_t *pixels,
    uint32_t src_w, uint32_t src_h, uint8_t channels,
    uint8_t orientation,
    uint32_t *out_w, uint32_t *out_h, size_t *out_len)
{
    if (!pixels || !out_w || !out_h || !out_len) return NULL;
    if (orientation == 1 || orientation > 8) return NULL;
    if (src_w == 0 || src_h == 0 || channels == 0) return NULL;
    if (channels != 3 && channels != 4) return NULL;

    /* orientation 5-8 transpose (swap w/h); 2-4,6-8 mirror/rotate */
    int transpose = (orientation >= 5);
    uint32_t dw = transpose ? src_h : src_w;
    uint32_t dh = transpose ? src_w : src_h;
    size_t ch = channels;

    size_t dst_size;
    if (mul3_checked(dw, dh, ch, &dst_size) != 0) return NULL;
    uint8_t *dst = (uint8_t *)malloc(dst_size);
    if (!dst) return NULL;

    for (uint32_t sy = 0; sy < src_h; sy++) {
        for (uint32_t sx = 0; sx < src_w; sx++) {
            const uint8_t *sp = pixels + ((size_t)sy * src_w + sx) * ch;
            uint32_t dx, dy;
            switch (orientation) {
            case 2: dx = src_w - 1 - sx; dy = sy; break;
            case 3: dx = src_w - 1 - sx; dy = src_h - 1 - sy; break;
            case 4: dx = sx; dy = src_h - 1 - sy; break;
            case 5: dx = sy; dy = sx; break;
            case 6: dx = src_h - 1 - sy; dy = sx; break;
            case 7: dx = src_h - 1 - sy; dy = src_w - 1 - sx; break;
            case 8: dx = sy; dy = src_w - 1 - sx; break;
            default: dx = sx; dy = sy; break;
            }
            uint8_t *dp = dst + ((size_t)dy * dw + dx) * ch;
            memcpy(dp, sp, ch);
        }
    }
    *out_w = dw;
    *out_h = dh;
    *out_len = dst_size;
    return dst;
}

/* ── Background removal (BFS flood-fill from corners) ───────────────────── */

uint8_t *pict_remove_background(
    const uint8_t *pixels, uint32_t width, uint32_t height,
    uint8_t channels, uint8_t threshold, size_t *out_len)
{
    if (!pixels || !out_len) return NULL;
    if (width == 0 || height == 0) return NULL;
    if (channels != 3 && channels != 4) return NULL;

    size_t n = (size_t)width * height;
    size_t dst_size = n * 4;
    uint8_t *dst = (uint8_t *)malloc(dst_size);
    if (!dst) return NULL;

    /* Copy src to RGBA dst, alpha = 255 initially */
    for (size_t i = 0; i < n; i++) {
        dst[i * 4 + 0] = pixels[i * channels + 0];
        dst[i * 4 + 1] = pixels[i * channels + 1];
        dst[i * 4 + 2] = pixels[i * channels + 2];
        dst[i * 4 + 3] = (channels == 4) ? pixels[i * channels + 3] : 255;
    }

    uint8_t limit = (uint8_t)(255 - threshold);
    uint8_t *visited = (uint8_t *)calloc(n, 1);
    if (!visited) { free(dst); return NULL; }

    /* BFS queue (worst case: all pixels) */
    uint32_t *queue = (uint32_t *)malloc(n * sizeof(uint32_t));
    if (!queue) { free(visited); free(dst); return NULL; }

    size_t head = 0, tail = 0;

#define ENQUEUE(idx) do { \
    if (!(visited[idx])) { \
        visited[idx] = 1; \
        queue[tail++] = (uint32_t)(idx); \
    } \
} while (0)

    /* Seed from four corners */
    ENQUEUE(0);
    ENQUEUE(width - 1);
    ENQUEUE((size_t)(height - 1) * width);
    ENQUEUE((size_t)(height - 1) * width + width - 1);

    while (head < tail) {
        uint32_t idx = queue[head++];
        uint32_t x = idx % width, y = idx / width;
        uint8_t r = dst[idx * 4 + 0];
        uint8_t g = dst[idx * 4 + 1];
        uint8_t b = dst[idx * 4 + 2];
        if (r < limit || g < limit || b < limit) continue;
        /* White-like: make transparent */
        dst[idx * 4 + 3] = 0;
        /* Enqueue 4-neighbors */
        if (x > 0)           ENQUEUE(idx - 1);
        if (x + 1 < width)   ENQUEUE(idx + 1);
        if (y > 0)           ENQUEUE(idx - width);
        if (y + 1 < height)  ENQUEUE(idx + width);
    }
#undef ENQUEUE

    free(queue);
    free(visited);
    *out_len = dst_size;
    return dst;
}

/* ── Round corners ───────────────────────────────────────────────────────── */

uint8_t *pict_round_corners(
    const uint8_t *pixels, uint32_t width, uint32_t height,
    uint32_t radius, size_t *out_len)
{
    if (!pixels || !out_len) return NULL;
    if (width == 0 || height == 0) return NULL;

    size_t dst_size = (size_t)width * height * 4;
    uint8_t *dst = (uint8_t *)malloc(dst_size);
    if (!dst) return NULL;
    memcpy(dst, pixels, dst_size);

    if (radius == 0) { *out_len = dst_size; return dst; }

    for (uint32_t y = 0; y < height; y++) {
        for (uint32_t x = 0; x < width; x++) {
            /* Distance from nearest corner */
            uint32_t cx = (x < radius) ? radius : (x + radius >= width ? width - 1 - radius + radius : width);
            uint32_t cy = (y < radius) ? radius : (y + radius >= height ? height - 1 - radius + radius : height);

            int in_corner = 0;
            uint32_t corner_x = 0, corner_y = 0;
            if (x < radius && y < radius) {
                in_corner = 1; corner_x = radius; corner_y = radius;
            } else if (x + radius >= width && y < radius) {
                in_corner = 1; corner_x = width - 1 - radius; corner_y = radius;
            } else if (x < radius && y + radius >= height) {
                in_corner = 1; corner_x = radius; corner_y = height - 1 - radius;
            } else if (x + radius >= width && y + radius >= height) {
                in_corner = 1; corner_x = width - 1 - radius; corner_y = height - 1 - radius;
            }
            (void)cx; (void)cy;

            if (in_corner) {
                int dx = (int)x - (int)corner_x;
                int dy = (int)y - (int)corner_y;
                if ((double)dx*dx + (double)dy*dy > (double)radius*radius)
                    dst[((size_t)y * width + x) * 4 + 3] = 0;
            }
        }
    }
    *out_len = dst_size;
    return dst;
}

/* ── Free buffer ─────────────────────────────────────────────────────────── */

void pict_free_buffer(uint8_t *ptr, size_t len) {
    (void)len;
    free(ptr);
}
