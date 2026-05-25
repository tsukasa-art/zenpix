import { dlopen, FFIType, ptr, toArrayBuffer } from "bun:ffi";

const ZIG_LIB = "/Users/tuki/Develop/Projects/zenpix/npm/zenpix-darwin-arm64/libpict.dylib";
const C_LIB   = "/Users/tuki/Develop/Projects/zenpix-c/build/libpict.dylib";

function makeLib(path: string) {
  return dlopen(path, {
    pict_resize: {
      args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u8,
             FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr],
      returns: FFIType.ptr,
    },
    pict_free_buffer: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.void },
  });
}

const SRC_W = 64, SRC_H = 48, CH = 3;
const src = new Uint8Array(SRC_W * SRC_H * CH);
for (let y = 0; y < SRC_H; y++)
  for (let x = 0; x < SRC_W; x++) {
    const i = (y * SRC_W + x) * CH;
    src[i+0] = Math.round(x * 255 / (SRC_W-1));
    src[i+1] = Math.round(y * 255 / (SRC_H-1));
    src[i+2] = Math.round((x+y) * 255 / (SRC_W+SRC_H-2));
  }

console.log("Source pixel (2,0): R=%d G=%d B=%d", src[6], src[7], src[8]);

function doResize(lib: ReturnType<typeof makeLib>, name: string, dstW: number, dstH: number) {
  const outLen = new BigUint64Array(1);
  const result = lib.symbols.pict_resize(ptr(src), SRC_W, SRC_H, CH, dstW, dstH, 1, ptr(outLen));
  if (!result) { console.log(`${name} ${dstW}x${dstH}: NULL`); return; }
  const got = new Uint8Array(toArrayBuffer(result, 0, Number(outLen[0])).slice(0));
  lib.symbols.pict_free_buffer(result, outLen[0]);
  // print first 6 pixels
  for (let i = 0; i < 6; i++) {
    const R = got[i*3], G = got[i*3+1], B = got[i*3+2];
    const x = i % dstW, y = Math.floor(i / dstW);
    console.log(`  ${name} (${x},${y}): R=${R} G=${G} B=${B}`);
  }
}

const zig = makeLib(ZIG_LIB);
const c   = makeLib(C_LIB);

console.log("\n--- identity 64x48 → 64x48 ---");
doResize(zig, "ZIG", 64, 48);
doResize(c,   "C  ", 64, 48);

console.log("\n--- downscale 64x48 → 20x15 ---");
doResize(zig, "ZIG", 20, 15);
doResize(c,   "C  ", 20, 15);

zig.close();
c.close();
