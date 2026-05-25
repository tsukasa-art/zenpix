---
title: Benchmarks
description: zenpix vs Sharp — real-world measurements on VPS and Mac, with guidance on reading the results.
---

---

## Reading the Results

When comparing zenpix and Sharp, two axes matter: **wall-clock** and **CPU user**.

| Metric | Meaning | zenpix position |
|---|---|---|
| **wall-clock** | Real elapsed time until completion | Sharp leads (faster for single requests) |
| **CPU user** | Total CPU time consumed across all cores | zenpix is significantly lower |

**Why CPU user matters**: On a 2–4 core VPS handling concurrent requests, high CPU user time means cores compete for work, directly increasing latency for other requests. A faster wall-clock tool that burns more CPU will hurt overall throughput as concurrency grows.

---

## Single-point Comparison (manual measurement)

**Condition**: 3840×2160 PNG → 1920×1080 AVIF (quality=60)  
**Environment**: macOS aarch64 (Apple M4 Pro), illustration fixture (`bench_chara_chika.png`)  
**Measurement**: `/usr/bin/time`, warm-up 3 / measure 7, median  
**Version**: zenpix 0.8.0

| Tool | wall-clock | CPU user | File size |
|---|---:|---:|---:|
| Sharp quality=60 (libvips auto-thread) | 0.422s | 2.630s | 63 KB |
| zenpix speed=10 (single-thread) | 0.512s | 0.530s | 106 KB |
| zenpix speed=6 (single-thread) | 0.992s | 1.000s | 73 KB |
| **zenpix speed=6 (threads=14)** | **0.610s** | 1.060s | 73 KB |

**Key takeaways**:
- Sharp wins on wall-clock (0.422s)
- zenpix CPU user is **~40% of Sharp** (1.060s vs 2.630s)
- `threads=14` cuts speed=6 wall-clock from 0.992s → 0.610s (−38%) with nearly flat CPU user

---

## Matrix Benchmark (bench/bench.ts)

**Condition**: PNG decode → Sharp resize to each resolution → AVIF encode (quality=60 / speed=6)  
warm-up 2, measure 10; each cell is the median wall-clock (ms)  
**ratio = Sharp median ÷ zenpix median** (> 1 means zenpix is faster)

### VPS (Ubuntu · 2vCPU · 2GB)

3 runs; median of 3 values per cell. Measured 2026-05-04, zenpix 0.4.0.

| Fixture | FHD (ratio) | WQHD (ratio) | 4K (ratio) |
|---|---:|---:|---:|
| bench_input (tile) | 0.26 | 0.25 | 0.24 |
| bench_chara_chika | **1.35** | **1.26** | **1.21** |
| bench_chara_kanata | **1.36** | **1.27** | **1.21** |
| bench_landscape_dark | **1.13** | **1.20** | 0.97 |
| bench_landscape_impasto | **1.47** | **1.37** | **1.44** |
| bench_landscape_light | **1.03** | 0.93 | 0.79 |

**Trend**: Tile images (bench_input) favor Sharp. Character art and impasto landscapes favor zenpix.

### Mac (M4 Pro · 14 cores)

3 runs; median of 3 values per cell. Measured 2026-04-15.

| Fixture | FHD (ratio) | WQHD (ratio) | 4K (ratio) |
|---|---:|---:|---:|
| bench_input | 0.26 | 0.18 | 0.15 |
| bench_chara_chika | 0.60 | 0.44 | 0.41 |
| bench_chara_kanata | 0.63 | 0.46 | 0.38 |
| bench_landscape_dark | 0.55 | 0.51 | 0.38 |
| bench_landscape_impasto | 0.57 | 0.44 | 0.37 |
| bench_landscape_light | 0.53 | 0.46 | 0.35 |

**Trend**: All cells < 1 on Mac (Sharp wins). The Mac table is used for regression detection; the VPS table is the externally relevant one.

### Mac Multi-threaded (threads=14)

Same conditions, same fixtures, with `threads=14` (`os.cpus().length`) passed to `encodeAvif`. Measured 2026-05-04.

| Fixture | FHD (ratio) | WQHD (ratio) | 4K (ratio) |
|---|---:|---:|---:|
| bench_input | 0.33 | 0.22 | 0.19 |
| bench_chara_chika | **1.01** | 0.77 | 0.69 |
| bench_chara_kanata | **1.00** | 0.76 | 0.70 |
| bench_landscape_dark | 0.69 | 0.76 | 0.54 |
| bench_landscape_impasto | 0.95 | 0.72 | 0.78 |
| bench_landscape_light | 0.74 | 0.64 | 0.48 |

**Trend**: All rows improve over single-thread. Character art FHD reaches parity with Sharp (1.00–1.01).

---

## Summary

| Use case | Recommendation |
|---|---|
| Single-request wall-clock priority | Sharp |
| VPS / low-core concurrent workloads | **zenpix** (CPU user ~40% of Sharp) |
| Per-call CPU budget control | **zenpix** (`threads` option) |
| Illustration / character AVIF on VPS | **zenpix** (ratio 1.2–1.5) |

---

## Visual Quality Comparison

Speed is one dimension — visual quality is another. At the same `quality=60` setting, zenpix preserves more tonal nuance in illustration content. Sharp discards subtle gradients more aggressively to achieve a smaller file size.

| Sharp (quality=60) | zenpix (quality=60) |
|:---:|:---:|
| ![Sharp output](/sample_sharp.png) | ![zenpix output](/sample_zenpix.png) |

*Pastel beach illustration. Sharp produces a smaller file by discarding subtle color transitions; zenpix retains them at a slightly larger size.*

---

## Re-running Benchmarks

```bash
npm run build
npx tsx bench/bench.ts

# Filter fixtures
BENCH_FIXTURES=bench_input,bench_chara_chika npx tsx bench/bench.ts

# Multi-thread measurement
npm run bench:threads

# Quality-matched comparison
npm run bench:quality
```

Results are written to `bench/results/benchmark.json` and `benchmark.md`.
