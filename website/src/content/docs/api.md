---
title: API Reference
description: Full API reference and TypeScript type definitions for zenpix.
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

Decodes JPEG, PNG, static WebP, AVIF, or GIF (first frame only, RGB output) and returns raw pixel data.

**Unsupported formats**: animated WebP, animated GIF (frames beyond the first). Use `decodeHeic()` for HEIC / HEIF. Throws `zenpix: decode failed` on failure.

JPEG EXIF Orientation is applied automatically (all orientations 2–8 are handled).

```typescript
interface ImageBuffer {
  data: Buffer;     // raw pixels (row-major, top-left origin)
  width: number;
  height: number;
  channels: number; // 3 = RGB, 4 = RGBA
  icc?: Buffer;     // embedded ICC profile (omitted if none)
}
```

---

## decodeHeic

```typescript
function decodeHeic(input: Buffer | Uint8Array): ImageBuffer
```

Decodes a HEIC or HEIF file and returns raw pixel data. Ideal for processing iPhone photos (`.HEIC`) directly.

**Platform**: macOS and Linux only. Throws `zenpix: HEIC decode is not available on this platform` on Windows.

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

Resizes using a Lanczos-3 filter. Omitting either `width` or `height` preserves the aspect ratio. ICC profile is carried through if present.

```typescript
interface ResizeOptions {
  width?: number;
  height?: number;
  threads?: number;                          // parallel threads (default: 1)
  fit?: "stretch" | "contain" | "cover";
  // "stretch" (default): use width/height as-is
  // "contain": fit within the box preserving aspect ratio (letterbox)
  // "cover":   fill the box preserving aspect ratio (center crop)
}
```

---

## encodeWebP

```typescript
function encodeWebP(image: ImageBuffer, options?: WebPOptions): Buffer
```

Encodes to WebP. Embeds `image.icc` as an ICCP chunk if set.

```typescript
interface WebPOptions {
  quality?: number;   // 0–100 (default: 92)
  lossless?: boolean; // lossless mode (default: false)
}
```

---

## encodeAvif

```typescript
function encodeAvif(image: ImageBuffer, options?: AvifOptions): Buffer | Uint8Array | null
```

Encodes to AVIF. Returns `null` if:

- `quality` is outside 0–100
- `speed` is outside 0–10
- The binary was built without AVIF support

> Returns `Buffer` on Node.js / Bun, `Uint8Array` on Deno.

```typescript
interface AvifOptions {
  quality?: number; // 0–100 (default: 60)
  speed?: number;   // 0–10 (default: 6); 10 = fastest
  threads?: number; // encode threads (default: 1); use os.cpus().length for batch
}
```

---

## encodePng

```typescript
function encodePng(image: ImageBuffer, options?: PngOptions): Buffer | Uint8Array
```

Encodes to PNG. Embeds `image.icc` as an iCCP chunk if set. Throws `Error` if `compression` is outside 0–9.

```typescript
interface PngOptions {
  compression?: number; // zlib compression level 0–9 (default: 6)
}
```

---

## crop

```typescript
function crop(image: ImageBuffer, options: CropOptions): ImageBuffer
```

Extracts a rectangular region from pixel data. ICC profile is preserved. Throws `Error` for out-of-bounds, zero-dimension, or invalid values.

```typescript
interface CropOptions {
  left: number;   // left edge of crop (px, 0-origin)
  top: number;    // top edge of crop (px, 0-origin)
  width: number;  // crop width (px)
  height: number; // crop height (px)
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

Pipeline function: decode → crop → resize → encode in one call. May return `null` only when `encode.format` is `"avif"`.

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

**Examples**

```typescript
// decode → contain resize → AVIF
const avif = convert(readFileSync("photo.jpg"), {
  resize: { width: 1920, height: 1080, fit: "contain" },
  encode: { format: "avif", quality: 60, speed: 10 },
});
if (avif) writeFileSync("output.avif", avif);

// decode → crop → WebP
const webp = convert(readFileSync("photo.jpg"), {
  crop: { left: 0, top: 0, width: 800, height: 600 },
  encode: { format: "webp", quality: 85 },
});
writeFileSync("thumb.webp", webp as Buffer);
```

---

## removeBackground

```typescript
function removeBackground(
  image: ImageBuffer,
  options?: { threshold?: number }
): ImageBuffer
```

Flood-fills from the four corners to make white-adjacent pixels transparent (RGB → RGBA). `threshold` is the distance from white to consider (0–255, default: 30). White pixels enclosed by a ring (e.g. inside a logo) are not removed.

```typescript
import { decode, removeBackground, encodePng } from "zenpix";

const image = decode(readFileSync("icon.jpg"));
const noBg  = removeBackground(image, { threshold: 30 });
writeFileSync("icon-transparent.png", encodePng(noBg));
```

---

## flattenBackground

```typescript
function flattenBackground(image: ImageBuffer): ImageBuffer
```

Composites an RGBA image onto a white background, converting it to RGB. Use as a pre-processing step before `removeBackground` to strip outer white rings from transparent-corner PNGs.

```typescript
import { decode, flattenBackground, removeBackground, encodePng } from "zenpix";

const image = decode(readFileSync("icon.png")); // PNG with transparent corners
const flat  = flattenBackground(image);          // RGBA → RGB on white
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

Applies a rounded-corner mask (RGB → RGBA). Use `radius: "full"` for a perfect circle.

```typescript
import { decode, flattenBackground, removeBackground, roundCorners, encodePng } from "zenpix";

const image   = decode(readFileSync("icon.png"));
const noBg    = removeBackground(flattenBackground(image), { threshold: 30 });

// Rounded corners (40px)
const rounded = roundCorners(noBg, { radius: 40 });
writeFileSync("icon-rounded.png", encodePng(rounded));

// Perfect circle
const circle  = roundCorners(noBg, { radius: "full" });
writeFileSync("icon-circle.png", encodePng(circle));
```
