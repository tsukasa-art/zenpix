/* ARM64 NEON RGBA kernels for the Lanczos-3 H-pass and V-pass. */

#include "resize_simd.h"

#include <arm_neon.h>
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

static float32x4_t load_rgba_u8_as_f32(const uint8_t *pixel) {
    uint32_t packed;
    memcpy(&packed, pixel, sizeof(packed));
    uint8x8_t bytes = vcreate_u8((uint64_t)packed);
    uint16x8_t u16 = vmovl_u8(bytes);
    uint32x4_t u32 = vmovl_u16(vget_low_u16(u16));
    return vcvtq_f32_u32(u32);
}

static void store_rgba_f32_as_u8(uint8_t *pixel, float32x4_t value) {
    value = vmaxq_f32(value, vdupq_n_f32(0.0f));
    value = vminq_f32(value, vdupq_n_f32(255.0f));
    uint32x4_t u32 = vcvtq_u32_f32(vaddq_f32(value, vdupq_n_f32(0.5f)));
    uint16x4_t u16 = vmovn_u32(u32);
    uint8x8_t u8 = vmovn_u16(vcombine_u16(u16, vdup_n_u16(0)));
    uint32_t packed = vget_lane_u32(vreinterpret_u32_u8(u8), 0);
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
        float32x4_t sum = vdupq_n_f32(0.0f);
        float weight_sum = 0.0f;

        for (int64_t sx = sx_min; sx <= sx_max; sx++) {
            float w = simd_lanczos_kernel(((float)sx - sx_center) * filter_scale);
            if (w == 0.0f) continue;
            int64_t clamped = sx < 0 ? 0 : sx >= (int64_t)src_w ? (int64_t)src_w - 1 : sx;
            float32x4_t pixel = load_rgba_u8_as_f32(src_row + (size_t)clamped * 4u);
            sum = vaddq_f32(sum, vmulq_n_f32(pixel, w));
            weight_sum += w;
        }

        vst1q_f32(out_row + (size_t)dx * 4u, vmulq_n_f32(sum, 1.0f / weight_sum));
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
        float32x4_t sum = vdupq_n_f32(0.0f);
        float weight_sum = 0.0f;

        for (int64_t sy = sy_min; sy <= sy_max; sy++) {
            float w = simd_lanczos_kernel(((float)sy - sy_center) * filter_scale);
            if (w == 0.0f) continue;
            int64_t clamped = sy < 0 ? 0 : sy >= (int64_t)src_h ? (int64_t)src_h - 1 : sy;
            const float *pixel = inter + (size_t)clamped * row_stride + (size_t)dx * 4u;
            sum = vaddq_f32(sum, vmulq_n_f32(vld1q_f32(pixel), w));
            weight_sum += w;
        }

        store_rgba_f32_as_u8(dst_row + (size_t)dx * 4u,
                             vmulq_n_f32(sum, 1.0f / weight_sum));
    }
}
