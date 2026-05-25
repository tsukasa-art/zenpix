---
title: Environments & Troubleshooting
description: Supported OS and runtimes for zenpix, plus solutions to common errors.
---

---

## Supported Environments

| Runtime | macOS arm64 | macOS x64 (Intel) | Linux x86_64 | Linux arm64 | Windows x64 |
|---|:---:|:---:|:---:|:---:|:---:|
| Node.js 18+ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bun | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deno 2.x | ✅ | ✅ | ✅ | ✅ | ✅ |

Platform binaries are automatically selected via optional packages (`zenpix-darwin-arm64`, etc.). No build toolchain required.

**Unsupported environments**:
- Alpine Linux (musl): requires glibc
- Cloudflare Workers: CPU limits apply
- Windows on ARM64: not bundled (specify a locally-built `libpict.dll` via `ZENPIX_LIB`)

---

## Package Structure

```
zenpix                      # root (JS + CLI)
  ├── zenpix-darwin-arm64   # optional: libpict.dylib (Apple Silicon)
  ├── zenpix-darwin-x64     # optional: libpict.dylib (Intel Mac)
  ├── zenpix-linux-x64      # optional: libpict.so
  ├── zenpix-linux-arm64    # optional: libpict.so (ARM servers)
  └── zenpix-win32-x64      # optional: libpict.dll
```

The root and all five optional packages are always published at the same semver.

---

## Troubleshooting

### `encodeAvif()` always returns `null`

Returns `null` when `quality` or `speed` is out of range (by design):

```typescript
// Bad: speed out of range
encodeAvif(image, { quality: 60, speed: 11 }); // → null

// Good
encodeAvif(image, { quality: 60, speed: 10 }); // → Buffer
```

### `Error: Cannot find module 'zenpix-darwin-arm64'`

The OS or architecture is not supported, or the optional package was not installed:

```bash
npm install zenpix --include=optional
```

### `zenpix: decode failed`

Unsupported format:

- HEIC / HEIF → use `decodeHeic()` (macOS / Linux only)
- Animated WebP → not supported
- Animated GIF → first frame only (RGB output); subsequent frames are inaccessible

### Deno requires `--allow-ffi`

```bash
deno run --allow-ffi --allow-read your-script.ts
```

### `libpict.dll` fails to load on Windows

The Visual C++ Redistributable (x64) may be required. Install it from the Microsoft website. Under WSL2, the Linux binary is used instead.

---

## Using a Locally-Built Binary

To test a newer `libpict` than what is bundled in the optional packages:

```bash
# macOS / Linux
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --parallel
# → build/libpict.{dylib,so}

# Point to it via environment variable (takes priority over optional packages)
ZENPIX_LIB=/path/to/libpict.dylib node your-script.js
```

Resolution order: `ZENPIX_LIB` env var → `build/libpict.*` → `optionalDependencies`
