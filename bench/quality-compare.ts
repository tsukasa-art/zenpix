/**
 * Generate AVIF rate-distortion samples from one common resized PNG per
 * fixture. Equal quality numbers are recorded, but never treated as equivalent
 * encoder settings; the report also pairs outputs whose byte sizes are close.
 *
 * Run after building libpict and js/dist:
 *   ZENPIX_LIB="$PWD/build/libpict.dylib" bun bench/quality-compare.ts
 *   AVIF_QUALITIES=40,50,60,70 AVIF_FIXTURES=bench_landscape_light \
 *     ZENPIX_LIB="$PWD/build/libpict.dylib" bun bench/quality-compare.ts
 */

import { decode, encodeAvif } from "../js/dist/index.js";
import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type EncoderName = "sharp" | "zenpix";

interface Cicp {
  primaries: number;
  transfer: number;
  matrix: number;
}

interface SampleResult {
  encoder: EncoderName;
  quality: number;
  bytes: number;
  bitsPerPixel: number;
  psnrRgb: number | null;
  maeRgb: number;
  chromaSubsampling?: string;
  hasAlpha?: boolean;
  hasIcc: boolean;
  containerNclx: Cicp | null;
  file: string;
}

interface SizeMatch {
  sharpQuality: number;
  zenpixQuality: number;
  sharpBytes: number;
  zenpixBytes: number;
  sizeGapPercent: number;
  sharpPsnrRgb: number | null;
  zenpixPsnrRgb: number | null;
  psnrDeltaZenpixMinusSharp: number | null;
}

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "../test/fixtures");
const outDir = join(here, "results/quality");

const speed = parseInteger(process.env.AVIF_SPEED ?? "6", "AVIF_SPEED", 0, 10);
const outWidth = parseInteger(process.env.AVIF_OUT_WIDTH ?? "960", "AVIF_OUT_WIDTH", 1, 0xffff);
const outHeight = parseInteger(process.env.AVIF_OUT_HEIGHT ?? "960", "AVIF_OUT_HEIGHT", 1, 0xffff);
const qualities = parseIntegerList(process.env.AVIF_QUALITIES ?? "35,40,45,50,55,60,65,70,75", "AVIF_QUALITIES", 0, 100);
const requestedFixtures = new Set(
  (process.env.AVIF_FIXTURES ?? "").split(",").map((value) => value.trim()).filter(Boolean),
);

const allFixtures = [
  { id: "bench_input", file: "bench_input.png" },
  { id: "bench_chara_chika", file: "bench_chara_chika.png" },
  { id: "bench_chara_kanata", file: "bench_chara_kanata.png" },
  { id: "bench_landscape_dark", file: "bench_landscape_dark.png" },
  { id: "bench_landscape_impasto", file: "bench_landscape_impasto.png" },
  { id: "bench_landscape_light", file: "bench_landscape_light.png" },
];
const fixtures = requestedFixtures.size === 0
  ? allFixtures
  : allFixtures.filter(({ id }) => requestedFixtures.has(id));

if (fixtures.length === 0) throw new Error("AVIF_FIXTURES did not match any known fixture");

function parseInteger(value: string, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer in ${min}..${max}`);
  }
  return parsed;
}

function parseIntegerList(value: string, name: string, min: number, max: number): number[] {
  const values = [...new Set(value.split(",").map((item) => parseInteger(item.trim(), name, min, max)))];
  if (values.length === 0) throw new Error(`${name} must contain at least one value`);
  return values.sort((a, b) => a - b);
}

function findNclx(data: Uint8Array): Cicp | null {
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

function rgbError(reference: Uint8Array, candidate: Uint8Array): { psnrRgb: number | null; maeRgb: number } {
  if (reference.byteLength !== candidate.byteLength) {
    throw new Error(`decoded byte length mismatch: ${reference.byteLength} != ${candidate.byteLength}`);
  }
  let absoluteError = 0;
  let squaredError = 0;
  for (let i = 0; i < reference.byteLength; i++) {
    const diff = reference[i]! - candidate[i]!;
    absoluteError += Math.abs(diff);
    squaredError += diff * diff;
  }
  const maeRgb = absoluteError / reference.byteLength;
  const mse = squaredError / reference.byteLength;
  return {
    psnrRgb: mse === 0 ? null : 10 * Math.log10((255 * 255) / mse),
    maeRgb,
  };
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function closestSizeMatches(samples: SampleResult[]): SizeMatch[] {
  const sharpSamples = samples.filter((sample) => sample.encoder === "sharp");
  const zenpixSamples = samples.filter((sample) => sample.encoder === "zenpix");
  const matches: SizeMatch[] = [];
  const seen = new Set<string>();

  for (const zenpix of zenpixSamples) {
    const sharpSample = sharpSamples.reduce((best, current) =>
      Math.abs(current.bytes - zenpix.bytes) < Math.abs(best.bytes - zenpix.bytes) ? current : best
    );
    const key = `${sharpSample.quality}:${zenpix.quality}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const averageBytes = (sharpSample.bytes + zenpix.bytes) / 2;
    const sizeGapPercent = Math.abs(sharpSample.bytes - zenpix.bytes) / averageBytes * 100;
    const delta = sharpSample.psnrRgb === null || zenpix.psnrRgb === null
      ? null
      : zenpix.psnrRgb - sharpSample.psnrRgb;
    matches.push({
      sharpQuality: sharpSample.quality,
      zenpixQuality: zenpix.quality,
      sharpBytes: sharpSample.bytes,
      zenpixBytes: zenpix.bytes,
      sizeGapPercent: round(sizeGapPercent, 3),
      sharpPsnrRgb: sharpSample.psnrRgb,
      zenpixPsnrRgb: zenpix.psnrRgb,
      psnrDeltaZenpixMinusSharp: delta === null ? null : round(delta),
    });
  }

  return matches
    .filter((match) => match.sizeGapPercent <= 5)
    .sort((a, b) => (a.sharpBytes + a.zenpixBytes) - (b.sharpBytes + b.zenpixBytes));
}

mkdirSync(outDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  warning: "Encoder quality numbers are not equivalent. Use sizeMatches and visual crops for cross-encoder claims.",
  environment: {
    os: platform(),
    osRelease: release(),
    arch: arch(),
    bun: Bun.version,
    sharp: sharp.versions,
  },
  config: { speed, outWidth, outHeight, qualities },
  fixtures: [] as Array<{
    id: string;
    sourceFile: string;
    width: number;
    height: number;
    referenceFile: string;
    samples: SampleResult[];
    sizeMatches: SizeMatch[];
  }>,
};

console.log(`quality sweep=${qualities.join(",")} speed=${speed}`);
console.log(`output=${outDir}`);

for (const fixture of fixtures) {
  const fixtureOutDir = join(outDir, fixture.id);
  mkdirSync(fixtureOutDir, { recursive: true });

  const source = readFileSync(join(fixturesDir, fixture.file));
  const resizedPng = await sharp(source)
    .resize(outWidth, outHeight, { fit: "inside" })
    .png()
    .toBuffer();
  const referenceFile = join(fixtureOutDir, "reference.png");
  writeFileSync(referenceFile, resizedPng);

  const { data: referenceRgb, info: referenceInfo } = await sharp(resizedPng)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const zenpixInput = decode(resizedPng);
  const samples: SampleResult[] = [];

  for (const quality of qualities) {
    const sharpAvif = await sharp(resizedPng)
      .avif({ quality, speed } as never)
      .toBuffer();
    const zenpixAvif = encodeAvif(zenpixInput, { quality, speed, threads: 1 });
    if (!zenpixAvif) throw new Error(`zenpix AVIF encode failed for ${fixture.id} q${quality}`);

    for (const [encoder, encoded] of [["sharp", sharpAvif], ["zenpix", zenpixAvif]] as const) {
      const file = join(fixtureOutDir, `${encoder}-q${quality}.avif`);
      writeFileSync(file, encoded);
      const metadata = await sharp(encoded).metadata();
      const candidateRgb = await sharp(encoded).removeAlpha().raw().toBuffer();
      const error = rgbError(referenceRgb, candidateRgb);
      samples.push({
        encoder,
        quality,
        bytes: encoded.byteLength,
        bitsPerPixel: round(encoded.byteLength * 8 / (referenceInfo.width * referenceInfo.height)),
        psnrRgb: error.psnrRgb === null ? null : round(error.psnrRgb),
        maeRgb: round(error.maeRgb),
        chromaSubsampling: metadata.chromaSubsampling,
        hasAlpha: metadata.hasAlpha,
        hasIcc: metadata.icc !== undefined && metadata.icc.byteLength > 0,
        containerNclx: findNclx(encoded),
        file,
      });
    }
  }

  const sizeMatches = closestSizeMatches(samples);
  report.fixtures.push({
    id: fixture.id,
    sourceFile: join(fixturesDir, fixture.file),
    width: referenceInfo.width,
    height: referenceInfo.height,
    referenceFile,
    samples,
    sizeMatches,
  });

  console.log(`${fixture.id}: ${referenceInfo.width}x${referenceInfo.height}`);
  for (const match of sizeMatches) {
    const delta = match.psnrDeltaZenpixMinusSharp;
    console.log(
      `  size-match sharp q${match.sharpQuality} ${match.sharpBytes}B vs zenpix q${match.zenpixQuality} ${match.zenpixBytes}B` +
      ` gap=${match.sizeGapPercent.toFixed(2)}% PSNR delta=${delta === null ? "exact" : `${delta >= 0 ? "+" : ""}${delta.toFixed(3)} dB`}`,
    );
  }
}

const reportFile = join(outDir, "report.json");
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`report=${reportFile}`);
