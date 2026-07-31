/**
 * avif_roundtrip.ts — AVIF RGBA, ICC and CICP regression tests through the
 * public TypeScript API.
 *
 * Run after building libpict and js/dist:
 *   ZENPIX_LIB="$PWD/build/libpict.dylib" bun run test/avif_roundtrip.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decode, encodeAvif, type ImageBuffer } from "../js/dist/index.js";

let passed = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pass(label: string): void {
  console.log(`PASS: ${label}`);
  passed++;
}

function findNclx(data: Uint8Array): { primaries: number; transfer: number; matrix: number } | null {
  for (let i = 0; i + 10 < data.byteLength; i++) {
    if (data[i] !== 0x6e || data[i + 1] !== 0x63 || data[i + 2] !== 0x6c || data[i + 3] !== 0x78) continue;
    return {
      primaries: (data[i + 4]! << 8) | data[i + 5]!,
      transfer: (data[i + 6]! << 8) | data[i + 7]!,
      matrix: (data[i + 8]! << 8) | data[i + 9]!,
    };
  }
  return null;
}

function syntheticRgba(icc?: Buffer): ImageBuffer {
  const width = 16;
  const height = 8;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x * 13;
      data[i + 1] = y * 29;
      data[i + 2] = (x * 17 + y * 11) & 0xff;
      data[i + 3] = (x * 19 + y * 23) & 0xff;
    }
  }
  return { data, width, height, channels: 4, ...(icc ? { icc } : {}) };
}

{
  const source = syntheticRgba();
  const encoded = encodeAvif(source, { quality: 80, speed: 8, threads: 1 });
  assert(encoded, "RGBA AVIF encode returned null");
  const decoded = decode(encoded);
  assert(decoded.channels === 4, `transparent RGBA decoded as ${decoded.channels} channels`);
  for (let i = 3; i < source.data.byteLength; i += 4) {
    assert(decoded.data[i] === source.data[i], `alpha mismatch at pixel ${(i - 3) / 4}: ${decoded.data[i]} != ${source.data[i]}`);
  }
  pass("non-opaque RGBA alpha is preserved losslessly");

  const nclx = findNclx(encoded);
  assert(nclx, "nclx color property was not found");
  assert(nclx.primaries === 1, `unexpected color primaries ${nclx.primaries}`);
  assert(nclx.transfer === 13, `unexpected transfer characteristics ${nclx.transfer}`);
  assert(nclx.matrix === 6, `unexpected matrix coefficients ${nclx.matrix}`);
  pass("AVIF without ICC explicitly signals sRGB / BT.601 CICP");
}

{
  const fixture = readFileSync(join(import.meta.dir, "fixtures/bench_landscape_light.png"));
  const fixtureImage = decode(fixture);
  assert(fixtureImage.icc && fixtureImage.icc.byteLength > 0, "ICC fixture did not decode with an ICC profile");

  const source = syntheticRgba(Buffer.from(fixtureImage.icc));
  const encoded = encodeAvif(source, { quality: 80, speed: 8, threads: 1 });
  assert(encoded, "ICC AVIF encode returned null");
  const decoded = decode(encoded);
  assert(decoded.icc, "encoded AVIF did not decode with an ICC profile");
  assert(Buffer.from(decoded.icc).equals(source.icc!), "AVIF ICC roundtrip changed the profile bytes");
  pass(`AVIF ICC roundtrip preserves ${source.icc!.byteLength} bytes`);
}

console.log(`AVIF roundtrip: ${passed} checks passed`);
