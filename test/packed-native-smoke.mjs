import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { decode, encodeAvif, resize } from "zenpix";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const width = 24;
const height = 16;
const data = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data[i] = (x * 11 + y * 3) & 0xff;
    data[i + 1] = (x * 5 + y * 17) & 0xff;
    data[i + 2] = (x * 19 + y * 7) & 0xff;
    data[i + 3] = (x * 13 + y * 23) & 0xff;
  }
}

const resized = resize({ data, width, height, channels: 4 }, {
  width: 12,
  height: 8,
  threads: 2,
});
assert(resized.width === 12 && resized.height === 8, "packed RGBA resize returned unexpected dimensions");
assert(resized.data.byteLength === 12 * 8 * 4, "packed RGBA resize returned unexpected byte length");

const encoded = encodeAvif(resized, { quality: 70, speed: 10, threads: 2 });
assert(encoded && encoded.byteLength > 16, "packed AVIF encode failed");
assert(encoded.subarray(4, 8).toString("ascii") === "ftyp", "packed AVIF output has no ftyp box");

const input = resolve("packed-smoke-input.avif");
const output = resolve("packed-smoke-output.avif");
writeFileSync(input, encoded);
execFileSync(process.execPath, [
  resolve("node_modules/zenpix/js/dist/cli.js"),
  input,
  output,
  "--width", "6",
  "--height", "4",
  "--speed", "10",
  "--threads", "2",
], { stdio: "inherit" });
assert(existsSync(output), "packed CLI did not create an output file");
const cliDecoded = decode(readFileSync(output));
assert(cliDecoded.width === 6 && cliDecoded.height === 4, "packed CLI output has unexpected dimensions");

console.log("packed native API / CLI smoke passed");
