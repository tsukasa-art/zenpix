#pragma once
#include <stdint.h>

/*
 * pict_resize_lanczos3 — Lanczos-3 two-pass separable resize.
 *
 *   src/dst  — tightly-packed, row-major, uint8 pixel buffers.
 *   ch       — channels: 1 (Gray) / 2 (Gray+A) / 3 (RGB) / 4 (RGBA).
 *   n_threads— 0 = auto (cpu count), 1 = single-threaded.
 *
 * Returns  0 on success.
 *         -1 on invalid arguments.
 *         -2 on allocation failure (OOM).
 */
int pict_resize_lanczos3(
    const uint8_t *src, uint32_t src_w, uint32_t src_h,
    uint8_t       *dst, uint32_t dst_w, uint32_t dst_h,
    int ch, uint32_t n_threads);
