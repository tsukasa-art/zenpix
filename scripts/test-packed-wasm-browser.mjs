import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const tarball = process.argv[2] ? resolve(process.argv[2]) : null;
if (!tarball) {
  console.error("Usage: node scripts/test-packed-wasm-browser.mjs <zenpix-wasm.tgz>");
  process.exit(2);
}

const temp = mkdtempSync(join(tmpdir(), "zenpix-packed-wasm-"));
const result = spawnSync("tar", ["-xzf", tarball, "-C", temp], { stdio: "inherit" });
if (result.status !== 0) throw new Error(`tar extraction failed with exit ${result.status}`);

const html = `<!doctype html>
<meta charset="utf-8">
<script type="module">
  import { createAvifEncoder } from "/package/js/index.js";
  try {
    const width = 8;
    const height = 6;
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 31 + 7) & 255;
    const results = {};
    for (const variant of ["baseline", "simd"]) {
      const encoder = await createAvifEncoder({
        variant,
        wasmUrl: "/package/dist/avif" + (variant === "simd" ? ".simd" : "") + ".wasm",
      });
      const encoded = encoder.encode(pixels, width, height, { quality: 60, speed: 10 });
      if (!encoded || encoded.length < 16) throw new Error(variant + " encode returned no AVIF data");
      const marker = String.fromCharCode(...encoded.slice(4, 8));
      if (marker !== "ftyp") throw new Error(variant + " output has no ftyp box");
      results[variant] = { bytes: encoded.length, version: encoder.version };
      encoder.dispose();
    }
    window.__packedWasmResult = { ok: true, results };
  } catch (error) {
    window.__packedWasmResult = { ok: false, error: error.stack || String(error) };
  }
</script>`;
writeFileSync(join(temp, "index.html"), html);

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

const server = createServer((request, response) => {
  try {
    const requestPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
    const file = normalize(join(temp, requestPath));
    if (!file.startsWith(`${temp}/`)) throw new Error("path traversal");
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "Content-Type": types.get(extname(file)) ?? "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    });
    response.end(readFileSync(file));
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? String(error)));
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__packedWasmResult !== undefined, null, { timeout: 120_000 });
  const browserResult = await page.evaluate(() => window.__packedWasmResult);
  if (!browserResult.ok) throw new Error(browserResult.error);
  if (pageErrors.length) throw new Error(pageErrors.join("\n"));
  console.log(JSON.stringify(browserResult, null, 2));
  console.log("packed WASM baseline / SIMD browser smoke passed");
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(temp, { recursive: true, force: true });
}
