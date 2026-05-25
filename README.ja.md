# zenpix

C 製の高品質・高速画像処理ライブラリです。JPEG / PNG / WebP / AVIF / GIF / HEIC をデコードし、Lanczos-3 リサイズを経て WebP / AVIF / PNG にエンコードします。Node.js / Bun / Deno 対応（FFI 経由）。ビルド環境は不要です。

**npm:** [zenpix](https://www.npmjs.com/package/zenpix)（Node / Bun / Deno・ネイティブ）

---

## インストール

```bash
npm install zenpix
```

> ESM 専用パッケージです。`package.json` に `"type": "module"` が必要です。CommonJS（`require`）は非対応です。

**Deno:**

```typescript
import { decode, encodeAvif } from "npm:zenpix/deno";
// 実行時に --allow-ffi フラグが必要
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

## ドキュメント

- [はじめに / API リファレンス](./docs/reference/index.md)
- [CLI ガイド](./docs/reference/cli.md)
- [ベンチマーク詳細](./docs/reference/benchmarks.md)
- [動作環境・トラブルシューティング](./docs/reference/environments.md)

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
