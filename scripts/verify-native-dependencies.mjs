import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const [target, input] = process.argv.slice(2);
if (!target || !input) {
  console.error("Usage: node scripts/verify-native-dependencies.mjs <darwin|linux|win32> <binary>");
  process.exit(2);
}

const binary = resolve(input);
if (!existsSync(binary)) throw new Error(`binary not found: ${binary}`);

function output(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} failed with exit ${result.status}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

const forbidden = /(?:lib)?(?:avif|aom|dav1d|webp|webpmux|webpdemux|sharpyuv|jpeg|png)(?:[-.\d]|\.dll)/i;

if (target === "darwin") {
  const dependencies = output("otool", ["-L", binary]);
  console.log(dependencies.trim());
  for (const line of dependencies.split("\n").slice(1)) {
    const dependency = line.trim().split(/\s+/)[0];
    if (!dependency) continue;
    if (dependency.startsWith("@rpath/libpict.")) continue;
    if (dependency.startsWith("/usr/lib/") || dependency.startsWith("/System/Library/")) continue;
    throw new Error(`non-system macOS runtime dependency: ${dependency}`);
  }

  const build = output("vtool", ["-show-build", binary]);
  console.log(build.trim());
  const minos = build.match(/\bminos\s+(\d+(?:\.\d+)*)/);
  if (!minos) throw new Error("LC_BUILD_VERSION minos was not found");
  if (minos[1] !== "12.0") throw new Error(`expected macOS deployment target 12.0, found ${minos[1]}`);
} else if (target === "linux") {
  const dependencies = output("readelf", ["-d", binary]);
  console.log(dependencies.trim());
  for (const line of dependencies.split("\n")) {
    if (line.includes("(NEEDED)") && forbidden.test(line)) {
      throw new Error(`codec runtime dependency found in Linux artifact: ${line.trim()}`);
    }
  }

  const versionInfo = output("readelf", ["--version-info", binary]);
  const glibcVersions = [...versionInfo.matchAll(/\bGLIBC_(\d+)\.(\d+)\b/g)].map(
    (match) => ({ major: Number(match[1]), minor: Number(match[2]), text: match[0] }),
  );
  if (glibcVersions.length === 0) throw new Error("no GLIBC symbol versions found");
  glibcVersions.sort((a, b) => a.major - b.major || a.minor - b.minor);
  const newest = glibcVersions.at(-1);
  if (newest.major > 2 || (newest.major === 2 && newest.minor > 34)) {
    throw new Error(`Linux artifact requires ${newest.text}; maximum supported baseline is GLIBC_2.34`);
  }
  console.log(`maximum required GLIBC symbol: ${newest.text}`);
} else if (target === "win32") {
  const dependencies = output("dumpbin.exe", ["/dependents", binary]);
  console.log(dependencies.trim());
  for (const line of dependencies.split("\n")) {
    if (forbidden.test(line)) throw new Error(`codec runtime dependency found in Windows artifact: ${line.trim()}`);
  }
} else {
  throw new Error(`unsupported target: ${target}`);
}

console.log(`${target} native dependency verification passed`);
