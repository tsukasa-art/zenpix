import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const inputDir = resolve(process.argv[2] ?? "downloaded-artifacts");
const outputDir = resolve(process.argv[3] ?? "release-candidate");

const expected = new Map([
  ["zenpix", { version: "1.0.4", binary: null }],
  ["zenpix-darwin-arm64", { version: "1.0.4", binary: "libpict.dylib" }],
  ["zenpix-darwin-x64", { version: "1.0.4", binary: "libpict.dylib" }],
  ["zenpix-linux-arm64", { version: "1.0.4", binary: "libpict.so" }],
  ["zenpix-linux-x64", { version: "1.0.4", binary: "libpict.so" }],
  ["zenpix-win32-x64", { version: "1.0.4", binary: "libpict.dll" }],
  ["zenpix-wasm", { version: "1.1.2", binary: null }],
]);

const rootOptionalDependencies = Object.fromEntries(
  [...expected]
    .filter(([name]) => name.startsWith("zenpix-") && name !== "zenpix-wasm")
    .map(([name, metadata]) => [name, metadata.version]),
);

function fail(message) {
  console.error(`release candidate verification failed: ${message}`);
  process.exit(1);
}

function findTarballs(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...findTarballs(path));
    else if (entry.isFile() && entry.name.endsWith(".tgz")) found.push(path);
  }
  return found;
}

function tarOutput(tarball, args) {
  const result = spawnSync("tar", [...args, tarball], { encoding: "utf8" });
  if (result.status !== 0) {
    fail(`${basename(tarball)}: tar exited ${result.status}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function readPackageJson(tarball) {
  const result = spawnSync("tar", ["-xOf", tarball, "package/package.json"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`${basename(tarball)}: package/package.json is unreadable`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`${basename(tarball)}: invalid package.json (${error.message})`);
  }
}

function requireFiles(packageName, files, required) {
  for (const file of required) {
    if (!files.has(`package/${file}`)) fail(`${packageName}: missing ${file}`);
  }
}

const tarballs = findTarballs(inputDir);
if (tarballs.length !== expected.size) {
  fail(`expected ${expected.size} tarballs, found ${tarballs.length}`);
}

if (existsSync(outputDir) && readdirSync(outputDir).length !== 0) {
  fail(`output directory is not empty: ${outputDir}`);
}
mkdirSync(outputDir, { recursive: true });
const seen = new Set();
const checksums = [];

for (const tarball of tarballs) {
  const pkg = readPackageJson(tarball);
  const metadata = expected.get(pkg.name);
  if (!metadata) fail(`${basename(tarball)}: unexpected package ${pkg.name}`);
  if (seen.has(pkg.name)) fail(`duplicate package ${pkg.name}`);
  seen.add(pkg.name);

  if (pkg.version !== metadata.version) {
    fail(`${pkg.name}: expected version ${metadata.version}, found ${pkg.version}`);
  }

  const files = new Set(
    tarOutput(tarball, ["-tzf"])
      .split("\n")
      .map((line) => line.replace(/^\.\//, ""))
      .filter(Boolean),
  );
  requireFiles(pkg.name, files, ["LICENSE", "THIRD_PARTY_LICENSES"]);

  if (metadata.binary) requireFiles(pkg.name, files, [metadata.binary]);

  if (pkg.name === "zenpix") {
    const actualOptional = Object.entries(pkg.optionalDependencies ?? {}).sort();
    const expectedOptional = Object.entries(rootOptionalDependencies).sort();
    if (JSON.stringify(actualOptional) !== JSON.stringify(expectedOptional)) {
      fail("zenpix: optionalDependencies do not exactly match the five native packages");
    }
    requireFiles(pkg.name, files, [
      "js/dist/index.js",
      "js/dist/index.d.ts",
      "js/dist/index.deno.js",
      "js/dist/cli.js",
      "assets/sample_sharp.png",
      "assets/sample_zenpix.png",
      "docs/reference/benchmarks.md",
    ]);
  }

  if (pkg.name === "zenpix-wasm") {
    requireFiles(pkg.name, files, [
      "dist/avif.js",
      "dist/avif.wasm",
      "dist/avif.simd.js",
      "dist/avif.simd.wasm",
      "js/index.js",
      "js/index.d.ts",
    ]);
  }

  const contents = readFileSync(tarball);
  const sha256 = createHash("sha256").update(contents).digest("hex");
  const outputName = basename(tarball);
  cpSync(tarball, join(outputDir, outputName));
  checksums.push(`${sha256}  ${outputName}`);
  console.log(`verified ${pkg.name}@${pkg.version}: ${outputName}`);
}

for (const packageName of expected.keys()) {
  if (!seen.has(packageName)) fail(`missing package ${packageName}`);
}

checksums.sort();
writeFileSync(join(outputDir, "SHA256SUMS"), `${checksums.join("\n")}\n`);
console.log(`verified ${seen.size} packages; wrote ${join(outputDir, "SHA256SUMS")}`);
