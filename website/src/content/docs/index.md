---
title: Getting Started
description: zenpix — Fast native image processing for Node.js, Bun, and Deno.
---

Fast image processing library written in C. Decodes JPEG / PNG / WebP / AVIF / GIF / HEIC and encodes to WebP / AVIF / PNG via Lanczos-3 resize. Works with Node.js, Bun, and Deno.

- **npm**: https://www.npmjs.com/package/zenpix
- **GitHub**: https://github.com/tsukasa-art/zenpix

---

## Install

**Node.js / Bun**

```bash
npm install zenpix
```

> ESM-only package. Requires `"type": "module"` in `package.json`. CommonJS (`require`) is not supported.

**Deno**

```bash
deno add npm:zenpix
```

Or use the `npm:` specifier directly:

```typescript
import { decode, encodeAvif } from "npm:zenpix/deno";
```

> Requires the `--allow-ffi` flag at runtime.

---

## Quick Start

```typescript
import { decode, resize, encodeAvif } from "zenpix";
import { readFileSync, writeFileSync } from "fs";

const image   = decode(readFileSync("photo.jpg"));
const resized = resize(image, { width: 1920, height: 1080, fit: "cover" });
const avif    = encodeAvif(resized, { quality: 60, threads: 4 });
if (avif) writeFileSync("output.avif", avif);
```

Use `convert()` as a one-liner pipeline:

```typescript
import { convert } from "zenpix";
import { readFileSync, writeFileSync } from "fs";

const result = convert(readFileSync("photo.jpg"), {
  resize: { width: 1920, height: 1080, fit: "cover" },
  encode: { format: "avif", quality: 60 },
});
if (result) writeFileSync("output.avif", result);
```

---

## Features

| Feature | Description |
|---|---|
| Decode | JPEG / PNG / WebP / AVIF / GIF (first frame) |
| Resize | Lanczos-3, SIMD optimized (NEON/SSE2), fit modes: stretch / contain / cover |
| Encode | WebP / AVIF (configurable threads) / PNG |
| CLI | `npx zenpix` (batch & stdin/stdout support) |
| RGBA | Background removal, rounded corners, white background compositing |
| Pipeline | `convert()`: decode → crop → resize → encode in one call |

---

## CPU Efficiency vs Sharp

zenpix excels in CPU efficiency on low-core VPS environments (3840×2160 → 1920×1080 AVIF, quality=60):

| Tool | wall-clock | CPU user |
|---|---:|---:|
| Sharp (libvips auto-thread) | 0.422s | 2.630s |
| zenpix speed=6 (threads=14) | 0.610s | **1.060s** |

CPU user is **~40% of Sharp** — roughly **2.5× more requests** for the same CPU budget. See [Benchmarks](/benchmarks) for details.
