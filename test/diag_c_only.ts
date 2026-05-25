// C dylib のみをロードして uniform color resize の正確性を確認
import { dlopen, FFIType, ptr, toArrayBuffer } from "bun:ffi";
import { join } from "path";

const C_LIB = join(import.meta.dir, "../build/libpict.dylib");

const lib = dlopen(C_LIB, {
  pict_resize: {
    args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u8,
           FFIType.u32, FFIType.u32, FFIType.u32, FFIType.ptr],
    returns: FFIType.ptr,
  },
  pict_free_buffer: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.void },
});

// 4×4 RGB uniform (100, 150, 200) → 2×2
{
  const src = new Uint8Array(4 * 4 * 3);
  for (let i = 0; i < 16; i++) { src[i*3]=100; src[i*3+1]=150; src[i*3+2]=200; }
  const outLen = new BigUint64Array(1);
  const r = lib.symbols.pict_resize(ptr(src), 4, 4, 3, 2, 2, 1, ptr(outLen));
  const out = new Uint8Array(toArrayBuffer(r!, 0, Number(outLen[0])).slice(0));
  lib.symbols.pict_free_buffer(r!, outLen[0]);
  console.log("4x4 uniform RGB → 2x2:");
  for (let i = 0; i < 4; i++) console.log(`  [${i}] R=${out[i*3]} G=${out[i*3+1]} B=${out[i*3+2]} (expect 100,150,200)`);
}

// gradient 64×48 → 64×48 identity: pixel(2,0) should be R=8,G=0,B=5
{
  const SRC_W=64, SRC_H=48, CH=3;
  const src = new Uint8Array(SRC_W * SRC_H * CH);
  for (let y = 0; y < SRC_H; y++) for (let x = 0; x < SRC_W; x++) {
    const i = (y*SRC_W+x)*CH;
    src[i+0] = Math.round(x*255/(SRC_W-1));
    src[i+1] = Math.round(y*255/(SRC_H-1));
    src[i+2] = Math.round((x+y)*255/(SRC_W+SRC_H-2));
  }
  const outLen = new BigUint64Array(1);
  const r = lib.symbols.pict_resize(ptr(src), SRC_W, SRC_H, CH, SRC_W, SRC_H, 1, ptr(outLen));
  const out = new Uint8Array(toArrayBuffer(r!, 0, Number(outLen[0])).slice(0));
  lib.symbols.pict_free_buffer(r!, outLen[0]);
  console.log("\n64x48 identity:");
  console.log(`  (0,0): R=${out[0]} G=${out[1]} B=${out[2]} (src: R=0,G=0,B=0)`);
  console.log(`  (2,0): R=${out[6]} G=${out[7]} B=${out[8]} (src: R=8,G=0,B=5)`);
  console.log(`  (0,1): R=${out[SRC_W*3]} G=${out[SRC_W*3+1]} B=${out[SRC_W*3+2]} (src: R=0,G=5,B=2)`);
}

lib.close();
