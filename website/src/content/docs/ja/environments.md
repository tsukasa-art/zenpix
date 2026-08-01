---
title: 動作環境・トラブルシューティング
description: zenpix の対応 OS・ランタイムと、よくあるエラーの解決方法。
---

---

## 動作環境

| ランタイム | macOS arm64 | macOS x64（Intel） | Linux x86_64 | Linux arm64 | Windows x64 |
|---|:---:|:---:|:---:|:---:|:---:|
| Node.js 18+ | 対象 | 対象 | 対象 | 対象 | 対象 |
| Bun | 対象 | 対象 | 対象 | 対象 | 対象 |
| Deno 2.x | 対象 | 対象 | 対象 | 対象 | 対象 |

各プラットフォームのバイナリは optional パッケージ（`zenpix-darwin-arm64` など）として自動選択されます。「対象」はpackageとrelease-candidate workflowの対象を示します。公開済みversionと候補の状態は次で区別します。

公開済み1.0.2のoptional packageはscalarです。native 1.0.3候補では、arm64はRGBA resizeにNEON、x86_64はSSE2をbuild時に選び、その他はscalarへfallbackします。5環境のworkflowはSIMD版と強制scalar版をbuild・testし、直前のbuild出力をpackしてSHA256一致、runtime依存、Node.js / Bun / Deno API、CLI実変換を検査します。npm registry上の1.0.3と本番利用は未確認です。

公開済みmacOS 1.0.2にはHomebrew codecへの絶対パス依存とmacOS 15.0以上という既知の問題があります。1.0.3候補はcodecを静的リンクし、macOS 12.0をdeployment targetにします。Linux候補はglibc 2.34以上を対象とし、CIで`GLIBC_2.34`より新しいsymbol参照を拒否します。Windows x64はVC++ Redistributableが必要になる場合があります。

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

# SIMDを無効にした正解基準build
cmake -S . -B build-scalar -DCMAKE_BUILD_TYPE=Release -DZENPIX_ENABLE_SIMD=OFF
cmake --build build-scalar --parallel
ZENPIX_LIB=/path/to/libpict.dylib node your-script.js
```

`libpict` の解決順：`ZENPIX_LIB` 環境変数 → `build/libpict.*` → `optionalDependencies`

`ZENPIX_ENABLE_SIMD`は既定で`ON`、`ZENPIX_BUILD_TESTS`と`ZENPIX_MARCH_NATIVE`は既定で`OFF`です。`ZENPIX_MARCH_NATIVE`はローカル測定用であり、配布buildでは有効にしません。
