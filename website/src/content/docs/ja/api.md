---
title: API リファレンス
description: zenpix の全 API 関数・TypeScript 型定義のリファレンス。
---

```typescript
import {
  decode, decodeHeic,
  resize, encodeWebP, encodeAvif, encodePng,
  crop, convert,
  removeBackground, flattenBackground, roundCorners,
} from "zenpix";
```

---

## decode

```typescript
function decode(input: Buffer | Uint8Array): ImageBuffer
```

JPEG・PNG・静止画 WebP・AVIF・GIF（先頭フレームのみ、RGB 出力）をデコードして生ピクセルデータを返します。

**非対応フォーマット**: アニメーション WebP・アニメーション GIF（2フレーム目以降）。HEIC / HEIF は `decodeHeic()` を使ってください。失敗時は `zenpix: decode failed` をスローします。

JPEG の EXIF Orientation は自動適用されます（Orientation 2〜8 すべて処理済み）。

```typescript
interface ImageBuffer {
  data: Buffer;     // 生ピクセル（row-major, top-left origin）
  width: number;
  height: number;
  channels: number; // 3 = RGB, 4 = RGBA
  icc?: Buffer;     // 埋め込み ICC プロファイル（ない画像では省略）
}
```

---

## decodeHeic

```typescript
function decodeHeic(input: Buffer | Uint8Array): ImageBuffer
```

HEIC / HEIF ファイルをデコードして生ピクセルデータを返します。iPhone で撮影した `.HEIC` 写真をそのまま処理できます。

**対応プラットフォーム**: macOS・Linux のみ。Windows では `zenpix: HEIC decode is not available on this platform` をスローします。

```typescript
import { decodeHeic, resize, encodeAvif } from "zenpix";
import { readFileSync, writeFileSync } from "fs";

const image   = decodeHeic(readFileSync("IMG_0001.HEIC"));
const resized = resize(image, { width: 1920, height: 1080, fit: "cover" });
const avif    = encodeAvif(resized, { quality: 60 });
if (avif) writeFileSync("output.avif", avif);
```

---

## resize

```typescript
function resize(image: ImageBuffer, options: ResizeOptions): ImageBuffer
```

Lanczos-3 フィルタでリサイズします。`width` / `height` の片方を省略するとアスペクト比を維持します。入力に `icc` がある場合は出力にも引き継ぎます。

```typescript
interface ResizeOptions {
  width?: number;
  height?: number;
  threads?: number;
  fit?: "stretch" | "contain" | "cover";
}
```

---

## encodeWebP

```typescript
function encodeWebP(image: ImageBuffer, options?: WebPOptions): Buffer
```

WebP にエンコードします。`image.icc` が設定されていれば ICCP チャンクとして埋め込みます。

```typescript
interface WebPOptions {
  quality?: number;   // 0–100（デフォルト: 92）
  lossless?: boolean; // ロスレス（デフォルト: false）
}
```

---

## encodeAvif

```typescript
function encodeAvif(image: ImageBuffer, options?: AvifOptions): Buffer | Uint8Array | null
```

AVIF にエンコードします。`quality` / `speed` が範囲外、または AVIF 無効ビルドの場合は `null` を返します。

> Node.js / Bun では `Buffer`、Deno では `Uint8Array` を返します。

```typescript
interface AvifOptions {
  quality?: number; // 0–100（デフォルト: 60）
  speed?: number;   // 0–10（デフォルト: 6）。10 が最速
  threads?: number; // エンコードスレッド数（デフォルト: 1）
}
```

---

## encodePng

```typescript
function encodePng(image: ImageBuffer, options?: PngOptions): Buffer | Uint8Array
```

PNG にエンコードします。`compression` が 0–9 の範囲外の場合は `Error` をスローします。

```typescript
interface PngOptions {
  compression?: number; // zlib 圧縮レベル 0–9（デフォルト: 6）
}
```

---

## crop

```typescript
function crop(image: ImageBuffer, options: CropOptions): ImageBuffer
```

ピクセルデータから矩形領域を切り出します。範囲外・ゼロ次元・不正値の場合は `Error` をスローします。

```typescript
interface CropOptions {
  left: number;
  top: number;
  width: number;
  height: number;
}
```

---

## convert

```typescript
function convert(
  input: Buffer | Uint8Array,
  options: ConvertOptions
): Buffer | Uint8Array | null
```

decode → crop → resize → encode を一発実行するパイプライン関数です。

```typescript
interface ConvertOptions {
  crop?: CropOptions;
  resize?: ResizeOptions;
  encode:
    | { format: "webp"; quality?: number; lossless?: boolean }
    | { format: "avif"; quality?: number; speed?: number; threads?: number }
    | { format: "png";  compression?: number };
}
```

```typescript
const avif = convert(readFileSync("photo.jpg"), {
  resize: { width: 1920, height: 1080, fit: "contain" },
  encode: { format: "avif", quality: 60, speed: 10 },
});
if (avif) writeFileSync("output.avif", avif);
```

---

## removeBackground

```typescript
function removeBackground(
  image: ImageBuffer,
  options?: { threshold?: number }
): ImageBuffer
```

四隅からのフラッドフィルで白系ピクセルを透過化します（RGB → RGBA）。`threshold` は白と判定する距離（0–255、デフォルト: 30）。

```typescript
const image = decode(readFileSync("icon.jpg"));
const noBg  = removeBackground(image, { threshold: 30 });
writeFileSync("icon-transparent.png", encodePng(noBg));
```

---

## flattenBackground

```typescript
function flattenBackground(image: ImageBuffer): ImageBuffer
```

RGBA 画像を白背景に合成して RGB に変換します。`removeBackground` の前処理として使います。

```typescript
const image = decode(readFileSync("icon.png"));
const flat  = flattenBackground(image);
const noBg  = removeBackground(flat, { threshold: 30 });
writeFileSync("icon-clean.png", encodePng(noBg));
```

---

## roundCorners

```typescript
function roundCorners(
  image: ImageBuffer,
  options: { radius: number | "full" }
): ImageBuffer
```

角丸マスクを適用します（RGB → RGBA）。`radius: "full"` で完全な円形になります。

```typescript
const image   = decode(readFileSync("icon.png"));
const noBg    = removeBackground(flattenBackground(image), { threshold: 30 });

const rounded = roundCorners(noBg, { radius: 40 });
writeFileSync("icon-rounded.png", encodePng(rounded));

const circle  = roundCorners(noBg, { radius: "full" });
writeFileSync("icon-circle.png", encodePng(circle));
```
