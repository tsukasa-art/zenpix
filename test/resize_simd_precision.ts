/**
 * Shared-library FFI comparison between a normal SIMD-enabled build and a
 * forced-scalar build from the same source tree.
 *
 * ZENPIX_SIMD_LIB=/path/libpict.dylib
 * ZENPIX_SCALAR_LIB=/path/libpict.dylib bun run test/resize_simd_precision.ts
 */

import { dlopen, FFIType, ptr, toArrayBuffer } from "bun:ffi";
import { join } from "path";

const ext = process.platform === "darwin" ? "dylib" : process.platform === "win32" ? "dll" : "so";
const simdPath = process.env.ZENPIX_SIMD_LIB ?? join(import.meta.dir, `../build/libpict.${ext}`);
const scalarPath = process.env.ZENPIX_SCALAR_LIB ?? join(import.meta.dir, `../build-scalar/libpict.${ext}`);

const symbols = {
  pict_resize: {
    args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u8,
      FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr],
    returns: FFIType.ptr,
  },
  pict_free_buffer: {
    args: [FFIType.ptr, FFIType.u64],
    returns: FFIType.void,
  },
} as const;

const simd = dlopen(simdPath, symbols);
const scalar = dlopen(scalarPath, symbols);

type Pattern = "uniform" | "gradient" | "checker" | "random" | "edges";
type Case = { name: string; sw: number; sh: number; dw: number; dh: number; ch: number; pattern: Pattern };

const cases: Case[] = [
  { name: "RGBA downscale gradient", sw: 73, sh: 59, dw: 19, dh: 13, ch: 4, pattern: "gradient" },
  { name: "RGBA upscale checker", sw: 11, sh: 9, dw: 37, dh: 31, ch: 4, pattern: "checker" },
  { name: "RGBA identity random", sw: 23, sh: 17, dw: 23, dh: 17, ch: 4, pattern: "random" },
  { name: "RGBA uniform multithread", sw: 32, sh: 20, dw: 7, dh: 71, ch: 4, pattern: "uniform" },
  { name: "RGBA edge clamp", sw: 3, sh: 2, dw: 41, dh: 67, ch: 4, pattern: "edges" },
  { name: "RGBA random multithread", sw: 101, sh: 83, dw: 67, dh: 79, ch: 4, pattern: "random" },
  { name: "RGB scalar fallback", sw: 61, sh: 67, dw: 29, dh: 73, ch: 3, pattern: "random" },
];

function makeInput(tc: Case): Uint8Array {
  const pixels = new Uint8Array(tc.sw * tc.sh * tc.ch);
  let rng = 0x6d2b79f5;
  const randomByte = (): number => {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return (rng >>> 24) & 255;
  };
  for (let y = 0; y < tc.sh; y++) {
    for (let x = 0; x < tc.sw; x++) {
      for (let c = 0; c < tc.ch; c++) {
        let value = 0;
        switch (tc.pattern) {
          case "uniform": value = 37 + c * 53; break;
          case "gradient": value = (x * (17 + c * 5) + y * (29 + c * 7) + c * 41) & 255; break;
          case "checker": value = (((Math.floor(x / 2) + Math.floor(y / 3) + c) & 1) !== 0) ? 255 : 0; break;
          case "random": value = randomByte(); break;
          case "edges": value = (x === 0 || y === 0 || x + 1 === tc.sw || y + 1 === tc.sh) ? 255 - c * 47 : c * 31; break;
        }
        pixels[(y * tc.sw + x) * tc.ch + c] = value;
      }
    }
  }
  return pixels;
}

function resize(lib: typeof simd, src: Uint8Array, tc: Case, threads: number): Uint8Array {
  const outLen = new BigUint64Array(1);
  const result = lib.symbols.pict_resize(
    ptr(src), tc.sw, tc.sh, tc.ch, tc.dw, tc.dh, threads, ptr(outLen));
  if (!result) throw new Error(`${tc.name}: pict_resize returned null`);
  const expected = tc.dw * tc.dh * tc.ch;
  if (Number(outLen[0]) !== expected) {
    lib.symbols.pict_free_buffer(result, outLen[0]);
    throw new Error(`${tc.name}: out_len=${outLen[0]} expected=${expected}`);
  }
  const output = new Uint8Array(toArrayBuffer(result, 0, expected).slice(0));
  lib.symbols.pict_free_buffer(result, outLen[0]);
  return output;
}

let failures = 0;
try {
  for (const tc of cases) {
    for (const threads of [1, 4]) {
      const src = makeInput(tc);
      const expected = resize(scalar, src, tc, threads);
      const got = resize(simd, src, tc, threads);
      let maxDiff = 0, diff0 = 0, diff1 = 0, diffOver = 0, maxIndex = 0;
      for (let i = 0; i < got.length; i++) {
        const d = Math.abs(got[i] - expected[i]);
        if (d === 0) diff0++;
        else if (d === 1) diff1++;
        else diffOver++;
        if (d > maxDiff) { maxDiff = d; maxIndex = i; }
      }
      const exactRequired = tc.ch !== 4;
      const passed = exactRequired ? maxDiff === 0 : maxDiff <= 1;
      console.log(`${passed ? "PASS" : "FAIL"}: ${tc.name} threads=${threads} max_diff=${maxDiff} diff0=${diff0} diff1=${diff1} diff_gt1=${diffOver}`);
      if (!passed) {
        console.error(`  byte=${maxIndex} scalar=${expected[maxIndex]} simd=${got[maxIndex]}`);
        failures++;
      }
    }
  }
} finally {
  simd.close();
  scalar.close();
}

if (failures > 0) process.exit(1);
console.log("All shared-library SIMD/scalar FFI comparisons passed.");
