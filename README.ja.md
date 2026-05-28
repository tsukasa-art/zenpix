# zenpix

C 製の高品質・高速画像処理ライブラリです。JPEG / PNG / WebP / AVIF / GIF / HEIC をデコードし、Lanczos-3 リサイズを経て WebP / AVIF / PNG にエンコードします。Node.js / Bun / Deno 対応（FFI 経由）。ビルド環境は不要です。

**npm:** [zenpix](https://www.npmjs.com/package/zenpix)（Node / Bun / Deno・ネイティブ）・[zenpix-wasm](https://www.npmjs.com/package/zenpix-wasm)（ブラウザ / Cloudflare Pages）

---

## インストール

**Node.js / Bun（サーバーサイド）**

```bash
npm install zenpix
```

> ESM 専用パッケージです。`package.json` に `"type": "module"` が必要です。CommonJS（`require`）は非対応です。

**Deno:**

```typescript
import { decode, encodeAvif } from "npm:zenpix/deno";
// 実行時に --allow-ffi フラグが必要
```

**ブラウザ / Cloudflare Pages（WASM）**

```bash
npm install zenpix-wasm
```

詳細は[ブラウザ（WASM）](#ブラウザwasm)セクションを参照してください。

---

## インストール済みバージョンの確認

```bash
# ネイティブ
npx zenpix --version
npm list zenpix

# WASM
npm list zenpix-wasm
```

---

## クイックスタート

```typescript
import { decode, resize, encodeAvif, convert } from "zenpix";
import { readFileSync, writeFileSync } from "fs";

// decode → resize → AVIF
const image   = decode(readFileSync("photo.jpg"));
const resized = resize(image, { width: 1920, height: 1080, fit: "cover" });
const avif    = encodeAvif(resized, { quality: 60, threads: 4 });
if (avif) writeFileSync("output.avif", avif);

// convert() でワンライナー
const result = convert(readFileSync("photo.jpg"), {
  resize: { width: 1920, height: 1080, fit: "cover" },
  encode: { format: "avif", quality: 60 },
});
if (result) writeFileSync("output.avif", result);
```

**CLI** — インストール不要で使えます：

```bash
npx zenpix photo.jpg                          # → photo.avif
npx zenpix *.jpg --out-dir ./avif/ --threads 4
npx zenpix icon.jpg favicon.png --remove-bg --round-corners full
```

---

## なぜ zenpix か

### 画質が高い — 常に

zenpix の AVIF エンコードは **YUV 4:4:4**（クロマサブサンプリングなし）を使用しています。Sharp のデフォルトは YUV 4:2:0 で、色差成分を 75% 間引きます。同じ `quality` 値でも、彩度の高い色・繊細なグラデーション・透過を含むイラストでは zenpix の出力のほうが色が正確に再現されます。アルファチャンネルは常にロスレスエンコード。

| Sharp (quality=60) | zenpix (quality=60) |
|:---:|:---:|
| ![sharp](assets/sample_sharp.png) | ![zenpix](assets/sample_zenpix.png) |

*パステル調ビーチイラスト。Sharp はニュアンス部分を間引いてファイルを小さくし、zenpix はやや大きくなる代わりに微妙なトーンを保持します。*

### VPS では速い — イラスト系コンテンツに限り

少コア VPS（2〜4 vCPU）でイラスト・キャラクター系の画像を扱う場合、zenpix は Sharp より **1.3〜1.6 倍高速**です。

| フィクスチャ | FHD ratio | WQHD ratio | 4K ratio |
|---|:---:|:---:|:---:|
| キャラクターイラスト | **1.43×** | **1.35×** | **1.29×** |
| 厚塗り風景 | **1.62×** | **1.45×** | **1.63×** |

*ratio = Sharp 中央値 ÷ zenpix 中央値（1 超なら zenpix が速い）。VPS: Ubuntu、2 vCPU。PNG → リサイズ → AVIF (quality=60, speed=6)。[詳細なベンチマーク →](./docs/reference/benchmarks.md)*

---

## 主な機能

- **デコード**: JPEG / PNG / WebP / AVIF / GIF（先頭フレーム）/ HEIC・HEIF（macOS・Linux のみ）
- **リサイズ**: Lanczos-3、SIMD 最適化（NEON/SSE2）、fit モード（stretch / contain / cover）
- **エンコード**: WebP / AVIF（`threads` オプションで per-call 指定可）/ PNG
- **パイプライン**: `convert()` — decode → crop → resize → encode を一発実行
- **CLI**: `npx zenpix`（バッチ・stdin/stdout 対応）
- **背景除去**: `removeBackground` / `roundCorners` / `flattenBackground`

---

## 動作環境

| ランタイム | macOS arm64 | macOS x64 | Linux x64 | Linux arm64 | Windows x64 |
|---|:---:|:---:|:---:|:---:|:---:|
| Node.js 18+ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bun | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deno 2.x | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## ブラウザ（WASM）

`zenpix-wasm` はブラウザ上で完全に AVIF エンコードを行います。サーバーへの送信は不要です。ネイティブ版と同じ libavif + libaom を Emscripten で WebAssembly にコンパイルしています。

**用途別パッケージの選択：**

| 用途 | パッケージ |
|---|---|
| Node.js / Bun / Deno サーバー | `zenpix`（ネイティブ・最速） |
| ブラウザ / Cloudflare Pages 静的 JS | `zenpix-wasm` |
| Cloudflare Workers Free | 非対応（CPU 10ms 制限） |

**クイック例：**

```typescript
import { createAvifEncoder } from "zenpix-wasm";

const enc = await createAvifEncoder();
// pixels: RGBA 生ピクセル（width × height × 4 の Uint8Array）
const avif = enc.encode(pixels, width, height, { quality: 60, speed: 10 });
if (avif) {
  const blob = new Blob([avif], { type: "image/avif" });
}
enc.dispose();
```

**SIMD 検出（推奨）：**

```typescript
const simdSupported = WebAssembly.validate(new Uint8Array([
  0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11
]));
const { createAvifEncoder } = simdSupported
  ? await import("zenpix-wasm/simd")   // Chrome 91+ / Firefox 89+ / Safari 16.4+
  : await import("zenpix-wasm");
```

**Vite — `.wasm` ファイルを URL で渡す：**

```typescript
import wasmUrl from "zenpix-wasm/dist/avif.wasm?url";
import { createAvifEncoder } from "zenpix-wasm";

const enc = await createAvifEncoder(wasmUrl);
```

詳細は [wasm/README.md](./wasm/README.md) を参照してください。

---

## ドキュメント

- [はじめに / API リファレンス](./docs/reference/index.md)
- [CLI ガイド](./docs/reference/cli.md)
- [ベンチマーク詳細](./docs/reference/benchmarks.md)
- [動作環境・トラブルシューティング](./docs/reference/environments.md)
- [ブラウザ（WASM）](./wasm/README.md)

---

## ライセンス

MIT © 2026 月村つかさ

使用ライブラリ: libjpeg-turbo, zlib, libpng, libwebp, libavif, libaom, libheif — 詳細は [THIRD_PARTY_LICENSES](./THIRD_PARTY_LICENSES)。

---

## 開発者向け

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
npm run build   # TypeScript → js/dist/
```

詳細は [docs/reference/environments.md](./docs/reference/environments.md) を参照してください。
