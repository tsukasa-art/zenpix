# zenpix ドキュメント

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

```typescript
import { decode, encodeAvif } from "npm:zenpix/deno";
// 実行時に --allow-ffi フラグが必要
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

HEIC（iPhone 写真）をデコードする場合：

```typescript
import { decodeHeic, encodeAvif } from "zenpix";
import { readFileSync, writeFileSync } from "fs";

const image = decodeHeic(readFileSync("IMG_0001.HEIC"));
const avif  = encodeAvif(image, { quality: 60 });
if (avif) writeFileSync("output.avif", avif);
```

---

## 主な機能

| 機能 | 内容 |
|---|---|
| デコード | JPEG / PNG / WebP / AVIF / GIF（先頭フレーム）/ HEIC·HEIF（macOS・Linux） |
| リサイズ | Lanczos-3、SIMD 最適化（NEON/SSE2）、fit モード（stretch / contain / cover） |
| エンコード | WebP / AVIF（threads 指定可）/ PNG |
| CLI | `npx zenpix`（バッチ・stdin/stdout 対応） |
| RGBA | 背景除去・角丸・白背景合成 |
| パイプライン | `convert()` で decode → crop → resize → encode を一発実行 |

---

## VPS 環境でのパフォーマンス（対 Sharp）

2 vCPU の VPS で複雑なイラスト・キャラクター画像を変換する場合：

| フィクスチャ | FHD ratio | WQHD ratio | 4K ratio |
|---|:---:|:---:|:---:|
| キャラクターイラスト | **1.43×** | **1.35×** | **1.29×** |
| 厚塗り風景 | **1.62×** | **1.45×** | **1.63×** |

ratio = Sharp 中央値 ÷ zenpix 中央値。詳細は [ベンチマーク](./benchmarks.md) を参照してください。

---

## ドキュメント

- [CLI ガイド](./cli.md) — コマンドラインオプション・使用例
- [API リファレンス](./api.md) — 全関数・型定義
- [ベンチマーク](./benchmarks.md) — VPS / Mac 実測データ・比較の読み方
- [動作環境・トラブルシューティング](./environments.md) — 対応 OS / ランタイム・よくあるエラー
