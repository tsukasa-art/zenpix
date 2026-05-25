/**
 * lanczos_precision.ts — Lanczos-3 pixel accuracy test
 *
 * Compares C resize.c output against Zig-generated reference_data.bin.
 * Pass criterion: every channel of every pixel must be within ±1 LSB.
 *
 * Run: bun run test/lanczos_precision.ts
 */

import { dlopen, FFIType, ptr, toArrayBuffer } from "bun:ffi";
import { readFileSync } from "fs";
import { join } from "path";

const ext = process.platform === "darwin" ? "dylib" : "so";
const C_LIB = join(import.meta.dir, `../build/libpict.${ext}`);
const REF_PATH = join(import.meta.dir, "reference_data.bin");
const MAX_DIFF = 1;

// ── Load C library ────────────────────────────────────────────────────────────
const lib = dlopen(C_LIB, {
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

// ── Reproduce the same synthetic input ───────────────────────────────────────
const SRC_W = 64, SRC_H = 48, CH = 3;
const src = new Uint8Array(SRC_W * SRC_H * CH);
for (let y = 0; y < SRC_H; y++) {
  for (let x = 0; x < SRC_W; x++) {
    const i = (y * SRC_W + x) * CH;
    src[i + 0] = Math.round(x * 255 / (SRC_W - 1));
    src[i + 1] = Math.round(y * 255 / (SRC_H - 1));
    src[i + 2] = Math.round((x + y) * 255 / (SRC_W + SRC_H - 2));
  }
}

// ── Parse reference_data.bin ──────────────────────────────────────────────────
const refBuf = readFileSync(REF_PATH);
let offset = 0;
const caseCount = refBuf.readUInt32LE(offset); offset += 4;

const refCases: { dstW: number; dstH: number; ch: number; pixels: Uint8Array }[] = [];
for (let i = 0; i < caseCount; i++) {
  const dstW = refBuf.readUInt32LE(offset); offset += 4;
  const dstH = refBuf.readUInt32LE(offset); offset += 4;
  const ch   = refBuf.readUInt32LE(offset); offset += 4;
  const len  = refBuf.readUInt32LE(offset); offset += 4;
  refCases.push({ dstW, dstH, ch, pixels: new Uint8Array(refBuf.buffer, refBuf.byteOffset + offset, len) });
  offset += len;
}

// ── Test runner ───────────────────────────────────────────────────────────────
let failed = 0;

function pass(label: string, extra: string): void {
  console.log(`PASS: ${label} — ${extra}`);
}
function fail(label: string, reason: string): void {
  console.error(`FAIL: ${label} — ${reason}`);
  failed++;
}

// ── Run each case ─────────────────────────────────────────────────────────────
for (const { dstW, dstH, ch, pixels: ref } of refCases) {
  const label = `Lanczos-3 ${SRC_W}×${SRC_H} → ${dstW}×${dstH}`;

  const outLen = new BigUint64Array(1);
  const result = lib.symbols.pict_resize(
    ptr(src), SRC_W, SRC_H, CH,
    dstW, dstH,
    1,
    ptr(outLen),
  );

  if (!result) {
    fail(label, "pict_resize returned null");
    continue;
  }

  const got = new Uint8Array(toArrayBuffer(result, 0, Number(outLen[0])).slice(0));
  lib.symbols.pict_free_buffer(result, outLen[0]);

  const expected = BigInt(dstW * dstH * ch);
  if (outLen[0] !== expected) {
    fail(label, `out_len=${outLen[0]} != expected=${expected}`);
    continue;
  }

  let maxDiff = 0;
  let firstBadIdx = -1;
  for (let i = 0; i < got.length; i++) {
    const d = Math.abs(got[i] - ref[i]);
    if (d > maxDiff) { maxDiff = d; firstBadIdx = i; }
  }

  if (maxDiff > MAX_DIFF) {
    const pixel = Math.floor(firstBadIdx / ch);
    const cx = pixel % dstW, cy = Math.floor(pixel / dstW), cc = firstBadIdx % ch;
    fail(label,
      `max_diff=${maxDiff} > ${MAX_DIFF} at pixel (${cx},${cy}) ch=${cc}: got=${got[firstBadIdx]} ref=${ref[firstBadIdx]}`);
  } else {
    pass(label, `max_diff=${maxDiff} (within ±${MAX_DIFF} LSB)`);
  }
}

lib.close();

if (failed > 0) {
  console.error(`\n${failed} / ${refCases.length} case(s) FAILED.`);
  process.exit(1);
} else {
  console.log(`\nAll ${refCases.length} Lanczos-3 precision cases passed.`);
}
