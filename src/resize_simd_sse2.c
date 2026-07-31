/* x86_64 SSE2 RGBA kernels for the Lanczos-3 H-pass and V-pass. */

#include "resize_simd.h"

#include <emmintrin.h>
#include <math.h>
#include <string.h>

#define PICT_PI_F 3.14159265358979323846f

static float simd_lanczos_kernel(float x) {
    float ax = fabsf(x);
    if (ax == 0.0f) return 1.0f;
    if (ax >= 3.0f) return 0.0f;
    float pi_x = PICT_PI_F * x;
    float pi_x_a = PICT_PI_F * x / 3.0f;
    return (sinf(pi_x) / pi_x) * (sinf(pi_x_a) / pi_x_a);
}

static __m128 load_rgba_u8_as_f32(const uint8_t *pixel) {
    uint32_t packed;
    memcpy(&packed, pixel, sizeof(packed));
    __m128i bytes = _mm_cvtsi32_si128((int)packed);
    __m128i u16 = _mm_unpacklo_epi8(bytes, _mm_setzero_si128());
    __m128i u32 = _mm_unpacklo_epi16(u16, _mm_setzero_si128());
    return _mm_cvtepi32_ps(u32);
}

static void store_rgba_f32_as_u8(uint8_t *pixel, __m128 value) {
    value = _mm_max_ps(value, _mm_setzero_ps());
    value = _mm_min_ps(value, _mm_set1_ps(255.0f));
    __m128i u32 = _mm_cvttps_epi32(_mm_add_ps(value, _mm_set1_ps(0.5f)));
    __m128i u16 = _mm_packs_epi32(u32, _mm_setzero_si128());
    __m128i u8 = _mm_packus_epi16(u16, _mm_setzero_si128());
    uint32_t packed = (uint32_t)_mm_cvtsi128_si32(u8);
    memcpy(pixel, &packed, sizeof(packed));
}

static PICT_SIMD_NOINLINE void pict_h_pass_row_rgba_simd(
    const uint8_t *src_row, float *out_row,
    uint32_t src_w, uint32_t dst_w, float scale_x)
{
    float filter_scale = scale_x < 1.0f ? scale_x : 1.0f;
    float support = 3.0f / filter_scale;

    for (uint32_t dx = 0; dx < dst_w; dx++) {
        float sx_center = ((float)dx + 0.5f) / scale_x - 0.5f;
        int64_t sx_min = (int64_t)floorf(sx_center - support);
        int64_t sx_max = (int64_t)ceilf(sx_center + support);
        __m128 sum = _mm_setzero_ps();
        float weight_sum = 0.0f;

        for (int64_t sx = sx_min; sx <= sx_max; sx++) {
            float w = simd_lanczos_kernel(((float)sx - sx_center) * filter_scale);
            if (w == 0.0f) continue;
            int64_t clamped = sx < 0 ? 0 : sx >= (int64_t)src_w ? (int64_t)src_w - 1 : sx;
            __m128 pixel = load_rgba_u8_as_f32(src_row + (size_t)clamped * 4u);
            sum = _mm_add_ps(sum, _mm_mul_ps(pixel, _mm_set1_ps(w)));
            weight_sum += w;
        }

        _mm_storeu_ps(out_row + (size_t)dx * 4u,
                      _mm_mul_ps(sum, _mm_set1_ps(1.0f / weight_sum)));
    }
}

static PICT_SIMD_NOINLINE void pict_v_pass_row_rgba_simd(
    const float *inter, uint8_t *dst_row,
    uint32_t dy, uint32_t src_h, uint32_t dst_w,
    float scale_y, float support_y, size_t row_stride)
{
    float filter_scale = scale_y < 1.0f ? scale_y : 1.0f;
    float sy_center = ((float)dy + 0.5f) / scale_y - 0.5f;
    int64_t sy_min = (int64_t)floorf(sy_center - support_y);
    int64_t sy_max = (int64_t)ceilf(sy_center + support_y);

    for (uint32_t dx = 0; dx < dst_w; dx++) {
        __m128 sum = _mm_setzero_ps();
        float weight_sum = 0.0f;

        for (int64_t sy = sy_min; sy <= sy_max; sy++) {
            float w = simd_lanczos_kernel(((float)sy - sy_center) * filter_scale);
            if (w == 0.0f) continue;
            int64_t clamped = sy < 0 ? 0 : sy >= (int64_t)src_h ? (int64_t)src_h - 1 : sy;
            const float *pixel = inter + (size_t)clamped * row_stride + (size_t)dx * 4u;
            sum = _mm_add_ps(sum, _mm_mul_ps(_mm_loadu_ps(pixel), _mm_set1_ps(w)));
            weight_sum += w;
        }

        store_rgba_f32_as_u8(dst_row + (size_t)dx * 4u,
                             _mm_mul_ps(sum, _mm_set1_ps(1.0f / weight_sum)));
    }
}
