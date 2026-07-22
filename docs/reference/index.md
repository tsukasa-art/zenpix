# zenpix ドキュメント

Cネイティブ画像処理エンジンをTypeScript API / CLIから利用するライブラリです。JPEG / PNG / WebP / AVIF / GIF / HEICをデコードし、Lanczos-3リサイズを経てWebP / AVIF / PNGへエンコードします。Node.js / Bun / Denoに対応します。ブラウザ向けの`zenpix-wasm`は別実装で、RGB / RGBA生ピクセルからのAVIF encodeだけを提供します。

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

```typescript
import { decode, encodeAvif } from "npm:zenpix/deno";
// 通常は --allow-ffi と入力ファイル用の --allow-read が必要
```

`ZENPIX_LIB`でライブラリを上書きする場合だけ`--allow-env=ZENPIX_LIB`も必要です。

**ブラウザ / Cloudflare Pages（WASM）**

```bash
npm install zenpix-wasm
```

詳細は [../../wasm/README.md](../../wasm/README.md) を参照してください。

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
| リサイズ | scalar 2-pass Lanczos-3、fit モード（stretch / contain / cover） |
| エンコード | WebP / AVIF（threads 指定可）/ PNG |
| CLI | `npx zenpix`（バッチ・stdin/stdout 対応） |
| RGBA | 背景除去・角丸・白背景合成 |
| パイプライン | `convert()` で decode → crop → resize → encode を一発実行 |

---

## 性能の読み方

処理時間はCPU、スレッド数、画像、解像度、codec設定によって変わり、Sharpより速い結果と遅い結果の両方があります。再配布できないfixtureで得た過去の数値は、その条件の記録であり一般性能の根拠にはしません。詳細は[ベンチマーク](./benchmarks.md)を参照してください。

---

## ドキュメント

- [CLI ガイド](./cli.md) — コマンドラインオプション・使用例
- [API リファレンス](./api.md) — 全関数・型定義
- [ベンチマーク](./benchmarks.md) — VPS / Mac 実測データ・比較の読み方
- [動作環境・トラブルシューティング](./environments.md) — 対応 OS / ランタイム・よくあるエラー
