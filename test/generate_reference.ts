/**
 * generate_reference.ts — one-time script to produce reference_data.bin
 *
 * Uses the Zig-built libpict.dylib to generate ground-truth resize output.
 * Commit the resulting reference_data.bin; future CI uses it without Zig.
 *
 * Run: bun run test/generate_reference.ts
 */

import { dlopen, FFIType, ptr, toArrayBuffer } from "bun:ffi";
import { writeFileSync } from "fs";
import { join } from "path";

const ZIG_LIB = "/Users/tuki/Develop/Projects/zenpix/npm/zenpix-darwin-arm64/libpict.dylib";

const lib = dlopen(ZIG_LIB, {
  pict_resize: {
    args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u8,
           FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr],
    returns: FFIType.ptr,
  },
  pict_free_buffer: {
    args: [FFIType.ptr, FFIType.u64],
    returns: FFIType.void,
  },
});

// ── Synthetic input: 64×48 RGB gradient ──────────────────────────────────────
const SRC_W = 64, SRC_H = 48, CH = 3;
const src = new Uint8Array(SRC_W * SRC_H * CH);
for (let y = 0; y < SRC_H; y++) {
  for (let x = 0; x < SRC_W; x++) {
    const i = (y * SRC_W + x) * CH;
    src[i + 0] = Math.round(x * 255 / (SRC_W - 1));               // R: left→right
    src[i + 1] = Math.round(y * 255 / (SRC_H - 1));               // G: top→bottom
    src[i + 2] = Math.round((x + y) * 255 / (SRC_W + SRC_H - 2));// B: diagonal
  }
}

// ── Resize cases ──────────────────────────────────────────────────────────────
const cases = [
  { dstW: 20,  dstH: 15, label: "64×48 → 20×15  (downscale ×0.3)" },
  { dstW: 128, dstH: 96, label: "64×48 → 128×96 (upscale ×2)" },
  { dstW: 64,  dstH: 48, label: "64×48 → 64×48  (identity)" },
];

// ── Generate ──────────────────────────────────────────────────────────────────
const parts: Buffer[] = [];

const countBuf = Buffer.alloc(4);
countBuf.writeUInt32LE(cases.length, 0);
parts.push(countBuf);

for (const { dstW, dstH, label } of cases) {
  const outLen = new BigUint64Array(1);
  const result = lib.symbols.pict_resize(
    ptr(src), SRC_W, SRC_H, CH,
    dstW, dstH,
    1,           // n_threads = 1 (deterministic)
    ptr(outLen),
  );
  if (!result) throw new Error(`Zig pict_resize failed: ${label}`);

  const pixels = new Uint8Array(toArrayBuffer(result, 0, Number(outLen[0])).slice(0));
  lib.symbols.pict_free_buffer(result, outLen[0]);

  const header = Buffer.alloc(16);
  header.writeUInt32LE(dstW, 0);
  header.writeUInt32LE(dstH, 4);
  header.writeUInt32LE(CH, 8);
  header.writeUInt32LE(pixels.length, 12);

  parts.push(header, Buffer.from(pixels));
  console.log(`  ${label}: ${pixels.length} bytes`);
}

lib.close();

// ── Write ─────────────────────────────────────────────────────────────────────
const outPath = join(import.meta.dir, "reference_data.bin");
writeFileSync(outPath, Buffer.concat(parts));
console.log(`\nSaved ${outPath}`);
