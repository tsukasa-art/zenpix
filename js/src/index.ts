/**
 * zenpix — High-performance image processing (C native binding)
 *
 * Supported operations:
 *   decode()     — JPEG / PNG / WebP / AVIF / GIF → raw pixels（埋め込み ICC があれば返す）
 *   decodeHeic() — HEIC / HEIF → raw pixels（macOS / Linux のみ）
 *   resize()     — Lanczos-3 high-quality resize (stretch / contain / cover)
 *   encodeWebP() — WebP encode (lossy / lossless)
 *   encodeAvif() — AVIF encode (requires libavif on the system)
 *   convert()    — one-shot decode → resize → encode pipeline
 *
 * Memory model:
 *   All returned Buffers are independently owned by Node.js GC.
 *   The native C allocations are freed before returning.
 *
 * AVIF note:
 *   libavif and libaom are statically linked in the distributed npm packages.
 *   No system-level installation is required when using npm install zenpix.
 *   encodeAvif() returns null if the build was compiled without AVIF support,
 *   or if quality/speed options are out of range.
 */

import koffi from "koffi";
import { existsSync } from "fs";
import { platform, arch } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// ── Library loading ───────────────────────────────────────────────────────────
//
// 解決順:
//   1. 環境変数 ZENPIX_LIB（存在するファイルパスのみ）
//   2. このモジュールからの相対 ../../build/libpict.{dylib,so,dll}（cmake build 済みなら）
//   3. optionalDependency zenpix-<platform>-<arch> 内の libpict

function resolveLibPath(): string {
  const plat = platform();
  const cpu = arch();

  if (plat !== "darwin" && plat !== "linux" && plat !== "win32") {
    throw new Error(`zenpix: unsupported platform: ${plat} (supported: darwin, linux, win32)`);
  }
  if (cpu !== "arm64" && cpu !== "x64") {
    throw new Error(`zenpix: unsupported architecture: ${cpu} (supported: arm64, x64)`);
  }

  const ext = plat === "darwin" ? "dylib" : plat === "win32" ? "dll" : "so";
  const pkgName = `zenpix-${plat}-${cpu}`;

  const fromEnv = process.env.ZENPIX_LIB?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const buildOut = join(__dirname, `../../build/libpict.${ext}`);
  if (existsSync(buildOut)) {
    return buildOut;
  }

  try {
    const req = createRequire(import.meta.url);
    const pkgRoot = dirname(req.resolve(`${pkgName}/package.json`));
    return join(pkgRoot, `libpict.${ext}`);
  } catch {
    throw new Error(
      `zenpix: libpict.${ext} が見つかりません。` +
        `リポジトリなら cmake -S . -B build && cmake --build build で ${buildOut} を生成するか、` +
        `環境変数 ZENPIX_LIB にフルパスを設定するか、optional ${pkgName} を入れてください。`,
    );
  }
}

const _lib = koffi.load(resolveLibPath());

// ── FFI bindings (internal) ───────────────────────────────────────────────────

const _decode_v3 = _lib.func(
  "uint8 *pict_decode_v3(const uint8 *data, uint64 len, uint32 *out_w, uint32 *out_h, uint8 *out_ch, uint64 *out_len, _Out_ uint8 **out_icc, uint64 *out_icc_len)"
);

const _resize = _lib.func(
  "uint8 *pict_resize(const uint8 *src, uint32 src_w, uint32 src_h, uint8 channels, uint32 dst_w, uint32 dst_h, uint32 n_threads, uint64 *out_len)"
);

const _resize_v2 = _lib.func(
  "uint8 *pict_resize_v2(const uint8 *src, uint32 src_w, uint32 src_h, uint8 channels, uint32 dst_w, uint32 dst_h, uint8 fit, uint32 n_threads, uint32 *out_actual_w, uint32 *out_actual_h, uint64 *out_len)"
);

const _encode_webp_v2 = _lib.func(
  "uint8 *pict_encode_webp_v2(const uint8 *pixels, uint32 width, uint32 height, uint8 channels, float quality, bool lossless, uint8 *icc, uint64 icc_len, uint64 *out_len)"
);

const _encode_avif = _lib.func(
  "uint8 *pict_encode_avif(const uint8 *pixels, uint32 width, uint32 height, uint8 channels, uint8 quality, uint8 speed, uint8 threads, uint64 *out_len)"
);

const _encode_png = _lib.func(
  "uint8 *pict_encode_png(const uint8 *pixels, uint32 width, uint32 height, uint8 channels, uint8 compression, uint8 *icc, uint64 icc_len, uint64 *out_len)"
);

const _crop = _lib.func(
  "uint8 *pict_crop(const uint8 *pixels, uint32 src_w, uint32 src_h, uint8 channels, uint32 left, uint32 top, uint32 crop_w, uint32 crop_h, uint64 *out_len)"
);

const _jpeg_orientation = _lib.func(
  "uint8 pict_jpeg_orientation(const uint8 *data, uint64 len)"
);

const _rotate = _lib.func(
  "uint8 *pict_rotate(const uint8 *pixels, uint32 src_w, uint32 src_h, uint8 channels, uint8 orientation, uint32 *out_w, uint32 *out_h, uint64 *out_len)"
);

const _remove_background = _lib.func(
  "uint8 *pict_remove_background(const uint8 *pixels, uint32 width, uint32 height, uint8 channels, uint8 threshold, uint64 *out_len)"
);

const _round_corners = _lib.func(
  "uint8 *pict_round_corners(const uint8 *pixels, uint32 width, uint32 height, uint32 radius, uint64 *out_len)"
);

const _free = _lib.func("void pict_free_buffer(uint8 *ptr, uint64 len)");

// HEIC decode is not available on Windows (heic_decode.c excluded from that build).
// Lazy-bind so the module loads cleanly even when the symbol is absent.
let _heic_decode_fn: ((...args: unknown[]) => unknown) | null | undefined = undefined;
function getHeicDecode() {
  if (_heic_decode_fn === undefined) {
    try {
      _heic_decode_fn = _lib.func(
        "int pict_heic_decode(const uint8 *src, uint64 src_len, _Out_ uint8 **out_data, uint32 *out_w, uint32 *out_h, uint32 *out_ch)"
      );
    } catch {
      _heic_decode_fn = null;
    }
  }
  return _heic_decode_fn;
}

// ── Internal helper ───────────────────────────────────────────────────────────

function copyAndFree(ptr: unknown, len: bigint): Buffer {
  const size = Number(len);
  const bytes = koffi.decode(ptr, "uint8", size) as number[];
  _free(ptr, len);
  return Buffer.from(bytes);
}

// ── Public types ──────────────────────────────────────────────────────────────

/** Decoded image in raw pixel format */
export interface ImageBuffer {
  /** Raw pixel data: tightly packed, row-major, top-left origin */
  data: Buffer;
  width: number;
  height: number;
  /** 3 = RGB, 4 = RGBA */
  channels: number;
  /**
   * 埋め込み ICC プロファイル（JPEG APP2 / PNG iCCP / WebP ICCP 等）。
   * 無い画像では省略される。
   */
  icc?: Buffer;
}

export interface ResizeOptions {
  /**
   * Target width in pixels.
   * If omitted, calculated from height to preserve aspect ratio (stretch mode only).
   */
  width?: number;
  /**
   * Target height in pixels.
   * If omitted, calculated from width to preserve aspect ratio (stretch mode only).
   */
  height?: number;
  /** Number of parallel threads (default: 1) */
  threads?: number;
  /**
   * How to fit the image into width × height (default: "stretch").
   * - "stretch" — resize to exactly width × height (may distort)
   * - "contain" — scale to fit within width × height, preserving aspect ratio; output may be smaller
   * - "cover"   — scale to cover width × height, center crop, preserving aspect ratio
   * When using "contain" or "cover", both width and height must be specified.
   */
  fit?: "stretch" | "contain" | "cover";
}

export interface WebPOptions {
  /** Quality 0–100 (default: 92) */
  quality?: number;
  /** Lossless mode (default: false) */
  lossless?: boolean;
}

export interface AvifOptions {
  /** Quality 0–100 (default: 60) */
  quality?: number;
  /**
   * Encoder speed 0–10 (default: 6).
   * 10 = fastest (lower quality), 0 = slowest (best quality).
   */
  speed?: number;
  /**
   * Encoder thread count (default: 1).
   * Uses libaom row-based parallelism. No quality impact.
   * Increase for batch processing or high-spec environments.
   */
  threads?: number;
}

export interface PngOptions {
  /** zlib compression level 0–9 (default: 6) */
  compression?: number;
}

export interface CropOptions {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RemoveBackgroundOptions {
  /**
   * Flood-fill threshold 0–255 (default: 30).
   * Each R, G, B channel must be >= (255 - threshold) to be considered "white-like".
   * Lower values = stricter; higher values = more aggressive removal.
   */
  threshold?: number;
}

export interface FlattenBackgroundOptions {
  /** Background red channel 0–255 (default: 255) */
  r?: number;
  /** Background green channel 0–255 (default: 255) */
  g?: number;
  /** Background blue channel 0–255 (default: 255) */
  b?: number;
}

export interface RoundCornersOptions {
  /**
   * Corner radius in pixels, or "full" for a perfect circle/ellipse.
   * When "full", radius = min(width, height) / 2.
   */
  radius: number | "full";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Decode a JPEG, PNG, WebP, AVIF, or GIF buffer into raw pixel data.
 * GIF: only the first frame is decoded (no animation).
 * When the file contains an embedded ICC profile, it is copied into `icc`.
 * JPEG EXIF Orientation (2–8) is applied automatically.
 * @throws {Error} if the input cannot be decoded, or if EXIF rotation fails (OOM)
 */
export function decode(input: Buffer | Uint8Array): ImageBuffer {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);

  const outW   = new Uint32Array(1);
  const outH   = new Uint32Array(1);
  const outCh  = new Uint8Array(1);
  const outLen = new BigUint64Array(1);
  const iccPtrSlot: unknown[] = [null];
  const iccLen = new BigUint64Array(1);

  const pixPtr = _decode_v3(buf, BigInt(buf.byteLength), outW, outH, outCh, outLen, iccPtrSlot, iccLen);
  if (pixPtr === null) {
    throw new Error("zenpix: decode failed (unsupported format or corrupt data)");
  }

  const orientation: number = _jpeg_orientation(buf, BigInt(buf.byteLength));

  let finalPtr: unknown = pixPtr;
  let finalLen = outLen[0];
  let finalW = outW[0];
  let finalH = outH[0];

  if (orientation !== 1) {
    const rotOutW   = new Uint32Array(1);
    const rotOutH   = new Uint32Array(1);
    const rotOutLen = new BigUint64Array(1);
    const rotPtr = _rotate(pixPtr, outW[0], outH[0], outCh[0], orientation, rotOutW, rotOutH, rotOutLen);
    if (rotPtr === null) {
      _free(pixPtr, outLen[0]);
      const iccNative = iccPtrSlot[0];
      if (iccNative != null && iccLen[0] > 0n) _free(iccNative, iccLen[0]);
      throw new Error("zenpix: EXIF rotation failed (out of memory)");
    }
    _free(pixPtr, outLen[0]);
    finalPtr = rotPtr;
    finalLen = rotOutLen[0];
    finalW = rotOutW[0];
    finalH = rotOutH[0];
  }

  const out: ImageBuffer = {
    data: copyAndFree(finalPtr, finalLen),
    width:    finalW,
    height:   finalH,
    channels: outCh[0],
  };

  const iccNative = iccPtrSlot[0];
  if (iccNative != null && iccLen[0] > 0n) {
    out.icc = copyAndFree(iccNative, iccLen[0]);
  }

  return out;
}

/**
 * Decode a HEIC or HEIF buffer into raw pixel data.
 * Available on macOS and Linux only (Windows build excludes libheif).
 * @throws {Error} if the platform does not support HEIC decode, or if decoding fails
 */
export function decodeHeic(input: Buffer | Uint8Array): ImageBuffer {
  const fn = getHeicDecode();
  if (!fn) throw new Error("zenpix: HEIC decode is not available on this platform");

  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const outDataSlot: unknown[] = [null];
  const outW  = new Uint32Array(1);
  const outH  = new Uint32Array(1);
  const outCh = new Uint32Array(1);

  const rc = fn(buf, BigInt(buf.byteLength), outDataSlot, outW, outH, outCh) as number;
  if (rc !== 0 || outDataSlot[0] === null) {
    throw new Error("zenpix: HEIC decode failed (unsupported format or corrupt data)");
  }

  const w = outW[0]!;
  const h = outH[0]!;
  const ch = outCh[0]!;

  return {
    data:     copyAndFree(outDataSlot[0], BigInt(w * h * ch)),
    width:    w,
    height:   h,
    channels: ch,
  };
}

/**
 * Resize pixel data using Lanczos-3 filter.
 * At least one of width or height must be specified (for "stretch" mode).
 * For "contain" and "cover" fit modes, both must be specified.
 * @throws {Error} if options are invalid or the resize fails
 */
export function resize(image: ImageBuffer, options: ResizeOptions): ImageBuffer {
  let { width, height, threads = 1, fit = "stretch" } = options;
  const fitCode = fit === "contain" ? 1 : fit === "cover" ? 2 : 0;

  if (fitCode !== 0) {
    if (!width || !height) {
      throw new Error("zenpix: resize with fit='contain' or 'cover' requires both width and height");
    }
  } else {
    if (!width && !height) {
      throw new Error("zenpix: resize requires at least one of width or height");
    }
    if (!width)  width  = Math.round((image.width  / image.height) * height!);
    if (!height) height = Math.round((image.height / image.width)  * width);
  }

  const outActualW = new Uint32Array(1);
  const outActualH = new Uint32Array(1);
  const outLen     = new BigUint64Array(1);
  const ptr = _resize_v2(
    image.data,
    image.width, image.height, image.channels,
    width!, height!,
    fitCode, threads,
    outActualW, outActualH,
    outLen,
  );
  if (ptr === null) throw new Error("zenpix: resize failed");

  const out: ImageBuffer = {
    data:     copyAndFree(ptr, outLen[0]),
    width:    outActualW[0],
    height:   outActualH[0],
    channels: image.channels,
  };
  if (image.icc !== undefined && image.icc.byteLength > 0) {
    out.icc = Buffer.from(image.icc);
  }
  return out;
}

/**
 * Encode pixel data as WebP.
 * @throws {Error} if encoding fails
 */
export function encodeWebP(image: ImageBuffer, options: WebPOptions = {}): Buffer {
  const { quality = 92, lossless = false } = options;

  const outLen = new BigUint64Array(1);
  const icc = image.icc;
  const iccLen = icc !== undefined && icc.byteLength > 0 ? BigInt(icc.byteLength) : 0n;
  const ptr = _encode_webp_v2(
    image.data,
    image.width, image.height, image.channels,
    quality, lossless,
    icc !== undefined && icc.byteLength > 0 ? icc : null,
    iccLen,
    outLen,
  );
  if (ptr === null) throw new Error("zenpix: WebP encoding failed");

  return copyAndFree(ptr, outLen[0]);
}

/**
 * Encode pixel data as AVIF.
 *
 * libavif and libaom are statically linked in the distributed npm packages.
 * No system-level installation is required.
 *
 * Returns null if:
 *   - This build was compiled without AVIF support
 *   - quality is not an integer in range 0–100
 *   - speed is not an integer in range 0–10
 * @throws {Error} if encoding fails for a reason other than the above
 */
export function encodeAvif(image: ImageBuffer, options: AvifOptions = {}): Buffer | null {
  const { quality = 60, speed = 6, threads = 1 } = options;

  if (!Number.isInteger(quality) || quality < 0 || quality > 100) return null;
  if (!Number.isInteger(speed)   || speed   < 0 || speed   > 10)  return null;
  if (!Number.isInteger(threads) || threads < 1)                   return null;

  const outLen = new BigUint64Array(1);
  const ptr = _encode_avif(
    image.data,
    image.width, image.height, image.channels,
    quality, speed, threads,
    outLen,
  );
  if (ptr === null) return null;

  return copyAndFree(ptr, outLen[0]);
}

/**
 * Encode pixel data as PNG.
 * @throws {Error} if compression is not an integer 0–9, or if encoding fails
 */
export function encodePng(image: ImageBuffer, options: PngOptions = {}): Buffer {
  const { compression = 6 } = options;

  if (!Number.isInteger(compression) || compression < 0 || compression > 9) {
    throw new Error("zenpix: compression must be an integer 0–9");
  }

  const icc = image.icc;
  const iccLen = icc !== undefined && icc.byteLength > 0 ? BigInt(icc.byteLength) : 0n;
  const outLen = new BigUint64Array(1);
  const ptr = _encode_png(
    image.data,
    image.width, image.height, image.channels,
    compression,
    icc !== undefined && icc.byteLength > 0 ? icc : null,
    iccLen,
    outLen,
  );
  if (ptr === null) throw new Error("zenpix: PNG encoding failed");

  return copyAndFree(ptr, outLen[0]);
}

export type ConvertEncodeOptions =
  | ({ format: "webp" } & WebPOptions)
  | ({ format: "avif" } & AvifOptions)
  | ({ format: "png" }  & PngOptions);

export interface ConvertOptions {
  /** Crop before resize (optional) */
  crop?: CropOptions;
  /** Resize after crop (optional) */
  resize?: ResizeOptions;
  /** Output format and encoder options (required) */
  encode: ConvertEncodeOptions;
}

/**
 * One-shot pipeline: decode → crop → resize → encode.
 * Returns null only when encoding to AVIF with unsupported options or no AVIF support.
 * @throws {Error} if decode or encode fails
 */
export function convert(input: Buffer | Uint8Array, options: ConvertOptions): Buffer | null {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let image = decode(buf);

  if (options.crop)   image = crop(image, options.crop);
  if (options.resize) image = resize(image, options.resize);

  const { encode: enc } = options;
  if (enc.format === "webp") return encodeWebP(image, enc);
  if (enc.format === "avif") return encodeAvif(image, enc);
  return encodePng(image, enc);
}

/**
 * Crop a rectangular region from pixel data.
 * ICC profile is carried through to the output.
 * @throws {Error} if options are invalid or the crop region is out of bounds
 */
export function crop(image: ImageBuffer, options: CropOptions): ImageBuffer {
  const { left, top, width, height } = options;

  for (const [name, val] of [["left", left], ["top", top], ["width", width], ["height", height]] as [string, number][]) {
    if (!Number.isInteger(val) || val < 0 || val > 0xFFFFFFFF) {
      throw new Error(`zenpix: crop ${name} must be a non-negative integer ≤ 4294967295`);
    }
  }
  if (width === 0 || height === 0) {
    throw new Error("zenpix: crop width and height must be > 0");
  }

  const outLen = new BigUint64Array(1);
  const ptr = _crop(
    image.data,
    image.width, image.height, image.channels,
    left, top, width, height,
    outLen,
  );

  if (ptr === null) throw new Error("zenpix: crop failed (region out of bounds or invalid input)");

  const out: ImageBuffer = {
    data:     copyAndFree(ptr, outLen[0]),
    width,
    height,
    channels: image.channels,
  };
  if (image.icc !== undefined && image.icc.byteLength > 0) {
    out.icc = Buffer.from(image.icc);
  }
  return out;
}

/**
 * Remove a white (or near-white) background from an image using BFS flood fill from the corners.
 * Output is always RGBA (channels = 4). Transparent pixels have alpha = 0.
 * Works well for icons on solid white backgrounds; interior white pixels enclosed by non-white
 * regions are preserved.
 * @throws {Error} if the operation fails
 */
export function removeBackground(
  image: ImageBuffer,
  options: RemoveBackgroundOptions = {},
): ImageBuffer {
  const threshold = Math.round(options.threshold ?? 30);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) {
    throw new Error("zenpix: removeBackground threshold must be an integer 0–255");
  }
  if (image.channels !== 3 && image.channels !== 4) {
    throw new Error("zenpix: removeBackground requires RGB (channels=3) or RGBA (channels=4) input");
  }

  const outLen = new BigUint64Array(1);
  const ptr = _remove_background(
    image.data, image.width, image.height, image.channels, threshold, outLen,
  );
  if (ptr === null) throw new Error("zenpix: removeBackground failed");

  return {
    data:     copyAndFree(ptr, outLen[0]),
    width:    image.width,
    height:   image.height,
    channels: 4,
  };
}

/**
 * Apply a rounded-rectangle alpha mask to an RGBA image.
 * Input must be RGBA (channels = 4). Output is RGBA.
 * Pixels outside the rounded corners are set to alpha = 0.
 * A 1-pixel anti-aliased transition is applied at the boundary.
 * @throws {Error} if the operation fails
 */
export function roundCorners(
  image: ImageBuffer,
  options: RoundCornersOptions,
): ImageBuffer {
  if (image.channels !== 4) {
    throw new Error("zenpix: roundCorners requires RGBA input (channels=4). Use removeBackground() or decode() first.");
  }

  const r = options.radius === "full"
    ? Math.floor(Math.min(image.width, image.height) / 2)
    : options.radius;

  if (!Number.isInteger(r) || r < 0 || r > 0xFFFFFFFF) {
    throw new Error("zenpix: roundCorners radius must be a non-negative integer");
  }

  const outLen = new BigUint64Array(1);
  const ptr = _round_corners(image.data, image.width, image.height, r, outLen);
  if (ptr === null) throw new Error("zenpix: roundCorners failed");

  return {
    data:     copyAndFree(ptr, outLen[0]),
    width:    image.width,
    height:   image.height,
    channels: 4,
  };
}

/**
 * Composite an RGBA image onto a solid background color, producing an RGB image.
 * Useful before removeBackground when the source is already partially transparent
 * (e.g. PNG with transparent corners) but still has an unwanted white ring —
 * flattening reconnects the ring to the outer area so removeBackground can reach it.
 *
 * If the input is already RGB (channels=3), it is returned as-is (no copy).
 */
export function flattenBackground(
  image: ImageBuffer,
  options: FlattenBackgroundOptions = {},
): ImageBuffer {
  if (image.channels === 3) return image;
  if (image.channels !== 4) {
    throw new Error("zenpix: flattenBackground requires RGB (channels=3) or RGBA (channels=4) input");
  }

  const bgR = options.r ?? 255;
  const bgG = options.g ?? 255;
  const bgB = options.b ?? 255;

  const { width, height } = image;
  const n = width * height;
  const out = Buffer.allocUnsafe(n * 3);

  for (let i = 0; i < n; i++) {
    const a = image.data[i * 4 + 3] / 255;
    out[i * 3 + 0] = Math.round(image.data[i * 4 + 0] * a + bgR * (1 - a));
    out[i * 3 + 1] = Math.round(image.data[i * 4 + 1] * a + bgG * (1 - a));
    out[i * 3 + 2] = Math.round(image.data[i * 4 + 2] * a + bgB * (1 - a));
  }

  return { data: out, width, height, channels: 3 };
}
