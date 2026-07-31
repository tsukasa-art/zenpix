---
title: はじめに
description: C ネイティブ画像処理エンジンを TypeScript API / CLI から使う zenpix の概要。
---

C ネイティブ画像処理エンジンを TypeScript API / CLI から利用するライブラリです。JPEG / PNG / WebP / AVIF / GIF / HEIC をデコードし、Lanczos-3 リサイズを経て WebP / AVIF / PNG にエンコードします。Node.js / Bun / Deno に対応します。

ブラウザ向けの [zenpix-wasm](/ja/wasm) は、RGB / RGBA 生ピクセルからの AVIF encode 専用です。ネイティブ版の decode、resize、CLI は含みません。

- **npm（サーバー）**: https://www.npmjs.com/package/zenpix
- **npm（ブラウザ / WASM）**: https://www.npmjs.com/package/zenpix-wasm
- **GitHub**: https://github.com/tsukasa-art/zenpix

---

## インストール

**Node.js / Bun（サーバーサイド）**

```bash
npm install zenpix
```

> ESM 専用パッケージです。`package.json` に `"type": "module"` が必要です。CommonJS（`require`）は非対応です。

**Deno**

```bash
deno add npm:zenpix
```

または直接 `npm:` specifier を使用：

```typescript
import { decode, encodeAvif } from "npm:zenpix/deno";
```

> 通常利用では`--allow-ffi`と入力ファイル用の`--allow-read`が必要です。optionalな`ZENPIX_LIB`上書きを使う場合だけ`--allow-env=ZENPIX_LIB`を追加します。

**ブラウザ / Cloudflare Pages（WASM）**

```bash
npm install zenpix-wasm
```

詳細は[ブラウザ（WASM）](/ja/wasm)を参照してください。

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
import { decode, resize, encodeAvif } from "zenpix";
import { readFileSync, writeFileSync } from "fs";

const image   = decode(readFileSync("photo.jpg"));
const resized = resize(image, { width: 1920, height: 1080, fit: "cover" });
const avif    = encodeAvif(resized, { quality: 60, threads: 4 });
if (avif) writeFileSync("output.avif", avif);
```

`convert()` でパイプラインをワンライナーに：

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

## 主な機能

| 機能 | 内容 |
|---|---|
| デコード | JPEG / PNG / WebP / AVIF / GIF（先頭フレーム） |
| リサイズ | scalar基準の2-pass Lanczos-3。次期sourceではRGBAにNEON / SSE2、その他はscalar fallback。fitモード（stretch / contain / cover） |
| エンコード | WebP / AVIF（threads 指定可）/ PNG |
| CLI | `npx zenpix`（バッチ・stdin/stdout 対応） |
| RGBA | 背景除去・角丸・白背景合成 |
| パイプライン | `convert()` で decode → crop → resize → encode を一発実行 |

---

## 性能測定の読み方

処理時間はCPU、スレッド数、画像の特徴、解像度、依存ライブラリによって変わります。過去の測定には、少コアVPSの一部画像でzenpixが速い結果と、Macや別種の画像でSharpが速い結果の両方があります。

再配布可能なfixtureがない数値は一般性能の根拠には使用しません。条件と制約は[ベンチマーク](/ja/benchmarks)を参照してください。

公開済みnpm 1.0.2はscalarです。RGBA用NEON / SSE2は未公開の次期sourceにあり、Actions実走・packed artifact・npm配布物・本番利用は未確認です。
