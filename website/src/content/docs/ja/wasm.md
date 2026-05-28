---
title: ブラウザ（WASM）
description: zenpix-wasm — WebAssembly にコンパイルしたブラウザ向け AVIF エンコーダ。
---

`zenpix-wasm` はブラウザ上で完全に AVIF エンコードを行います。サーバーへの送信は不要です。ネイティブ版と同じ libavif + libaom を Emscripten で WebAssembly にコンパイルしています。

- **npm**: https://www.npmjs.com/package/zenpix-wasm
- **GitHub**: https://github.com/tsukasa-art/zenpix

---

## 用途別パッケージの選択

| 用途 | パッケージ |
|---|---|
| Node.js / Bun / Deno サーバー | `zenpix`（ネイティブ・最速） |
| ブラウザ / Cloudflare Pages 静的 JS | `zenpix-wasm` |
| Cloudflare Workers Free | 非対応（CPU 10ms 制限） |

---

## インストール

```bash
npm install zenpix-wasm
```

バージョン確認：

```bash
npm list zenpix-wasm
```

---

## クイックスタート

```typescript
import { createAvifEncoder } from "zenpix-wasm";

const enc = await createAvifEncoder();

// pixels: RGBA 生ピクセル（width × height × 4 の Uint8Array）
const avif = enc.encode(pixels, width, height, { quality: 60, speed: 10 });

if (avif) {
  const blob = new Blob([avif], { type: "image/avif" });
  const url  = URL.createObjectURL(blob);
}

enc.dispose(); // WASM ヒープを解放（省略可、GC が回収する）
```

---

## SIMD 版 vs baseline 版

2 種類のビルドがあります。SIMD 版は約 15% 高速ですが、モダンブラウザが必要です。

| インポート | 対応ブラウザ | 速度 |
|---------|------------|------|
| `zenpix-wasm` | 全ブラウザ | 基準 |
| `zenpix-wasm/simd` | Chrome 91+ / Firefox 89+ / Safari 16.4+ | ~15% 高速 |

**SIMD 対応の自動検出（推奨）：**

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

## Vite / バンドラー

Vite では `.wasm` ファイルを URL として渡す必要があります：

```typescript
import wasmUrl from "zenpix-wasm/dist/avif.wasm?url";
import { createAvifEncoder } from "zenpix-wasm";

const enc = await createAvifEncoder(wasmUrl);
```

SIMD 版の場合：

```typescript
import wasmUrl from "zenpix-wasm/dist/avif.simd.wasm?url";
import { createAvifEncoder } from "zenpix-wasm/simd";

const enc = await createAvifEncoder(wasmUrl);
```

---

## Worker での使用（大画像・低 speed 設定時）

`speed=10` で 1024×1024 が約 60ms かかります。UI をブロックしないよう `Worker` 内での実行を推奨します：

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

WASM モジュールをロードして `AvifEncoder` を返します。

```typescript
async function createAvifEncoder(wasmUrl?: string): Promise<AvifEncoder>
```

- `wasmUrl` — `avif.wasm` のパス / URL（省略時は `./avif.wasm`）。Vite などアセットをハッシュ化するバンドラーでは指定が必要です。

### `AvifEncoder`

| メンバー | 型 | 説明 |
|--------|------|------|
| `encode(pixels, width, height, opts?)` | `Uint8Array \| null` | 生ピクセルを AVIF にエンコード |
| `version` | `string` | libavif バージョン（例: `"1.4.1"`） |
| `dispose()` | `void` | WASM ヒープを解放 |

### `AvifEncodeOptions`

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|------|
| `quality` | `number` | `60` | 0–100（高いほど高品質・ファイルが大きい） |
| `speed` | `number` | `10` | 0–10（10 = 最速・低品質） |

---

## バンドルサイズ

| ファイル | raw | gzip |
|------|-----|------|
| `avif.wasm`（baseline） | 3.4 MB | **1.1 MB** |
| `avif.simd.wasm` | 3.4 MB | **1.1 MB** |
| `avif.js` | 60 KB | — |

---

## パフォーマンス実測値

Chrome（macOS arm64）、`speed=10`、ウォームアップ 1 回除外・3 回中央値：

| サイズ | Baseline (ms) | SIMD (ms) | Speedup |
|--------|--------------|-----------|---------|
| 256×256    | 5.1 | 4.2 | 1.21× |
| 512×512    | 16.5 | 14.6 | 1.13× |
| 1024×1024  | 60.5 | 53.1 | 1.14× |

これらはすべて `speed=10`（最速設定）の値です。speed を下げると高品質になりますが、10〜30 倍程度遅くなります。
