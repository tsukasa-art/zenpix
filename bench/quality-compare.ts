/**
 * bench/quality-compare.ts
 * 各 fixture を FHD にリサイズして zenpix と sharp で AVIF 出力し比較用サンプルを生成する。
 *
 * Run:
 *   bun bench/quality-compare.ts
 *   AVIF_QUALITY=60 AVIF_SPEED=6 bun bench/quality-compare.ts
 */

import { decode, resize, encodeAvif } from "../js/dist/index.js";
import sharp from "sharp";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "../test/fixtures");
const OUT_DIR = join(__dirname, "results/samples");

const QUALITY = parseInt(process.env.AVIF_QUALITY ?? "60", 10);
const SPEED   = parseInt(process.env.AVIF_SPEED   ?? "6",  10);
const OUT_W = 960;
const OUT_H = 540;

const FIXTURES = [
  { id: "bench_input",            file: "bench_input.png" },
  { id: "bench_chara_chika",      file: "bench_chara_chika.png" },
  { id: "bench_chara_kanata",     file: "bench_chara_kanata.png" },
  { id: "bench_landscape_dark",   file: "bench_landscape_dark.png" },
  { id: "bench_landscape_impasto",file: "bench_landscape_impasto.png" },
  { id: "bench_landscape_light",  file: "bench_landscape_light.png" },
];

mkdirSync(OUT_DIR, { recursive: true });

console.log(`quality=${QUALITY} speed=${SPEED}  output: ${OUT_DIR}\n`);

for (const fx of FIXTURES) {
  const src = readFileSync(join(FIXTURES_DIR, fx.file));

  // ── sharp ───────────────────────────────────────────────────────────────
  const sharpBuf = await sharp(src)
    .resize(OUT_W, OUT_H, { fit: "cover", position: "centre" })
    .avif({ quality: QUALITY, speed: SPEED } as never)
    .toBuffer();
  const sharpOut = join(OUT_DIR, `${fx.id}_sharp.avif`);
  writeFileSync(sharpOut, sharpBuf);

  // ── zenpix ──────────────────────────────────────────────────────────────
  const inputPng = await sharp(src)
    .resize(OUT_W, OUT_H, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  const img    = decode(inputPng);
  const small  = resize(img, { width: OUT_W, height: OUT_H });
  const avif   = encodeAvif(small, { quality: QUALITY, speed: SPEED });
  if (!avif) throw new Error(`encodeAvif failed for ${fx.id}`);
  const zenpixOut = join(OUT_DIR, `${fx.id}_zenpix.avif`);
  writeFileSync(zenpixOut, avif);

  const ratio = sharpBuf.byteLength / avif.byteLength;
  console.log(`${fx.id}`);
  console.log(`  sharp:  ${(sharpBuf.byteLength / 1024).toFixed(1)} KB  → ${sharpOut}`);
  console.log(`  zenpix: ${(avif.byteLength  / 1024).toFixed(1)} KB  → ${zenpixOut}  (size ratio vs sharp: ${ratio.toFixed(2)}×)`);
  console.log();
}

console.log("Done. Open bench/results/samples/ to compare.");
