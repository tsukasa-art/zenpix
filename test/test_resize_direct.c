/*
 * test_resize_direct.c — calls pict_resize_lanczos3 directly (no FFI)
 * Compile: cc -o /tmp/test_resize_direct test/test_resize_direct.c src/resize.c -lm -I./include -pthread
 */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include "pict_resize.h"

int main(void) {
    /* Test 1: 4×4 uniform (100,150,200) → 2×2 */
    {
        uint8_t src[4*4*3];
        for (int i = 0; i < 16; i++) { src[i*3]=100; src[i*3+1]=150; src[i*3+2]=200; }
        uint8_t dst[2*2*3];
        memset(dst, 0, sizeof(dst));
        int rc = pict_resize_lanczos3(src, 4, 4, dst, 2, 2, 3, 1);
        printf("4x4 uniform -> 2x2 rc=%d:\n", rc);
        for (int i = 0; i < 4; i++)
            printf("  [%d] R=%d G=%d B=%d (expect 100,150,200)\n",
                   i, dst[i*3], dst[i*3+1], dst[i*3+2]);
    }

    /* Test 2: 64×48 identity, check first 6 pixels */
    {
        int SRC_W=64, SRC_H=48, CH=3;
        uint8_t *src = (uint8_t *)malloc(SRC_W*SRC_H*CH);
        for (int y = 0; y < SRC_H; y++) for (int x = 0; x < SRC_W; x++) {
            int i = (y*SRC_W+x)*CH;
            src[i+0] = (uint8_t)round(x*255.0/(SRC_W-1));
            src[i+1] = (uint8_t)round(y*255.0/(SRC_H-1));
            src[i+2] = (uint8_t)round((x+y)*255.0/(SRC_W+SRC_H-2));
        }
        uint8_t *dst = (uint8_t *)malloc(SRC_W*SRC_H*CH);
        int rc = pict_resize_lanczos3(src, SRC_W, SRC_H, dst, SRC_W, SRC_H, CH, 1);
        printf("\n64x48 identity rc=%d:\n", rc);
        int pairs[][2] = {{0,0},{1,0},{2,0},{0,1},{1,1},{2,1}};
        for (int p = 0; p < 6; p++) {
            int x=pairs[p][0], y=pairs[p][1];
            int si=(y*SRC_W+x)*CH, di=si;
            printf("  (%d,%d) src R=%d G=%d B=%d  dst R=%d G=%d B=%d\n",
                   x,y, src[si],src[si+1],src[si+2], dst[di],dst[di+1],dst[di+2]);
        }
        free(src); free(dst);
    }

    /* Test 3: 64×48 → 20×15 downscale, check pixel (2,0) */
    {
        int SRC_W=64, SRC_H=48, CH=3, DST_W=20, DST_H=15;
        uint8_t *src = (uint8_t *)malloc(SRC_W*SRC_H*CH);
        for (int y = 0; y < SRC_H; y++) for (int x = 0; x < SRC_W; x++) {
            int i = (y*SRC_W+x)*CH;
            src[i+0] = (uint8_t)round(x*255.0/(SRC_W-1));
            src[i+1] = (uint8_t)round(y*255.0/(SRC_H-1));
            src[i+2] = (uint8_t)round((x+y)*255.0/(SRC_W+SRC_H-2));
        }
        uint8_t *dst = (uint8_t *)malloc(DST_W*DST_H*CH);
        int rc = pict_resize_lanczos3(src, SRC_W, SRC_H, dst, DST_W, DST_H, CH, 1);
        printf("\n64x48 -> 20x15 downscale rc=%d, pixel (2,0): R=%d G=%d B=%d\n",
               rc, dst[6], dst[7], dst[8]);
        free(src); free(dst);
    }

    return 0;
}
