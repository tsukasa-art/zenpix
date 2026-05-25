// 単純なベリファイ: 4x4 均一色を 2x2 にリサイズして、全ピクセルが同じ値になるか確認
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

const zig = makeLib(ZIG_LIB);
const c   = makeLib(C_LIB);

// 4x4 RGB, all pixels = (100, 150, 200)
const src = new Uint8Array(4 * 4 * 3).fill(0);
for (let i = 0; i < 4*4; i++) { src[i*3]=100; src[i*3+1]=150; src[i*3+2]=200; }

function resize(lib: ReturnType<typeof makeLib>, name: string, srcW: number, srcH: number, dstW: number, dstH: number, ch: number) {
  const pixels = new Uint8Array(srcW * srcH * ch);
  for (let y = 0; y < srcH; y++) for (let x = 0; x < srcW; x++) {
    const i = (y*srcW+x)*ch;
    pixels[i+0] = 100; if (ch>1) pixels[i+1] = 150; if (ch>2) pixels[i+2] = 200;
  }
  const outLen = new BigUint64Array(1);
  const result = lib.symbols.pict_resize(ptr(pixels), srcW, srcH, ch, dstW, dstH, 1, ptr(outLen));
  if (!result) { console.log(`${name}: NULL`); return; }
  const out = new Uint8Array(toArrayBuffer(result, 0, Number(outLen[0])).slice(0));
  lib.symbols.pict_free_buffer(result, outLen[0]);
  console.log(`${name} ${srcW}x${srcH} → ${dstW}x${dstH} ch=${ch}:`);
  for (let i = 0; i < Math.min(dstW*dstH, 4); i++) {
    if (ch===3) console.log(`  [${i}] R=${out[i*3]} G=${out[i*3+1]} B=${out[i*3+2]}`);
    else if (ch===1) console.log(`  [${i}] V=${out[i]}`);
  }
}

resize(zig, "ZIG", 4, 4, 2, 2, 3);
resize(c,   "C  ", 4, 4, 2, 2, 3);
console.log("---");
resize(zig, "ZIG", 4, 4, 2, 2, 1);
resize(c,   "C  ", 4, 4, 2, 2, 1);

zig.close(); c.close();
