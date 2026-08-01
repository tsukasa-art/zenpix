import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const [packageName, sourceBinary] = process.argv.slice(2);
if (!packageName || !sourceBinary) {
  console.error("Usage: node scripts/pack-native-ci.mjs <optional-package-name> <built-binary>");
  process.exit(2);
}

const packageDir = join(repoRoot, "npm", packageName);
const sourcePath = resolve(repoRoot, sourceBinary);
const packageBinary = join(packageDir, basename(sourcePath));
const packedDir = join(repoRoot, "packed");
const temp = mkdtempSync(join(tmpdir(), "zenpix-packed-native-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
  return result.stdout ?? "";
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

try {
  if (!existsSync(packageDir)) throw new Error(`unknown optional package: ${packageName}`);
  if (!existsSync(sourcePath)) throw new Error(`built binary not found: ${sourcePath}`);

  const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const optionalPackage = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  if (rootPackage.version !== optionalPackage.version || rootPackage.optionalDependencies[packageName] !== optionalPackage.version) {
    throw new Error(`version mismatch: zenpix=${rootPackage.version}, ${packageName}=${optionalPackage.version}`);
  }

  copyFileSync(sourcePath, packageBinary);
  mkdirSync(packedDir, { recursive: true });

  const optionalJson = JSON.parse(run("npm", ["pack", packageDir, "--pack-destination", packedDir, "--json"], { capture: true }));
  const optionalTarball = join(packedDir, optionalJson[0].filename);
  const rootJson = JSON.parse(run("npm", ["pack", repoRoot, "--pack-destination", temp, "--json"], { capture: true }));
  const rootTarball = join(temp, rootJson[0].filename);

  const unpacked = join(temp, "unpacked");
  mkdirSync(unpacked);
  run("tar", ["-xzf", optionalTarball, "-C", unpacked]);
  const packedBinary = join(unpacked, "package", basename(sourcePath));
  if (sha256(sourcePath) !== sha256(packedBinary)) {
    throw new Error("packed native binary does not match the binary built in this CI job");
  }

  const smoke = join(temp, "smoke");
  mkdirSync(smoke);
  writeFileSync(join(smoke, "package.json"), JSON.stringify({ type: "module", private: true }, null, 2));
  cpSync(join(repoRoot, "test", "packed-native-smoke.mjs"), join(smoke, "packed-native-smoke.mjs"));
  cpSync(join(repoRoot, "test", "packed-deno-smoke.mjs"), join(smoke, "packed-deno-smoke.mjs"));
  run("npm", ["install", rootTarball, optionalTarball, "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: smoke });
  run("node", ["packed-native-smoke.mjs"], { cwd: smoke });
  run("bun", ["packed-native-smoke.mjs"], { cwd: smoke });
  run("deno", ["run", "--allow-read", "--allow-ffi", "packed-deno-smoke.mjs"], { cwd: smoke });

  console.log(`packed ${packageName}: ${optionalTarball}`);
  console.log(`binary sha256=${sha256(sourcePath)}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
