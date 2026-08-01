import { encodeAvif, resize } from "zenpix/deno";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const width = 16;
const height = 10;
const data = new Uint8Array(width * height * 4);
for (let i = 0; i < data.length; i++) data[i] = (i * 29 + 17) & 0xff;

const resized = resize({ data, width, height, channels: 4 }, {
  width: 8,
  height: 5,
  threads: 2,
});
assert(resized.width === 8 && resized.height === 5, "packed Deno RGBA resize returned unexpected dimensions");

const encoded = encodeAvif(resized, { quality: 70, speed: 10, threads: 2 });
assert(encoded && encoded.byteLength > 16, "packed Deno AVIF encode failed");
assert(new TextDecoder().decode(encoded.subarray(4, 8)) === "ftyp", "packed Deno AVIF output has no ftyp box");

console.log("packed Deno API smoke passed");
