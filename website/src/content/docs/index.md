---
title: Getting Started
description: A native C image-processing engine exposed through a TypeScript API and CLI.
---

zenpix exposes a native C image-processing engine through a TypeScript API and CLI. It decodes JPEG / PNG / WebP / AVIF / GIF / HEIC and encodes WebP / AVIF / PNG after Lanczos-3 resizing on Node.js, Bun, and Deno.

The browser package [zenpix-wasm](/wasm) only encodes raw RGB / RGBA pixels to AVIF. It does not include native zenpix decoding, resizing, or the CLI.

- **npm (server)**: https://www.npmjs.com/package/zenpix
- **npm (browser/WASM)**: https://www.npmjs.com/package/zenpix-wasm
- **GitHub**: https://github.com/tsukasa-art/zenpix

---

## Install

**Node.js / Bun (server-side)**

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

> Normal use requires `--allow-ffi` and `--allow-read` for input files. Add `--allow-env=ZENPIX_LIB` only when using the optional `ZENPIX_LIB` override.

**Browser / Cloudflare Pages (WASM)**

```bash
npm install zenpix-wasm
```

See [Browser (WASM)](/wasm) for the full guide.

---

## Check installed version

```bash
# native
npx zenpix --version
npm list zenpix

# wasm
npm list zenpix-wasm
```

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
| Resize | Scalar-reference two-pass Lanczos-3; next-source NEON / SSE2 for RGBA with scalar fallback; fit modes: stretch / contain / cover |
| Encode | WebP / AVIF (configurable threads) / PNG |
| CLI | `npx zenpix` (batch & stdin/stdout support) |
| RGBA | Background removal, rounded corners, white background compositing |
| Pipeline | `convert()`: decode → crop → resize → encode in one call |

---

## Reading performance measurements

Processing time varies with the CPU, thread count, image characteristics, resolution, and dependency versions. Historical measurements include selected low-core VPS cases where zenpix was faster and macOS or other-image cases where Sharp was faster.

Numbers without redistributable fixtures are not treated as general performance evidence. See [Benchmarks](/benchmarks) for conditions and limitations.

The published zenpix 1.0.2 package is scalar. The RGBA NEON / SSE2 implementation is in the unpublished native 1.0.3 source. GitHub Actions run `30674867350` passed on all five target environments. Local verification created all seven native 1.0.3 / WASM 1.1.0 tarballs and passed the packed macOS arm64 API / CLI and packed WASM browser smoke tests. Registry-published 1.0.3 packages and production use remain unverified.
