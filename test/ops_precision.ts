/**
 * ops_precision.ts — Functional accuracy tests for pict_rotate,
 * pict_remove_background, and pict_round_corners.
 *
 * Run: bun run test/ops_precision.ts
 */

import { dlopen, FFIType, ptr, toArrayBuffer } from "bun:ffi";
import { join } from "path";

const ext = process.platform === "darwin" ? "dylib" : process.platform === "win32" ? "dll" : "so";
const C_LIB = join(import.meta.dir, `../build/libpict.${ext}`);

const lib = dlopen(C_LIB, {
  pict_rotate: {
    args: [
      FFIType.ptr,  // pixels
      FFIType.u32,  // src_w
      FFIType.u32,  // src_h
      FFIType.u8,   // channels
      FFIType.u8,   // orientation
      FFIType.ptr,  // out_w
      FFIType.ptr,  // out_h
      FFIType.ptr,  // out_len
    ],
    returns: FFIType.ptr,
  },
  pict_remove_background: {
    args: [
      FFIType.ptr,  // pixels
      FFIType.u32,  // width
      FFIType.u32,  // height
      FFIType.u8,   // channels
      FFIType.u8,   // threshold
      FFIType.ptr,  // out_len
    ],
    returns: FFIType.ptr,
  },
  pict_round_corners: {
    args: [
      FFIType.ptr,  // pixels (must be RGBA)
      FFIType.u32,  // width
      FFIType.u32,  // height
      FFIType.u32,  // radius
      FFIType.ptr,  // out_len
    ],
    returns: FFIType.ptr,
  },
  pict_free_buffer: {
    args: [FFIType.ptr, FFIType.u64],
    returns: FFIType.void,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

let failed = 0;
let total = 0;

function pass(label: string, detail: string) {
  console.log(`PASS: ${label} — ${detail}`);
  total++;
}
function fail(label: string, reason: string) {
  console.error(`FAIL: ${label} — ${reason}`);
  failed++;
  total++;
}

function callRotate(
  pixels: Uint8Array,
  srcW: number, srcH: number, ch: number, orientation: number,
): { data: Uint8Array; w: number; h: number } | null {
  const outW = new Uint32Array(1);
  const outH = new Uint32Array(1);
  const outLen = new BigUint64Array(1);
  const result = lib.symbols.pict_rotate(
    ptr(pixels), srcW, srcH, ch, orientation,
    ptr(outW), ptr(outH), ptr(outLen),
  );
  if (!result) return null;
  const data = new Uint8Array(toArrayBuffer(result, 0, Number(outLen[0])).slice(0));
  lib.symbols.pict_free_buffer(result, outLen[0]);
  return { data, w: outW[0], h: outH[0] };
}

function makePixel(r: number, g: number, b: number, a = 255): number[] {
  return [r, g, b, a];
}

// ── pict_rotate tests ─────────────────────────────────────────────────────────
{
  // 2×1 RGBA image: left=[10,20,30,255] right=[40,50,60,255]
  // orientation=1 is identity (returns NULL per implementation — skip it)
  const W = 2, H = 1, CH = 4;
  const src = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]);

  // orientation=2: horizontal mirror → right|left
  {
    const label = "pict_rotate orient=2 (H-mirror) 2×1";
    const r = callRotate(src, W, H, CH, 2);
    if (!r) { fail(label, "returned null"); }
    else if (r.w !== 2 || r.h !== 1) { fail(label, `size=${r.w}×${r.h}`); }
    else if (r.data[0] !== 40 || r.data[4] !== 10) {
      fail(label, `pixel[0]=${r.data.slice(0,4)} pixel[1]=${r.data.slice(4,8)}`);
    } else {
      pass(label, `pixel[0]=[${r.data.slice(0,4)}] pixel[1]=[${r.data.slice(4,8)}]`);
    }
  }

  // orientation=3: 180° rotate → mirror both axes
  {
    const label = "pict_rotate orient=3 (180°) 2×1";
    const r = callRotate(src, W, H, CH, 3);
    if (!r) { fail(label, "returned null"); }
    else if (r.w !== 2 || r.h !== 1) { fail(label, `size=${r.w}×${r.h}`); }
    else if (r.data[0] !== 40 || r.data[4] !== 10) {
      fail(label, `pixel[0]=${Array.from(r.data.slice(0,4))} pixel[1]=${Array.from(r.data.slice(4,8))}`);
    } else {
      pass(label, `pixel[0]=[${r.data.slice(0,4)}] pixel[1]=[${r.data.slice(4,8)}]`);
    }
  }

  // orientation=4: vertical flip on 2×1 is identity (only 1 row)
  {
    const label = "pict_rotate orient=4 (V-flip) 2×1";
    const r = callRotate(src, W, H, CH, 4);
    if (!r) { fail(label, "returned null"); }
    else if (r.w !== 2 || r.h !== 1) { fail(label, `size=${r.w}×${r.h}`); }
    else if (r.data[0] !== 10 || r.data[4] !== 40) {
      fail(label, `pixel[0]=${Array.from(r.data.slice(0,4))}`);
    } else {
      pass(label, `pixel[0]=[${r.data.slice(0,4)}] pixel[1]=[${r.data.slice(4,8)}]`);
    }
  }
}

{
  // 1×2 RGBA image: top=[10,20,30,255] bottom=[40,50,60,255]
  const W = 1, H = 2, CH = 4;
  const src = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]);

  // orientation=5: transpose (swap x↔y). src(0,0)→dst(0,0), src(0,1)→dst(1,0)
  // result is 2×1 with left=[top pixel], right=[bottom pixel]
  {
    const label = "pict_rotate orient=5 (transpose) 1×2→2×1";
    const r = callRotate(src, W, H, CH, 5);
    if (!r) { fail(label, "returned null"); }
    else if (r.w !== 2 || r.h !== 1) { fail(label, `size=${r.w}×${r.h}`); }
    else if (r.data[0] !== 10 || r.data[4] !== 40) {
      fail(label, `pixel[0]=${Array.from(r.data.slice(0,4))} pixel[1]=${Array.from(r.data.slice(4,8))}`);
    } else {
      pass(label, `size=2×1, pixel[0]=[${r.data.slice(0,4)}] pixel[1]=[${r.data.slice(4,8)}]`);
    }
  }

  // orientation=6: 90° CW. 1×2 → 2×1
  // src(sx,sy) → dst(sy, W-1-sx) → dst(0,0)=src(0,1)=[40,...], dst(1,0)=src(0,0)=[10,...]
  {
    const label = "pict_rotate orient=6 (90°CW) 1×2→2×1";
    const r = callRotate(src, W, H, CH, 6);
    if (!r) { fail(label, "returned null"); }
    else if (r.w !== 2 || r.h !== 1) { fail(label, `size=${r.w}×${r.h}`); }
    else if (r.data[0] !== 40 || r.data[4] !== 10) {
      fail(label, `pixel[0]=${Array.from(r.data.slice(0,4))} pixel[1]=${Array.from(r.data.slice(4,8))}`);
    } else {
      pass(label, `size=2×1, pixel[0]=[${r.data.slice(0,4)}] pixel[1]=[${r.data.slice(4,8)}]`);
    }
  }

  // orientation=8: 90° CCW. 1×2 → 2×1
  // dx=sy, dy=src_w-1-sx → src(0,0): dx=0,dy=0=[A] left; src(0,1): dx=1,dy=0=[B] right
  {
    const label = "pict_rotate orient=8 (90°CCW) 1×2→2×1";
    const r = callRotate(src, W, H, CH, 8);
    if (!r) { fail(label, "returned null"); }
    else if (r.w !== 2 || r.h !== 1) { fail(label, `size=${r.w}×${r.h}`); }
    else if (r.data[0] !== 10 || r.data[4] !== 40) {
      fail(label, `pixel[0]=${Array.from(r.data.slice(0,4))} pixel[1]=${Array.from(r.data.slice(4,8))}`);
    } else {
      pass(label, `size=2×1, pixel[0]=[${r.data.slice(0,4)}] pixel[1]=[${r.data.slice(4,8)}]`);
    }
  }
}

// NULL / invalid input guard
{
  const label = "pict_rotate invalid orientation=1 returns null";
  const src = new Uint8Array(4 * 4);
  const outW = new Uint32Array(1);
  const outH = new Uint32Array(1);
  const outLen = new BigUint64Array(1);
  const r = lib.symbols.pict_rotate(ptr(src), 2, 2, 4, 1, ptr(outW), ptr(outH), ptr(outLen));
  if (r) {
    fail(label, "expected null for orientation=1");
  } else {
    pass(label, "returned null as expected");
  }
}

// ── pict_remove_background tests ──────────────────────────────────────────────
{
  // 3×3 white image — all corners should become transparent
  const W = 3, H = 3, CH = 3;
  const src = new Uint8Array(W * H * CH).fill(255);

  const outLen = new BigUint64Array(1);
  const result = lib.symbols.pict_remove_background(ptr(src), W, H, CH, 10, ptr(outLen));
  const label = "pict_remove_background 3×3 all-white → corners transparent";

  if (!result) {
    fail(label, "returned null");
  } else {
    const data = new Uint8Array(toArrayBuffer(result, 0, Number(outLen[0])).slice(0));
    lib.symbols.pict_free_buffer(result, outLen[0]);

    // Expected output size: W*H*4 (always RGBA)
    if (Number(outLen[0]) !== W * H * 4) {
      fail(label, `out_len=${outLen[0]} expected=${W*H*4}`);
    } else {
      // All pixels should be transparent (fully white → fully removed)
      const allTransparent = Array.from({ length: W * H }, (_, i) => data[i * 4 + 3] === 0).every(Boolean);
      if (!allTransparent) {
        const alphas = Array.from({ length: W * H }, (_, i) => data[i * 4 + 3]);
        fail(label, `some alphas non-zero: ${alphas}`);
      } else {
        pass(label, "all 9 pixels transparent");
      }
    }
  }
}

{
  // 3×3 image: white border, red center — center should stay opaque
  const W = 3, H = 3, CH = 3;
  const src = new Uint8Array(W * H * CH).fill(255);
  // Center pixel (1,1) → red
  src[(1 * W + 1) * CH + 0] = 200;
  src[(1 * W + 1) * CH + 1] = 0;
  src[(1 * W + 1) * CH + 2] = 0;

  const outLen = new BigUint64Array(1);
  const result = lib.symbols.pict_remove_background(ptr(src), W, H, CH, 10, ptr(outLen));
  const label = "pict_remove_background 3×3 white+red-center → center opaque";

  if (!result) {
    fail(label, "returned null");
  } else {
    const data = new Uint8Array(toArrayBuffer(result, 0, Number(outLen[0])).slice(0));
    lib.symbols.pict_free_buffer(result, outLen[0]);

    const centerAlpha = data[(1 * W + 1) * 4 + 3];
    const cornerAlpha = data[0 * 4 + 3];
    if (cornerAlpha !== 0) {
      fail(label, `corner alpha=${cornerAlpha} expected 0`);
    } else if (centerAlpha !== 255) {
      fail(label, `center alpha=${centerAlpha} expected 255`);
    } else {
      pass(label, `corner_alpha=0, center_alpha=${centerAlpha}`);
    }
  }
}

{
  // threshold=0 → only exact-white (255,255,255) removed
  const W = 2, H = 2, CH = 3;
  const src = new Uint8Array([
    255, 255, 255,   // (0,0) exact white → removed
    254, 254, 254,   // (1,0) near-white but threshold=0 → kept
    255, 255, 255,   // (0,1) exact white → removed
    254, 254, 254,   // (1,1) near-white → kept
  ]);

  const outLen = new BigUint64Array(1);
  const result = lib.symbols.pict_remove_background(ptr(src), W, H, CH, 0, ptr(outLen));
  const label = "pict_remove_background threshold=0 keeps near-white";

  if (!result) {
    fail(label, "returned null");
  } else {
    const data = new Uint8Array(toArrayBuffer(result, 0, Number(outLen[0])).slice(0));
    lib.symbols.pict_free_buffer(result, outLen[0]);

    const a00 = data[(0 * W + 0) * 4 + 3]; // exact white → 0
    const a10 = data[(0 * W + 1) * 4 + 3]; // near-white → 255
    if (a00 !== 0) {
      fail(label, `(0,0) alpha=${a00} expected 0`);
    } else if (a10 !== 255) {
      fail(label, `(1,0) alpha=${a10} expected 255 (threshold=0 should not remove 254)`);
    } else {
      pass(label, `(0,0)=transparent, (1,0)=opaque`);
    }
  }
}

// ── pict_round_corners tests ──────────────────────────────────────────────────
{
  // 4×4 RGBA all-opaque image, radius=2
  // Corners (0,0),(3,0),(0,3),(3,3) should become transparent
  // Center pixels (1,1),(2,1),(1,2),(2,2) must stay opaque
  const W = 4, H = 4;
  const src = new Uint8Array(W * H * 4).fill(255);

  const outLen = new BigUint64Array(1);
  const result = lib.symbols.pict_round_corners(ptr(src), W, H, 2, ptr(outLen));
  const label = "pict_round_corners 4×4 radius=2 corners transparent";

  if (!result) {
    fail(label, "returned null");
  } else {
    const data = new Uint8Array(toArrayBuffer(result, 0, Number(outLen[0])).slice(0));
    lib.symbols.pict_free_buffer(result, outLen[0]);

    const alpha = (x: number, y: number) => data[(y * W + x) * 4 + 3];

    // Corners must be transparent
    const cornersClear = alpha(0,0) === 0 && alpha(3,0) === 0 && alpha(0,3) === 0 && alpha(3,3) === 0;
    // Center pixels must be opaque
    const centerOpaque = alpha(1,1) === 255 && alpha(2,1) === 255 && alpha(1,2) === 255 && alpha(2,2) === 255;

    if (!cornersClear) {
      fail(label,
        `corner alphas: (0,0)=${alpha(0,0)} (3,0)=${alpha(3,0)} (0,3)=${alpha(0,3)} (3,3)=${alpha(3,3)}`);
    } else if (!centerOpaque) {
      fail(label,
        `center alphas: (1,1)=${alpha(1,1)} (2,1)=${alpha(2,1)} (1,2)=${alpha(1,2)} (2,2)=${alpha(2,2)}`);
    } else {
      pass(label, "corners=transparent, center=opaque");
    }
  }
}

{
  // radius=0 → no change (passthrough)
  const W = 4, H = 4;
  const src = new Uint8Array(W * H * 4).fill(255);
  const outLen = new BigUint64Array(1);
  const result = lib.symbols.pict_round_corners(ptr(src), W, H, 0, ptr(outLen));
  const label = "pict_round_corners radius=0 all opaque";

  if (!result) {
    fail(label, "returned null");
  } else {
    const data = new Uint8Array(toArrayBuffer(result, 0, Number(outLen[0])).slice(0));
    lib.symbols.pict_free_buffer(result, outLen[0]);

    const allOpaque = Array.from({ length: W * H }, (_, i) => data[i * 4 + 3] === 255).every(Boolean);
    if (!allOpaque) {
      fail(label, "some pixels became transparent unexpectedly");
    } else {
      pass(label, "all pixels remain opaque");
    }
  }
}

{
  // radius larger than image — all 4 corners should be clipped
  const W = 3, H = 3;
  const src = new Uint8Array(W * H * 4).fill(255);
  const outLen = new BigUint64Array(1);
  const result = lib.symbols.pict_round_corners(ptr(src), W, H, 10, ptr(outLen));
  const label = "pict_round_corners radius=10 on 3×3 image";

  if (!result) {
    fail(label, "returned null");
  } else {
    const data = new Uint8Array(toArrayBuffer(result, 0, Number(outLen[0])).slice(0));
    lib.symbols.pict_free_buffer(result, outLen[0]);

    const cornerAlpha = data[(0 * W + 0) * 4 + 3];
    if (cornerAlpha !== 0) {
      fail(label, `corner (0,0) alpha=${cornerAlpha} expected 0`);
    } else {
      pass(label, `corner (0,0) is transparent`);
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

lib.close();

if (failed > 0) {
  console.error(`\n${failed} / ${total} test(s) FAILED.`);
  process.exit(1);
} else {
  console.log(`\nAll ${total} ops precision tests passed.`);
}
