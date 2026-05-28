---
title: Browser (WASM)
description: zenpix-wasm — browser-side AVIF encoder compiled to WebAssembly.
---

`zenpix-wasm` encodes AVIF entirely in the browser — no server required. It uses the same libavif + libaom as the native build, compiled to WebAssembly via Emscripten.

- **npm**: https://www.npmjs.com/package/zenpix-wasm
- **GitHub**: https://github.com/tsukasa-art/zenpix

---

## When to use which package

| Use case | Package |
|---|---|
| Node.js / Bun / Deno server | `zenpix` (native, fastest) |
| Browser / Cloudflare Pages static JS | `zenpix-wasm` |
| Cloudflare Workers Free | Not supported (10ms CPU limit) |

---

## Install

```bash
npm install zenpix-wasm
```

Check installed version:

```bash
npm list zenpix-wasm
```

---

## Quick Start

```typescript
import { createAvifEncoder } from "zenpix-wasm";

const enc = await createAvifEncoder();

// pixels: raw RGBA bytes — Uint8Array of length width × height × 4
const avif = enc.encode(pixels, width, height, { quality: 60, speed: 10 });

if (avif) {
  const blob = new Blob([avif], { type: "image/avif" });
  const url  = URL.createObjectURL(blob);
}

enc.dispose(); // free WASM heap (optional — GC will clean up)
```

---

## SIMD vs baseline

Two builds are available. SIMD is ~15% faster but requires a modern browser.

| Import | Browser support | Speed |
|--------|----------------|-------|
| `zenpix-wasm` | All browsers | baseline |
| `zenpix-wasm/simd` | Chrome 91+ / Firefox 89+ / Safari 16.4+ | ~15% faster |

**Auto-detect SIMD support (recommended):**

```typescript
const simdSupported = WebAssembly.validate(new Uint8Array([
  0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11
]));

const { createAvifEncoder } = simdSupported
  ? await import("zenpix-wasm/simd")
  : await import("zenpix-wasm");

const enc = await createAvifEncoder();
```

---

## Vite / bundler setup

Vite needs the `.wasm` file served as a URL. Pass it to `createAvifEncoder`:

```typescript
import wasmUrl from "zenpix-wasm/dist/avif.wasm?url";
import { createAvifEncoder } from "zenpix-wasm";

const enc = await createAvifEncoder(wasmUrl);
```

SIMD build:

```typescript
import wasmUrl from "zenpix-wasm/dist/avif.simd.wasm?url";
import { createAvifEncoder } from "zenpix-wasm/simd";

const enc = await createAvifEncoder(wasmUrl);
```

---

## Worker (recommended for large images)

At `speed=10`, encoding a 1024×1024 image takes ~60ms. To avoid blocking the UI, run the encoder inside a `Worker`:

```js
// avif-worker.js
import { createAvifEncoder } from "zenpix-wasm";

const enc = await createAvifEncoder();

self.onmessage = ({ data: { pixels, width, height, quality, speed } }) => {
  const avif = enc.encode(pixels, width, height, { quality, speed });
  self.postMessage({ avif }, avif ? [avif.buffer] : []);
};
```

```js
// main.js
const worker = new Worker("./avif-worker.js", { type: "module" });

worker.postMessage({ pixels, width, height, quality: 60, speed: 6 });
worker.onmessage = ({ data: { avif } }) => {
  if (avif) {
    const blob = new Blob([avif], { type: "image/avif" });
  }
};
```

---

## API

### `createAvifEncoder(wasmUrl?)`

Loads the WASM module and returns an `AvifEncoder`.

```typescript
async function createAvifEncoder(wasmUrl?: string): Promise<AvifEncoder>
```

- `wasmUrl` — optional path/URL to `avif.wasm`. Defaults to `./avif.wasm` (same directory as the JS bundle). Required when using Vite or other bundlers that hash asset filenames.

### `AvifEncoder`

| Member | Type | Description |
|--------|------|-------------|
| `encode(pixels, width, height, opts?)` | `Uint8Array \| null` | Encode raw pixel data to AVIF |
| `version` | `string` | libavif version (e.g. `"1.4.1"`) |
| `dispose()` | `void` | Free WASM heap allocations |

### `AvifEncodeOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `quality` | `number` | `60` | 0–100 (higher = better quality, larger file) |
| `speed` | `number` | `10` | 0–10 (10 = fastest / lowest quality) |

---

## Bundle size

| File | raw | gzip |
|------|-----|------|
| `avif.wasm` (baseline) | 3.4 MB | **1.1 MB** |
| `avif.simd.wasm` | 3.4 MB | **1.1 MB** |
| `avif.js` | 60 KB | — |

---

## Performance

Chrome (macOS arm64), `speed=10`, median of 3 runs (1 warm-up excluded):

| Size | Baseline (ms) | SIMD (ms) | Speedup |
|------|--------------|-----------|---------|
| 256×256    | 5.1 | 4.2 | 1.21× |
| 512×512    | 16.5 | 14.6 | 1.13× |
| 1024×1024  | 60.5 | 53.1 | 1.14× |

These are `speed=10` (fastest) values. Lower speed settings produce better quality but can be 10–30× slower.
