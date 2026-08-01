import { rmSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../js/dist/", import.meta.url));

if (basename(distDir) !== "dist" || basename(dirname(distDir)) !== "js") {
  throw new Error(`Refusing to remove unexpected build directory: ${distDir}`);
}

rmSync(distDir, { recursive: true, force: true });
