import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(repoRoot, "wasm", "dist");
const expected = [
  "avif.js",
  "avif.wasm",
  "avif.simd.js",
  "avif.simd.wasm",
];

let failed = false;
for (const name of expected) {
  const path = join(distDir, name);
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size === 0) throw new Error("empty or not a file");
    const data = readFileSync(path);
    if (name.endsWith(".wasm") && !data.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d]))) {
      throw new Error("invalid WebAssembly magic bytes");
    }
    const sha256 = createHash("sha256").update(data).digest("hex");
    console.log(`${name}: ${stat.size} bytes sha256=${sha256}`);
  } catch (error) {
    failed = true;
    console.error(`missing or invalid wasm/dist/${name}: ${error.message}`);
  }
}

if (failed) {
  console.error("Run `npm run build:all --prefix wasm` from a clean checkout before packing zenpix-wasm.");
  process.exit(1);
}
