/**
 * zenpix scalar vs SIMD benchmark.
 *
 * Separates raw resize from decode -> resize -> AVIF encode. Runs paired,
 * alternating measurements and reports p25/median/p75 instead of selecting a
 * favorable single result.
 */

import { dlopen, FFIType, ptr } from "bun:ffi";
import { cpus, platform, release, arch } from "os";
import { join } from "path";
import sharp from "sharp";

const ext = process.platform === "darwin" ? "dylib" : process.platform === "win32" ? "dll" : "so";
const simdPath = process.env.ZENPIX_SIMD_LIB ?? join(import.meta.dir, `../build/libpict.${ext}`);
const scalarPath = process.env.ZENPIX_SCALAR_LIB ?? join(import.meta.dir, `../build-scalar/libpict.${ext}`);
const warmup = Math.max(1, Number.parseInt(process.env.BENCH_WARMUP_N ?? "3", 10));
const iterations = Math.max(5, Number.parseInt(process.env.BENCH_MEASURE_N ?? "15", 10));

const symbols = {
  pict_decode_v2: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  pict_resize: {
    args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u8,
      FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr],
    returns: FFIType.ptr,
  },
  pict_encode_avif: {
    args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u8,
      FFIType.u8, FFIType.u8, FFIType.u8, FFIType.ptr],
    returns: FFIType.ptr,
  },
  pict_free_buffer: {
    args: [FFIType.ptr, FFIType.u64],
    returns: FFIType.void,
  },
} as const;

const simd = dlopen(simdPath, symbols);
const scalar = dlopen(scalarPath, symbols);
type Lib = typeof simd;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index), upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! * (upper - index) + sorted[upper]! * (index - lower);
}

function fillRaw(w: number, h: number, ch: number): Uint8Array {
  const pixels = new Uint8Array(w * h * ch);
  let state = 0x6d2b79f5;
  for (let i = 0; i < pixels.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[i] = state >>> 24;
  }
  return pixels;
}

function fillPipelineFixture(w: number, h: number): Uint8Array {
  const pixels = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const offset = (y * w + x) * 4;
      const checker = ((x >>> 5) ^ (y >>> 5)) & 1;
      pixels[offset] = Math.round((x * 255) / (w - 1));
      pixels[offset + 1] = Math.round((y * 255) / (h - 1));
      pixels[offset + 2] = checker ? 192 : 64;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function rawResize(lib: Lib, pixels: Uint8Array, ch: number, threads: number): void {
  const outLen = new BigUint64Array(1);
  const output = lib.symbols.pict_resize(
    ptr(pixels), 1920, 1080, ch, 960, 540, threads, ptr(outLen));
  if (!output) throw new Error("raw pict_resize failed");
  lib.symbols.pict_free_buffer(output, outLen[0]);
}

function fullPipeline(lib: Lib, png: Uint8Array, threads: number): void {
  const width = new Uint32Array(1), height = new Uint32Array(1);
  const channels = new Uint8Array(1);
  const decodedLen = new BigUint64Array(1);
  const decoded = lib.symbols.pict_decode_v2(
    ptr(png), BigInt(png.length), ptr(width), ptr(height), ptr(channels), ptr(decodedLen));
  if (!decoded) throw new Error("pict_decode_v2 failed");

  const resizedLen = new BigUint64Array(1);
  const resized = lib.symbols.pict_resize(
    decoded, width[0]!, height[0]!, channels[0]!, 960, 540, threads, ptr(resizedLen));
  lib.symbols.pict_free_buffer(decoded, decodedLen[0]);
  if (!resized) throw new Error("pipeline pict_resize failed");

  const encodedLen = new BigUint64Array(1);
  const encoded = lib.symbols.pict_encode_avif(
    resized, 960, 540, channels[0]!, 60, 10, threads, ptr(encodedLen));
  lib.symbols.pict_free_buffer(resized, resizedLen[0]);
  if (!encoded) throw new Error("pict_encode_avif failed");
  lib.symbols.pict_free_buffer(encoded, encodedLen[0]);
}

function pairedBenchmark(
  label: string,
  scalarRun: () => void,
  simdRun: () => void,
): void {
  for (let i = 0; i < warmup; i++) {
    scalarRun(); simdRun();
  }
  const scalarTimes: number[] = [];
  const simdTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const order: Array<["scalar" | "simd", () => void]> = i % 2 === 0
      ? [["scalar", scalarRun], ["simd", simdRun]]
      : [["simd", simdRun], ["scalar", scalarRun]];
    for (const [kind, run] of order) {
      const start = performance.now();
      run();
      const elapsed = performance.now() - start;
      (kind === "scalar" ? scalarTimes : simdTimes).push(elapsed);
    }
  }

  const scalarMedian = percentile(scalarTimes, 0.5);
  const simdMedian = percentile(simdTimes, 0.5);
  const speedup = scalarMedian / simdMedian;
  const fmt = (values: number[]) =>
    `${percentile(values, 0.25).toFixed(2)}/${percentile(values, 0.5).toFixed(2)}/${percentile(values, 0.75).toFixed(2)} ms`;
  console.log(`${label}\n  scalar p25/med/p75 ${fmt(scalarTimes)}\n  SIMD   p25/med/p75 ${fmt(simdTimes)}\n  median speedup ${speedup.toFixed(3)}x`);
}

const fixture = fillPipelineFixture(1920, 1080);
const rgbaPng = new Uint8Array(await sharp(fixture, {
  raw: { width: 1920, height: 1080, channels: 4 },
})
  .png()
  .toBuffer());
const rgba = fillRaw(1920, 1080, 4);
const rgb = fillRaw(1920, 1080, 3);

console.log("zenpix resize scalar vs SIMD");
console.log(`OS=${platform()} ${release()} arch=${arch()} CPU=${cpus()[0]?.model ?? "unknown"}`);
console.log(`SIMD=${simdPath}`);
console.log(`scalar=${scalarPath}`);
console.log(`compiler/build: CMake Release, -O2, portable architecture baseline; SIMD backend selected by architecture`);
console.log(`fixture=deterministic gradient/checker RGBA PNG 1920x1080; warmup=${warmup}; measured pairs=${iterations}\n`);

try {
  for (const threads of [1, Math.min(4, cpus().length)]) {
    pairedBenchmark(
      `raw RGBA resize 1920x1080 -> 960x540 threads=${threads}`,
      () => rawResize(scalar, rgba, 4, threads),
      () => rawResize(simd, rgba, 4, threads),
    );
  }
  pairedBenchmark(
    `raw RGB scalar fallback 1920x1080 -> 960x540 threads=${Math.min(4, cpus().length)}`,
    () => rawResize(scalar, rgb, 3, Math.min(4, cpus().length)),
    () => rawResize(simd, rgb, 3, Math.min(4, cpus().length)),
  );
  for (const threads of [1, Math.min(4, cpus().length)]) {
    pairedBenchmark(
      `RGBA PNG decode -> resize -> AVIF(q60,speed10) threads=${threads}`,
      () => fullPipeline(scalar, rgbaPng, threads),
      () => fullPipeline(simd, rgbaPng, threads),
    );
  }
} finally {
  simd.close(); scalar.close();
}
