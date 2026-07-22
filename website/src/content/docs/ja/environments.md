---
title: 動作環境・トラブルシューティング
description: zenpix の対応 OS・ランタイムと、よくあるエラーの解決方法。
---

---

## 動作環境

| ランタイム | macOS arm64 | macOS x64（Intel） | Linux x86_64 | Linux arm64 | Windows x64 |
|---|:---:|:---:|:---:|:---:|:---:|
| Node.js 18+ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bun | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deno 2.x | ✅ | ✅ | ✅ | ✅ | ✅ |

各プラットフォームのバイナリは optional パッケージ（`zenpix-darwin-arm64` など）として自動選択されます。ビルド環境は一切不要です。

**非対応環境**:
- Alpine Linux（musl）: glibc 前提のため非対応
- Cloudflare Workers: CPU 制限により非対応
- Windows on ARM64: 公式同梱なし（`ZENPIX_LIB` で手元ビルドの `libpict.dll` を指定することで利用可能）

---

## npm パッケージ構成

```
zenpix                      # ルート（JS + CLI）
  ├── zenpix-darwin-arm64   # optional: libpict.dylib（Apple Silicon）
  ├── zenpix-darwin-x64     # optional: libpict.dylib（Intel Mac）
  ├── zenpix-linux-x64      # optional: libpict.so
  ├── zenpix-linux-arm64    # optional: libpict.so（ARM サーバー）
  └── zenpix-win32-x64      # optional: libpict.dll
```

---

## トラブルシューティング

### `encodeAvif()` が常に `null` を返す

`quality` / `speed` が範囲外のとき `null` を返します：

```typescript
// NG
encodeAvif(image, { quality: 60, speed: 11 }); // → null

// OK
encodeAvif(image, { quality: 60, speed: 10 }); // → Buffer
```

### `Error: Cannot find module 'zenpix-darwin-arm64'`

対応していない OS・アーキテクチャです。optional パッケージが入らなかった場合：

```bash
npm install zenpix --include=optional
```

### `zenpix: decode failed`

- HEIC / HEIF → `decodeHeic()` を使ってください（macOS・Linux のみ対応）
- アニメーション WebP → 非対応
- アニメーション GIF → 先頭フレームのみ RGB 出力

### Deno で `--allow-ffi` が必要

```bash
deno run --allow-ffi --allow-read your-script.ts
```

通常経路では環境変数の権限は不要です。optionalな上書きを使う場合だけ追加します。

```bash
ZENPIX_LIB=/path/to/libpict.dylib deno run --allow-ffi --allow-read --allow-env=ZENPIX_LIB your-script.ts
```

### Windows で `libpict.dll` の読み込みに失敗

VC++ 再頒布可能パッケージ（x64）が必要な場合があります。WSL2 では Linux バイナリが使われます。

---

## ローカルビルドのバイナリを使う

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --parallel
# → build/libpict.{dylib,so}
ZENPIX_LIB=/path/to/libpict.dylib node your-script.js
```

`libpict` の解決順：`ZENPIX_LIB` 環境変数 → `build/libpict.*` → `optionalDependencies`
