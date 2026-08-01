---
title: Browser (WASM)
description: zenpix-wasm — browser-side AVIF encoder compiled to WebAssembly.
---

`zenpix-wasm` encodes raw RGB / RGBA pixels to AVIF in the browser, with no server required. It does not include native zenpix decoding, resizing, or the CLI. It uses libavif + libaom compiled to WebAssembly via Emscripten.

- **npm**: https://www.npmjs.com/package/zenpix-wasm
- **GitHub**: https://github.com/tsukasa-art/zenpix

---

## When to use which package

| Use case | Package |
|---|---|
| Node.js / Bun / Deno server | `zenpix` (complete native pipeline) |
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
import { createAvifEncoder } from "zenpix-wasm/encoder";

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

## SIMD and baseline builds

`zenpix-wasm/encoder` is the high-level wrapper. It selects the baseline build by default and accepts `{ variant: "simd" }` for the SIMD build. `zenpix-wasm/simd` remains a raw Emscripten-generated factory.

In a 2026-05-28 Chrome / macOS arm64 measurement at `quality=60` and `speed=10`, the SIMD build ranged from equal to about 21% shorter processing time depending on image size. The input fixture was not retained in a reproducible form, so these numbers describe only that measurement and are not evidence of general performance.

To use the raw SIMD factory, provide its WASM URL explicitly:

```typescript
import createAvifModule from "zenpix-wasm/simd";
import wasmUrl from "zenpix-wasm/dist/avif.simd.wasm?url";

const Module = await createAvifModule({
  locateFile: (file: string) => file.endsWith(".wasm") ? wasmUrl : file,
});
```

The raw factory requires direct use of `_malloc`, `_avif_encode`, `_avif_get_out_size`, `_avif_free_output`, and `_free`. Use the high-level wrapper unless you need this lower-level API.

For compatibility with 1.0.0, the package root remains the baseline raw factory:

```typescript
import createAvifModule from "zenpix-wasm";
```

`zenpix-wasm/raw` is an explicit alias for that raw factory. The package remains ESM- and browser-oriented; Node.js smoke tests validate the generated WASM artifacts but do not promise browser API support in Node.js.

---

## Vite / bundler setup

Vite needs the `.wasm` file served as a URL. Pass it to `createAvifEncoder`:

```typescript
import wasmUrl from "zenpix-wasm/dist/avif.wasm?url";
import { createAvifEncoder } from "zenpix-wasm/encoder";

const enc = await createAvifEncoder({ variant: "baseline", wasmUrl });
```

## Worker (recommended for large images)

Processing time varies by device, input, and settings. Use a `Worker` when needed to avoid blocking the UI:

```js
// avif-worker.js
import { createAvifEncoder } from "zenpix-wasm/encoder";

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

### `createAvifEncoder(options?)`

Loads the WASM module and returns an `AvifEncoder`.

```typescript
type CreateAvifEncoderOptions = {
  variant?: "baseline" | "simd";
  wasmUrl?: string;
};

async function createAvifEncoder(
  options?: string | CreateAvifEncoderOptions,
): Promise<AvifEncoder>
```

- `variant` — `"baseline"` (default) or `"simd"`.
- `wasmUrl` — optional path/URL to the selected `.wasm` artifact. A string argument is kept as shorthand for the baseline `wasmUrl`.

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

## Historical measurement

Recorded on 2026-05-28 in Chrome on macOS arm64 at `speed=10`, using the median of three runs after one warm-up. The input fixture was not retained in a reproducible form, so this is not a reproducible benchmark or evidence of general performance.

| Size | Baseline (ms) | SIMD (ms) | Speedup |
|------|--------------|-----------|---------|
| 256×256    | 5.1 | 4.2 | 1.21× |
| 512×512    | 16.5 | 14.6 | 1.13× |
| 1024×1024  | 60.5 | 53.1 | 1.14× |

These values all use `speed=10`. Different devices, inputs, and quality / speed settings can produce different results.
