---
title: はじめに
description: zenpix — C 製の高速画像処理ライブラリ。npm install だけで Node.js / Bun / Deno で動く。
---

C 製の高速画像処理ライブラリ。JPEG / PNG / WebP / AVIF / GIF / HEIC をデコードし、Lanczos-3 リサイズを経て WebP / AVIF / PNG にエンコードします。Node.js / Bun / Deno 対応。

- **npm**: https://www.npmjs.com/package/zenpix
- **GitHub**: https://github.com/tsukasa-art/zenpix

---

## インストール

**Node.js / Bun**

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

> Deno での実行時は `--allow-ffi` フラグが必要です。

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
| リサイズ | Lanczos-3、SIMD 最適化（NEON/SSE2）、fit モード（stretch / contain / cover） |
| エンコード | WebP / AVIF（threads 指定可）/ PNG |
| CLI | `npx zenpix`（バッチ・stdin/stdout 対応） |
| RGBA | 背景除去・角丸・白背景合成 |
| パイプライン | `convert()` で decode → crop → resize → encode を一発実行 |

---

## Sharp との比較（CPU 効率）

VPS など少コア環境での CPU 消費が zenpix の強みです（3840×2160 → 1920×1080 AVIF、quality=60）：

| ツール | wall-clock | CPU user |
|---|---:|---:|
| Sharp（libvips 自動スレッド） | 0.422s | 2.630s |
| zenpix speed=6（threads=14） | 0.610s | **1.060s** |

CPU user が Sharp の **約 40%**。同じ CPU budget で **約 2.5 倍のリクエスト**をさばける計算です。詳細は[ベンチマーク](/ja/benchmarks)を参照してください。
