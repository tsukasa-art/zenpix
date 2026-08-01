#pragma once

#include <stddef.h>
#include <stdint.h>

#if defined(_MSC_VER)
#  define PICT_SIMD_NOINLINE __declspec(noinline)
#elif defined(__GNUC__) || defined(__clang__)
#  define PICT_SIMD_NOINLINE __attribute__((noinline))
#else
#  define PICT_SIMD_NOINLINE
#endif

/*
 * Internal RGBA SIMD boundary.
 *
 * Exactly one architecture implementation is compiled when SIMD is enabled.
 * Unsupported architectures compile resize.c without either definition and
 * therefore use the scalar path exclusively.
 */
#if defined(PICT_SIMD_NEON) || defined(PICT_SIMD_SSE2)
#  define PICT_SIMD_AVAILABLE 1

#  ifdef PICT_RESIZE_SIMD_IMPLEMENTATION
static PICT_SIMD_NOINLINE void pict_h_pass_row_rgba_simd(
    const uint8_t *src_row, float *out_row,
    uint32_t src_w, uint32_t dst_w, float scale_x);

static PICT_SIMD_NOINLINE void pict_v_pass_row_rgba_simd(
    const float *inter, uint8_t *dst_row,
    uint32_t dy, uint32_t src_h, uint32_t dst_w,
    float scale_y, float support_y, size_t row_stride);
#  endif
#else
#  define PICT_SIMD_AVAILABLE 0
#endif
