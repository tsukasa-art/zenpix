# API リファレンス

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

JPEG・PNG・静止画 WebP・AVIF・GIF（先頭フレームのみ）をデコードして生ピクセルデータを返します。

JPEG の EXIF Orientation は自動適用されます（Orientation 2〜8 すべて処理済み）。  
失敗時は `zenpix: decode failed` をスローします。

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

HEIC / HEIF ファイルをデコードして生ピクセルデータを返します。

**対応プラットフォーム**: macOS・Linux のみ（Windows はサポート外）。  
**ライセンス**: デコードのみ（エンコードは提供しません）。  
失敗時は `zenpix: HEIC decode failed` をスローします。

iPhone で撮影した `.HEIC` 写真をそのまま処理できます：

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
  threads?: number;                           // 並列スレッド数（デフォルト: 1）
  fit?: "stretch" | "contain" | "cover";
  // "stretch"（デフォルト）: width / height をそのまま使用
  // "contain": 縦横比を保ちながら枠内に収める（letterbox）
  // "cover":   縦横比を保ちながら枠全体を覆う（中央クロップ）
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
function encodeAvif(image: ImageBuffer, options?: AvifOptions): Buffer | null
```

AVIF にエンコードします。`image.icc` が設定されていれば ICC プロファイルを埋め込みます。ICCがない場合はsRGBの色特性を明示します。以下の場合は `null` を返します：

- `quality` が 0–100 の範囲外
- `speed` が 0–10 の範囲外

```typescript
interface AvifOptions {
  quality?: number; // 0–100（デフォルト: 60）
  speed?: number;   // 0–10（デフォルト: 6）。10 が最速、0 が最高品質
  threads?: number; // エンコードスレッド数（デフォルト: 1）。バッチ処理時は os.cpus().length を推奨
}
```

---

## encodePng

```typescript
function encodePng(image: ImageBuffer, options?: PngOptions): Buffer
```

PNG にエンコードします。`image.icc` が設定されていれば iCCP チャンクとして埋め込みます。

```typescript
interface PngOptions {
  compression?: number; // zlib 圧縮レベル 0–9（デフォルト: 6）
}
```

---

## convert

```typescript
function convert(input: Buffer | Uint8Array, options: ConvertOptions): Buffer | null
```

decode → crop → resize → encode をワンコールで実行します。`encodeAvif` が `null` を返す場合のみ `null` を返します。

```typescript
interface ConvertOptions {
  crop?: CropOptions;
  resize?: ResizeOptions;
  encode: { format: "webp" } & WebPOptions
       | { format: "avif" } & AvifOptions
       | { format: "png"  } & PngOptions;
}
```

---

## crop

```typescript
function crop(image: ImageBuffer, options: CropOptions): ImageBuffer
```

矩形領域を切り出します。ICC プロファイルは引き継ぎます。領域が画像外にはみ出す場合はスローします。

```typescript
interface CropOptions {
  left: number;
  top: number;
  width: number;
  height: number;
}
```

---

## removeBackground

```typescript
function removeBackground(image: ImageBuffer, options?: RemoveBackgroundOptions): ImageBuffer
```

四隅からの BFS フラッドフィルで白（または白に近い）背景を透過にします。出力は常に RGBA（channels=4）。

```typescript
interface RemoveBackgroundOptions {
  threshold?: number; // 0–255（デフォルト: 30）。値が大きいほど広範囲を除去
}
```

---

## flattenBackground

```typescript
function flattenBackground(image: ImageBuffer, options?: FlattenBackgroundOptions): ImageBuffer
```

RGBA 画像を指定背景色で合成して RGB に変換します。`removeBackground` の前処理として、透過 PNG に残る白リングを除去するときに使います。入力が RGB（channels=3）の場合はそのまま返します。

```typescript
interface FlattenBackgroundOptions {
  r?: number; // 0–255（デフォルト: 255）
  g?: number; // 0–255（デフォルト: 255）
  b?: number; // 0–255（デフォルト: 255）
}
```

---

## roundCorners

```typescript
function roundCorners(image: ImageBuffer, options: RoundCornersOptions): ImageBuffer
```

RGBA 画像に角丸マスクを適用します（入力は channels=4 必須）。1px のアンチエイリアス境界付き。出力は RGBA。

```typescript
interface RoundCornersOptions {
  radius: number | "full"; // px 数、または "full"（円形クロップ）
}
```

---

## フォーマット対応表

| フォーマット | デコード | エンコード | 備考 |
|---|:---:|:---:|---|
| JPEG | ✅ | — | EXIF Orientation 自動補正 |
| PNG | ✅ | ✅ | ICC プロファイル引き継ぎ |
| WebP | ✅ | ✅ | ICC プロファイル引き継ぎ |
| AVIF | ✅ | ✅ | threads オプションあり |
| GIF | ✅ | — | 先頭フレームのみ |
| HEIC / HEIF | ✅ | — | macOS・Linux のみ |
