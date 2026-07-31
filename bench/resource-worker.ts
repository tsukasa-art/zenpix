/** Run one sequential decode -> resize -> AVIF workload in a fresh process. */

import { readFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { spawnSync } from "node:child_process";
import { decode, encodeAvif, resize } from "../js/dist/index.js";
import sharp from "sharp";

type Engine = "sharp-default" | "sharp-tuned" | "sharp-historical" | "zenpix-1" | "zenpix-2";

const engine = (process.env.BENCH_ENGINE ?? "") as Engine;
if (!["sharp-default", "sharp-tuned", "sharp-historical", "zenpix-1", "zenpix-2"].includes(engine)) {
  throw new Error("BENCH_ENGINE must be sharp-default, sharp-tuned, sharp-historical, zenpix-1, or zenpix-2");
}

function integerEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer in ${min}..${max}`);
  }
  return value;
}

const fixturePath = process.env.BENCH_FIXTURE_PATH ?? "/fixtures/bench_landscape_light.png";
const warmup = integerEnv("BENCH_WARMUP_N", 1, 0, 100);
const iterations = integerEnv("BENCH_MEASURE_N", 5, 1, 1000);
const outWidth = integerEnv("BENCH_OUT_WIDTH", 1920, 1, 0xffff);
const outHeight = integerEnv("BENCH_OUT_HEIGHT", 1080, 1, 0xffff);
const defaultQuality = integerEnv("AVIF_QUALITY", 60, 0, 100);
const quality = engine === "sharp-historical"
  ? 70
  : engine.startsWith("sharp")
  ? integerEnv("SHARP_AVIF_QUALITY", defaultQuality, 0, 100)
  : integerEnv("ZENPIX_AVIF_QUALITY", defaultQuality, 0, 100);
const speed = integerEnv("AVIF_SPEED", 6, 0, 10);
const input = readFileSync(fixturePath);

if (engine === "sharp-tuned") {
  sharp.concurrency(1);
  sharp.cache(false);
}

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))]!;
}

function pkgVersion(name: string): string | null {
  const result = spawnSync("pkg-config", ["--modversion", name], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function runOnce(): Promise<{ elapsedMs: number; outputBytes: number }> {
  const started = performance.now();
  let outputBytes: number;
  if (engine === "sharp-historical") {
    // Reproduce the March 2026 website upload route before AVIF was removed:
    // full-resolution WebP, full-resolution AVIF, then an original-format
    // output capped at 4096px. Network uploads are intentionally excluded.
    const image = sharp(input);
    const webp = await image.clone().webp({ quality: 85 }).toBuffer();
    const avif = await image.clone().avif({ quality: 70 }).toBuffer();
    const original = await image
      .clone()
      .resize(4096, 4096, { fit: "inside", withoutEnlargement: true })
      .toBuffer();
    outputBytes = webp.byteLength + avif.byteLength + original.byteLength;
  } else if (engine.startsWith("sharp")) {
    const encoded = await sharp(input)
      .resize(outWidth, outHeight, { fit: "cover", position: "centre" })
      .avif({ quality, speed } as never)
      .toBuffer();
    outputBytes = encoded.byteLength;
  } else {
    const threads = engine === "zenpix-2" ? 2 : 1;
    const decoded = decode(input);
    const resized = resize(decoded, {
      width: outWidth,
      height: outHeight,
      fit: "cover",
      threads,
    });
    const encoded = encodeAvif(resized, { quality, speed, threads });
    if (!encoded) throw new Error("zenpix AVIF encode returned null");
    outputBytes = encoded.byteLength;
  }
  return { elapsedMs: performance.now() - started, outputBytes };
}

for (let i = 0; i < warmup; i++) await runOnce();

const elapsedMs: number[] = [];
const outputBytes: number[] = [];
for (let i = 0; i < iterations; i++) {
  const result = await runOnce();
  elapsedMs.push(result.elapsedMs);
  outputBytes.push(result.outputBytes);
}

const sorted = [...elapsedMs].sort((a, b) => a - b);
const median = sorted.length % 2 === 0
  ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
  : sorted[Math.floor(sorted.length / 2)]!;

process.stdout.write(JSON.stringify({
  engine,
  fixturePath,
  pipeline: engine === "sharp-historical"
    ? "historical upload: full-resolution WebP + full-resolution AVIF + original capped at 4096px"
    : `decode -> cover ${outWidth}x${outHeight} -> AVIF`,
  quality,
  speed,
  warmup,
  iterations,
  elapsedMs,
  medianMs: median,
  p95Ms: percentile(elapsedMs, 0.95),
  outputBytes: [...new Set(outputBytes)],
  environment: {
    os: platform(),
    osRelease: release(),
    arch: arch(),
    runtime: (globalThis as { Bun?: { version: string } }).Bun
      ? { name: "bun", version: (globalThis as { Bun: { version: string } }).Bun.version }
      : { name: "node", version: process.version },
    sharp: sharp.versions,
    sharpConcurrency: sharp.concurrency(),
    sharpCache: sharp.cache(),
    zenpixLib: process.env.ZENPIX_LIB,
    zenpixDependencies: {
      libavif: pkgVersion("libavif"),
      libwebp: pkgVersion("libwebp"),
      libjpeg: pkgVersion("libjpeg"),
      libpng: pkgVersion("libpng"),
    },
  },
}));
