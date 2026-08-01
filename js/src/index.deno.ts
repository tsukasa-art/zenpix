/**
 * zenpix — Native C image processing via a TypeScript API
 * Deno entry point using Deno.dlopen
 *
 * Supported operations:
 *   decode()     — JPEG / PNG / WebP / AVIF / GIF → raw pixels（埋め込み ICC があれば返す）
 *   decodeHeic() — HEIC / HEIF → raw pixels（macOS / Linux のみ）
 *   resize()     — Lanczos-3 high-quality resize (stretch / contain / cover)
 *   encodeWebP() — WebP encode (lossy / lossless)
 *   encodeAvif() — AVIF encode
 *   encodePng()  — PNG encode with optional ICC passthrough
 *   convert()    — one-shot decode → resize → encode pipeline
 *
 * Memory model:
 *   All returned Uint8Arrays are independently owned (copied from native memory).
 *   The native C allocations are freed before returning via pict_free_buffer.
 *
 * AVIF note:
 *   Native packages from 1.0.3 onward statically link their AVIF codec stack.
 *   HEIC decode remains optional and loads libheif from the user's system.
 *   encodeAvif() returns null if the build was compiled without AVIF support,
 *   or if quality/speed options are out of range.
 *
 * Run with:
 *   deno run --allow-read --allow-ffi your_script.ts
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

// ── Library path resolution ───────────────────────────────────────────────────
// 解決順: ZENPIX_LIB → ../../build → optional

function resolveLibPath(): string {
  const plat = process.platform;
  const cpu  = process.arch;

  if (plat !== "darwin" && plat !== "linux" && plat !== "win32") {
    throw new Error(`zenpix: unsupported platform: ${plat} (supported: darwin, linux, win32)`);
  }
  if (cpu !== "arm64" && cpu !== "x64") {
    throw new Error(`zenpix: unsupported architecture: ${cpu} (supported: arm64, x64)`);
  }

  const ext     = plat === "darwin" ? "dylib" : plat === "win32" ? "dll" : "so";
  const pkgName = `zenpix-${plat}-${cpu}`;

  const fromEnv = readZenpixLibOverride();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const buildOut = join(__dirname, `../../build/libpict.${ext}`);
  if (existsSync(buildOut)) {
    return buildOut;
  }

  try {
    const req     = createRequire(import.meta.url);
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

function readZenpixLibOverride(): string | undefined {
  try {
    return process.env.ZENPIX_LIB?.trim() || undefined;
  } catch (error) {
    if (error instanceof Deno.errors.NotCapable) return undefined;
    throw error;
  }
}

// ── Deno.dlopen bindings ──────────────────────────────────────────────────────

const libPath = resolveLibPath();

const _lib = Deno.dlopen(libPath, {
  pict_decode_v3: {
    parameters: ["pointer", "u64", "pointer", "pointer", "pointer", "pointer", "pointer", "pointer"],
    result: "pointer",
  },
  pict_resize: {
    parameters: ["pointer", "u32", "u32", "u8", "u32", "u32", "u32", "pointer"],
    result: "pointer",
  },
  pict_resize_v2: {
    parameters: ["pointer", "u32", "u32", "u8", "u32", "u32", "u8", "u32", "pointer", "pointer", "pointer"],
    result: "pointer",
  },
  pict_encode_webp_v2: {
    parameters: ["pointer", "u32", "u32", "u8", "f32", "u8", "pointer", "u64", "pointer"],
    result: "pointer",
  },
  pict_encode_avif_v2: {
    parameters: ["pointer", "u32", "u32", "u8", "u8", "u8", "u8", "pointer", "u64", "pointer"],
    result: "pointer",
  },
  pict_encode_png: {
    parameters: ["pointer", "u32", "u32", "u8", "u8", "pointer", "u64", "pointer"],
    result: "pointer",
  },
  pict_crop: {
    parameters: ["pointer", "u32", "u32", "u8", "u32", "u32", "u32", "u32", "pointer"],
    result: "pointer",
  },
  pict_jpeg_orientation: {
    parameters: ["pointer", "u64"],
    result: "u8",
  },
  pict_rotate: {
    parameters: ["pointer", "u32", "u32", "u8", "u8", "pointer", "pointer", "pointer"],
    result: "pointer",
  },
  pict_remove_background: {
    parameters: ["pointer", "u32", "u32", "u8", "u8", "pointer"],
    result: "pointer",
  },
  pict_round_corners: {
    parameters: ["pointer", "u32", "u32", "u32", "pointer"],
    result: "pointer",
  },
  pict_free_buffer: {
    parameters: ["pointer", "u64"],
    result: "void",
  },
});

// HEIC decode is absent on Windows — load in a separate try-catch so the module
// still initialises cleanly when the symbol is missing.
let _heicLib: ReturnType<typeof Deno.dlopen<{
  pict_heic_decode: { parameters: ["pointer","u64","pointer","pointer","pointer","pointer"]; result: "i32" };
}>> | null = null;
try {
  _heicLib = Deno.dlopen(libPath, {
    pict_heic_decode: {
      parameters: ["pointer", "u64", "pointer", "pointer", "pointer", "pointer"],
      result: "i32",
    },
  });
} catch {
  // not available on this platform (e.g., Windows)
}

// ── Internal helper ───────────────────────────────────────────────────────────

function copyAndFree(ptr: Deno.PointerValue, len: bigint): Uint8Array {
  if (ptr === null) throw new Error("zenpix: null pointer");
  const view = new Deno.UnsafePointerView(ptr as NonNullable<Deno.PointerValue>);
  const out = new Uint8Array(Number(len));
  view.copyInto(out);
  _lib.symbols.pict_free_buffer(ptr, len);
  return out;
}

// ── Public types ──────────────────────────────────────────────────────────────

/** Decoded image in raw pixel format */
export interface ImageBuffer {
  data: Uint8Array;
  width: number;
  height: number;
  /** 3 = RGB, 4 = RGBA */
  channels: number;
  icc?: Uint8Array;
}

export interface ResizeOptions {
  width?: number;
  height?: number;
  threads?: number;
  fit?: "stretch" | "contain" | "cover";
}

export interface WebPOptions {
  quality?: number;
  lossless?: boolean;
}

export interface AvifOptions {
  quality?: number;
  speed?: number;
  threads?: number;
}

export interface PngOptions {
  compression?: number;
}

export interface CropOptions {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RemoveBackgroundOptions {
  threshold?: number;
}

export interface FlattenBackgroundOptions {
  r?: number;
  g?: number;
  b?: number;
}

export interface RoundCornersOptions {
  radius: number | "full";
}

// ── Public API ────────────────────────────────────────────────────────────────

export function decode(input: Uint8Array): ImageBuffer {
  const outW   = new Uint32Array(1);
  const outH   = new Uint32Array(1);
  const outCh  = new Uint8Array(1);
  const outLen = new BigUint64Array(1);
  const iccPtrBuf = new BigUint64Array(1);
  const iccLen = new BigUint64Array(1);

  const pixPtr = _lib.symbols.pict_decode_v3(
    Deno.UnsafePointer.of(input),
    BigInt(input.byteLength),
    Deno.UnsafePointer.of(outW),
    Deno.UnsafePointer.of(outH),
    Deno.UnsafePointer.of(outCh),
    Deno.UnsafePointer.of(outLen),
    Deno.UnsafePointer.of(iccPtrBuf),
    Deno.UnsafePointer.of(iccLen),
  );
  if (pixPtr === null) {
    throw new Error("zenpix: decode failed (unsupported format or corrupt data)");
  }

  const orientation = _lib.symbols.pict_jpeg_orientation(
    Deno.UnsafePointer.of(input), BigInt(input.byteLength),
  );

  let finalPtr: Deno.PointerValue = pixPtr;
  let finalLen = outLen[0];
  let finalW = outW[0];
  let finalH = outH[0];

  if (orientation !== 1) {
    const rotOutW   = new Uint32Array(1);
    const rotOutH   = new Uint32Array(1);
    const rotOutLen = new BigUint64Array(1);
    const rotPtr = _lib.symbols.pict_rotate(
      pixPtr, outW[0], outH[0], outCh[0], orientation,
      Deno.UnsafePointer.of(rotOutW),
      Deno.UnsafePointer.of(rotOutH),
      Deno.UnsafePointer.of(rotOutLen),
    );
    _lib.symbols.pict_free_buffer(pixPtr, outLen[0]);
    if (rotPtr === null) {
      throw new Error("zenpix: EXIF rotation failed (out of memory)");
    }
    finalPtr = rotPtr;
    finalLen = rotOutLen[0];
    finalW = rotOutW[0];
    finalH = rotOutH[0];
  }

  const out: ImageBuffer = {
    data:     copyAndFree(finalPtr, finalLen),
    width:    finalW,
    height:   finalH,
    channels: outCh[0],
  };

  const iccRawPtr = Deno.UnsafePointer.create(iccPtrBuf[0]);
  if (iccRawPtr !== null && iccLen[0] > 0n) {
    out.icc = copyAndFree(iccRawPtr, iccLen[0]);
  }

  return out;
}

export function decodeHeic(input: Uint8Array): ImageBuffer {
  if (_heicLib === null) {
    throw new Error("zenpix: HEIC decode is not available on this platform");
  }

  const outDataBuf = new BigUint64Array(1);
  const outW  = new Uint32Array(1);
  const outH  = new Uint32Array(1);
  const outCh = new Uint32Array(1);

  const rc = _heicLib.symbols.pict_heic_decode(
    Deno.UnsafePointer.of(input),
    BigInt(input.byteLength),
    Deno.UnsafePointer.of(outDataBuf),
    Deno.UnsafePointer.of(outW),
    Deno.UnsafePointer.of(outH),
    Deno.UnsafePointer.of(outCh),
  );
  if (rc !== 0) {
    throw new Error("zenpix: HEIC decode failed (unsupported format or corrupt data)");
  }

  const dataPtr = Deno.UnsafePointer.create(outDataBuf[0]);
  if (dataPtr === null) {
    throw new Error("zenpix: HEIC decode failed (null output)");
  }

  const w  = outW[0];
  const h  = outH[0];
  const ch = outCh[0];

  return {
    data:     copyAndFree(dataPtr, BigInt(w * h * ch)),
    width:    w,
    height:   h,
    channels: ch,
  };
}

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
  const ptr = _lib.symbols.pict_resize_v2(
    Deno.UnsafePointer.of(image.data),
    image.width, image.height, image.channels,
    width!, height!,
    fitCode, threads,
    Deno.UnsafePointer.of(outActualW),
    Deno.UnsafePointer.of(outActualH),
    Deno.UnsafePointer.of(outLen),
  );
  if (ptr === null) throw new Error("zenpix: resize failed");

  const out: ImageBuffer = {
    data:     copyAndFree(ptr, outLen[0]),
    width:    outActualW[0],
    height:   outActualH[0],
    channels: image.channels,
  };
  if (image.icc !== undefined && image.icc.byteLength > 0) {
    out.icc = image.icc.slice();
  }
  return out;
}

export function encodeWebP(image: ImageBuffer, options: WebPOptions = {}): Uint8Array {
  const { quality = 92, lossless = false } = options;

  const outLen = new BigUint64Array(1);
  const icc = image.icc;
  const iccLen = icc !== undefined && icc.byteLength > 0 ? BigInt(icc.byteLength) : 0n;
  const ptr = _lib.symbols.pict_encode_webp_v2(
    Deno.UnsafePointer.of(image.data),
    image.width, image.height, image.channels,
    quality, lossless ? 1 : 0,
    icc !== undefined && icc.byteLength > 0 ? Deno.UnsafePointer.of(icc) : null,
    iccLen,
    Deno.UnsafePointer.of(outLen),
  );
  if (ptr === null) throw new Error("zenpix: WebP encoding failed");

  return copyAndFree(ptr, outLen[0]);
}

export function encodeAvif(image: ImageBuffer, options: AvifOptions = {}): Uint8Array | null {
  const { quality = 60, speed = 6, threads = 1 } = options;

  if (!Number.isInteger(quality) || quality < 0 || quality > 100) return null;
  if (!Number.isInteger(speed)   || speed   < 0 || speed   > 10)  return null;
  if (!Number.isInteger(threads) || threads < 1)                   return null;

  const icc = image.icc;
  const iccLen = icc !== undefined && icc.byteLength > 0 ? BigInt(icc.byteLength) : 0n;
  const outLen = new BigUint64Array(1);
  const ptr = _lib.symbols.pict_encode_avif_v2(
    Deno.UnsafePointer.of(image.data),
    image.width, image.height, image.channels,
    quality, speed, threads,
    icc !== undefined && icc.byteLength > 0 ? Deno.UnsafePointer.of(icc) : null,
    iccLen,
    Deno.UnsafePointer.of(outLen),
  );
  if (ptr === null) return null;

  return copyAndFree(ptr, outLen[0]);
}

export function encodePng(image: ImageBuffer, options: PngOptions = {}): Uint8Array {
  const { compression = 6 } = options;

  if (!Number.isInteger(compression) || compression < 0 || compression > 9) {
    throw new Error("zenpix: compression must be an integer 0–9");
  }

  const icc = image.icc;
  const iccLen = icc !== undefined && icc.byteLength > 0 ? BigInt(icc.byteLength) : 0n;
  const outLen = new BigUint64Array(1);
  const ptr = _lib.symbols.pict_encode_png(
    Deno.UnsafePointer.of(image.data),
    image.width, image.height, image.channels,
    compression,
    icc !== undefined && icc.byteLength > 0 ? Deno.UnsafePointer.of(icc) : null,
    iccLen,
    Deno.UnsafePointer.of(outLen),
  );
  if (ptr === null) throw new Error("zenpix: PNG encoding failed");

  return copyAndFree(ptr, outLen[0]);
}

export type ConvertEncodeOptions =
  | ({ format: "webp" } & WebPOptions)
  | ({ format: "avif" } & AvifOptions)
  | ({ format: "png" }  & PngOptions);

export interface ConvertOptions {
  crop?: CropOptions;
  resize?: ResizeOptions;
  encode: ConvertEncodeOptions;
}

export function convert(input: Uint8Array, options: ConvertOptions): Uint8Array | null {
  let image = decode(input);

  if (options.crop)   image = crop(image, options.crop);
  if (options.resize) image = resize(image, options.resize);

  const { encode: enc } = options;
  if (enc.format === "webp") return encodeWebP(image, enc);
  if (enc.format === "avif") return encodeAvif(image, enc);
  return encodePng(image, enc);
}

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
  const ptr = _lib.symbols.pict_crop(
    Deno.UnsafePointer.of(image.data),
    image.width, image.height, image.channels,
    left, top, width, height,
    Deno.UnsafePointer.of(outLen),
  );

  if (ptr === null) throw new Error("zenpix: crop failed (region out of bounds or invalid input)");

  const out: ImageBuffer = {
    data:     copyAndFree(ptr, outLen[0]),
    width,
    height,
    channels: image.channels,
  };
  if (image.icc !== undefined && image.icc.byteLength > 0) {
    out.icc = image.icc.slice();
  }
  return out;
}

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
  const ptr = _lib.symbols.pict_remove_background(
    Deno.UnsafePointer.of(image.data), image.width, image.height, image.channels, threshold,
    Deno.UnsafePointer.of(outLen),
  );
  if (ptr === null) throw new Error("zenpix: removeBackground failed");

  return {
    data:     copyAndFree(ptr, outLen[0]),
    width:    image.width,
    height:   image.height,
    channels: 4,
  };
}

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
  const ptr = _lib.symbols.pict_round_corners(
    Deno.UnsafePointer.of(image.data), image.width, image.height, r,
    Deno.UnsafePointer.of(outLen),
  );
  if (ptr === null) throw new Error("zenpix: roundCorners failed");

  return {
    data:     copyAndFree(ptr, outLen[0]),
    width:    image.width,
    height:   image.height,
    channels: 4,
  };
}

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
  const out = new Uint8Array(n * 3);

  for (let i = 0; i < n; i++) {
    const a = image.data[i * 4 + 3] / 255;
    out[i * 3 + 0] = Math.round(image.data[i * 4 + 0] * a + bgR * (1 - a));
    out[i * 3 + 1] = Math.round(image.data[i * 4 + 1] * a + bgG * (1 - a));
    out[i * 3 + 2] = Math.round(image.data[i * 4 + 2] * a + bgB * (1 - a));
  }

  return { data: out, width, height, channels: 3 };
}
