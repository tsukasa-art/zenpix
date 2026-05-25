/**
 * bench/bench.ts — zenpix (C) vs sharp benchmark
 *
 * Pipeline: decode PNG → resize → encodeAVIF
 * Input PNGs are symlinked from zenpix/test/fixtures/bench_*.png
 *
 * Run:
 *   bun run bench
 */

import { decode, resize, encodeAvif } from "../js/dist/index.js";
import sharp from "sharp";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "../test/fixtures");
const OUT_DIR = join(__dirname, "results");

const ALL_FIXTURES = [
  { id: "bench_input",           file: "bench_input.png",           label: "bench_input（512 系）" },
  { id: "bench_chara_chika",     file: "bench_chara_chika.png",     label: "キャラ（Chika）" },
  { id: "bench_chara_kanata",    file: "bench_chara_kanata.png",    label: "キャラ（Kanata）" },
  { id: "bench_landscape_dark",  file: "bench_landscape_dark.png",  label: "風景（トワイライト）" },
  { id: "bench_landscape_impasto", file: "bench_landscape_impasto.png", label: "風景（厚塗り）" },
  { id: "bench_landscape_light", file: "bench_landscape_light.png", label: "風景（ハイキー）" },
] as const;

function selectFixtures() {
  const raw = process.env.BENCH_FIXTURES?.trim();
  if (!raw) return ALL_FIXTURES;
  const want = new Set(raw.split(",").map(s => s.trim()).filter(Boolean));
  const picked = ALL_FIXTURES.filter(f => want.has(f.id));
  if (picked.length === 0) throw new Error(`BENCH_FIXTURES matched nothing. Known: ${ALL_FIXTURES.map(x => x.id).join(", ")}`);
  return picked;
}

const WARMUP_N  = Math.max(0, parseInt(process.env.BENCH_WARMUP_N  ?? "2",  10));
const MEASURE_N = Math.max(1, parseInt(process.env.BENCH_MEASURE_N ?? "10", 10));
const AVIF_QUALITY = 60;
const AVIF_SPEED   = 6;

const SCENARIOS = [
  { id: "fhd",   label: "FHD",  inW: 1920, inH: 1080, outW:  960, outH:  540 },
  { id: "wqhd",  label: "WQHD", inW: 2560, inH: 1440, outW: 1280, outH:  720 },
  { id: "uhd4k", label: "4K",   inW: 3840, inH: 2160, outW: 1920, outH: 1080 },
] as const;

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}
const fmt = (ms: number) => ms.toFixed(2);

async function makeInputPng(fixturePath: string, inW: number, inH: number): Promise<Buffer> {
  return sharp(readFileSync(fixturePath)).resize(inW, inH, { fit: "cover", position: "centre" }).png().toBuffer();
}

function benchZenpix(input: Buffer, outW: number, outH: number): number[] {
  const times: number[] = [];
  for (let i = 0; i < WARMUP_N + MEASURE_N; i++) {
    const t0 = performance.now();
    const img  = decode(input);
    const small = resize(img, { width: outW, height: outH });
    const avif  = encodeAvif(small, { quality: AVIF_QUALITY, speed: AVIF_SPEED });
    const t1 = performance.now();
    if (!avif) throw new Error("encodeAvif returned null");
    if (i >= WARMUP_N) times.push(t1 - t0);
  }
  return times;
}

async function benchSharp(input: Buffer, outW: number, outH: number): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < WARMUP_N + MEASURE_N; i++) {
    const t0 = performance.now();
    await sharp(input).resize(outW, outH).avif({ quality: AVIF_QUALITY, speed: AVIF_SPEED } as never).toBuffer();
    const t1 = performance.now();
    if (i >= WARMUP_N) times.push(t1 - t0);
  }
  return times;
}

// ── main ─────────────────────────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });

const fixtures = selectFixtures();
console.log(`zenpix (C) vs sharp — decode PNG → resize → AVIF (q=${AVIF_QUALITY}, speed=${AVIF_SPEED})`);
console.log(`warmup=${WARMUP_N} measure=${MEASURE_N}  fixtures: ${fixtures.map(f => f.id).join(", ")}\n`);

type Row = { fxId: string; scenario: string; zenpixMed: number; sharpMed: number; ratio: number };
const rows: Row[] = [];

for (const fx of fixtures) {
  const fixturePath = join(FIXTURES_DIR, fx.file);
  console.log(`▶ ${fx.label}`);

  for (const s of SCENARIOS) {
    process.stdout.write(`  ${s.label} (${s.inW}×${s.inH} → ${s.outW}×${s.outH}) … `);
    const inputPng = await makeInputPng(fixturePath, s.inW, s.inH);

    const zTimes = benchZenpix(inputPng, s.outW, s.outH);
    const sTimes = await benchSharp(inputPng, s.outW, s.outH);

    const zMed = median(zTimes);
    const sMed = median(sTimes);
    const ratio = sMed / zMed;

    console.log(`zenpix ${fmt(zMed)} ms  sharp ${fmt(sMed)} ms  ratio ${ratio.toFixed(2)}×`);
    rows.push({ fxId: fx.id, scenario: s.id, zenpixMed: zMed, sharpMed: sMed, ratio });
  }
  console.log();
}

// table
const colW = 12;
const pad = (s: string, w: number) => s.padStart(w);
console.log(`┌${"─".repeat(26)}┬────────┬──────────────┬──────────────┬──────────┐`);
console.log("│ fixture                  │ scen   │ zenpix med ms│ sharp med ms │ ratio    │");
console.log(`├${"─".repeat(26)}┼────────┼──────────────┼──────────────┼──────────┤`);
for (const r of rows) {
  const fx = r.fxId.padEnd(26);
  const sc = r.scenario.padEnd(6);
  console.log(`│ ${fx} │ ${sc} │ ${pad(fmt(r.zenpixMed), colW)} │ ${pad(fmt(r.sharpMed), colW)} │ ${pad(r.ratio.toFixed(2) + "×", 8)} │`);
}
console.log(`└${"─".repeat(26)}┴────────┴──────────────┴──────────────┴──────────┘`);
console.log("ratio = sharp ÷ zenpix median (>1 ⇒ zenpix faster)");

const now = new Date().toISOString();
writeFileSync(join(OUT_DIR, "benchmark.json"), JSON.stringify({ date: now, rows }, null, 2));
console.log(`\nSaved: ${OUT_DIR}/benchmark.json`);
