/*
 * heic_decode.c — libheif C bridge for HEIC/HEIF decoding
 *
 * Converts HEIC/HEIF bitstream to raw RGB8/RGBA8 pixel data.
 * Decode-only (no encode). HEVC patent applies only to the bitstream;
 * decoding open-source use is accepted practice (VLC, ImageMagick, etc.).
 *
 * Exported symbols:
 *   pict_heic_decode      — decode HEIC bytes → raw pixels (malloc'd)
 *   pict_heic_decode_free — free output from pict_heic_decode
 */

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <libheif/heif.h>

/*
 * Decode HEIC/HEIF bitstream to raw pixel data.
 *
 *   src      — HEIC bitstream bytes
 *   src_len  — byte length of src
 *   out_data — set to newly-allocated pixel buffer (RGB or RGBA, 8-bit, row-major)
 *   out_w    — image width in pixels
 *   out_h    — image height in pixels
 *   out_ch   — channels (3=RGB, 4=RGBA)
 *
 * Returns 0 on success, -1 on failure.
 * On success, *out_data must be freed with pict_heic_decode_free().
 */
int pict_heic_decode(
    const uint8_t *src,
    size_t         src_len,
    uint8_t      **out_data,
    uint32_t      *out_w,
    uint32_t      *out_h,
    uint32_t      *out_ch)
{
    if (!src || !out_data || !out_w || !out_h || !out_ch || src_len == 0) return -1;

    struct heif_context *ctx = heif_context_alloc();
    if (!ctx) return -1;

    struct heif_error err;
    err = heif_context_read_from_memory_without_copy(ctx, src, src_len, NULL);
    if (err.code != heif_error_Ok) {
        heif_context_free(ctx);
        return -1;
    }

    struct heif_image_handle *handle = NULL;
    err = heif_context_get_primary_image_handle(ctx, &handle);
    if (err.code != heif_error_Ok) {
        heif_context_free(ctx);
        return -1;
    }

    int has_alpha = heif_image_handle_has_alpha_channel(handle);
    int channels  = has_alpha ? 4 : 3;
    enum heif_chroma chroma = has_alpha
        ? heif_chroma_interleaved_RGBA
        : heif_chroma_interleaved_RGB;

    struct heif_image *img = NULL;
    err = heif_decode_image(handle, &img, heif_colorspace_RGB, chroma, NULL);
    if (err.code != heif_error_Ok) {
        heif_image_handle_release(handle);
        heif_context_free(ctx);
        return -1;
    }

    int stride = 0;
    const uint8_t *plane = heif_image_get_plane_readonly(img, heif_channel_interleaved, &stride);
    if (!plane) {
        heif_image_release(img);
        heif_image_handle_release(handle);
        heif_context_free(ctx);
        return -1;
    }

    int w = heif_image_handle_get_width(handle);
    int h = heif_image_handle_get_height(handle);

    size_t row_bytes = (size_t)w * (size_t)channels;
    size_t total     = row_bytes * (size_t)h;
    uint8_t *buf = (uint8_t *)malloc(total);
    if (!buf) {
        heif_image_release(img);
        heif_image_handle_release(handle);
        heif_context_free(ctx);
        return -1;
    }

    /* stride may be larger than row_bytes due to alignment padding */
    for (int y = 0; y < h; y++) {
        memcpy(buf + (size_t)y * row_bytes,
               plane + (size_t)y * (size_t)stride,
               row_bytes);
    }

    heif_image_release(img);
    heif_image_handle_release(handle);
    heif_context_free(ctx);

    *out_data = buf;
    *out_w    = (uint32_t)w;
    *out_h    = (uint32_t)h;
    *out_ch   = (uint32_t)channels;
    return 0;
}

void pict_heic_decode_free(uint8_t *data) {
    free(data);
}
