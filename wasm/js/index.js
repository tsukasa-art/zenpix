async function createAvifEncoder(options) {
  const normalized = typeof options === "string" ? { wasmUrl: options } : options ?? {};
  const variant = normalized.variant ?? "baseline";
  if (variant !== "baseline" && variant !== "simd") {
    throw new TypeError(`Unsupported zenpix-wasm variant: ${String(variant)}`);
  }
  const factoryModule = variant === "simd" ? await import("../dist/avif.simd.js") : await import("../dist/avif.js");
  const moduleOptions = {};
  if (normalized.wasmUrl) {
    moduleOptions.locateFile = (file) => file.endsWith(".wasm") ? normalized.wasmUrl : file;
  }
  const Module = await factoryModule.default(moduleOptions);
  const versionPtr = Module.ccall("avif_version", "number", [], []);
  const version = readCString(Module.HEAPU8, versionPtr);
  return {
    version,
    encode(pixels, width, height, opts = {}) {
      const quality = opts.quality ?? 60;
      const speed = opts.speed ?? 10;
      if (quality < 0 || quality > 100 || speed < 0 || speed > 10) {
        return null;
      }
      if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
        return null;
      }
      const channels = pixels.length / (width * height);
      if (channels !== 3 && channels !== 4) return null;
      const inputPtr = Module._malloc(pixels.length);
      if (!inputPtr) return null;
      Module.HEAPU8.set(pixels, inputPtr);
      const outPtr = Module._avif_encode(
        inputPtr,
        width,
        height,
        channels,
        quality,
        speed
      );
      Module._free(inputPtr);
      if (!outPtr) return null;
      const outSize = Module._avif_get_out_size();
      const result = Module.HEAPU8.slice(outPtr, outPtr + outSize);
      Module._avif_free_output(outPtr);
      return result;
    },
    dispose() {
    }
  };
}
function readCString(heap, ptr) {
  let end = ptr;
  while (heap[end] !== 0) end++;
  return new TextDecoder().decode(heap.subarray(ptr, end));
}
export {
  createAvifEncoder
};
