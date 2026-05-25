# 動作環境・トラブルシューティング

---

## 動作環境

| ランタイム | macOS arm64 | macOS x64（Intel） | Linux x64 | Linux arm64 | Windows x64 |
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

ルートと optional 5 件は常に同一 semver で publish されます。

---

## トラブルシューティング

### `encodeAvif()` が常に `null` を返す

`quality` / `speed` が範囲外のとき `null` を返します（仕様）：

- `quality`: 整数かつ 0–100 の範囲外
- `speed`: 整数かつ 0–10 の範囲外

```typescript
// NG: speed が範囲外
encodeAvif(image, { quality: 60, speed: 11 }); // → null

// OK
encodeAvif(image, { quality: 60, speed: 10 }); // → Buffer
```

### `Error: Cannot find module 'zenpix-darwin-arm64'` などのエラー

対応していない OS・アーキテクチャです。動作環境の表を確認してください。

npm install 時に optional パッケージが入らなかった可能性もあります：

```bash
npm install zenpix --include=optional
```

### `zenpix: decode failed`

対応していないフォーマットです：

- アニメーション WebP → 非対応（先頭フレームのみ必要なら JPEG/PNG に変換）
- アニメーション GIF → 先頭フレームのみ RGB 出力（2フレーム目以降は取得不可）

HEIC / HEIF は `decodeHeic()` を使ってください（macOS・Linux のみ対応）。

### `zenpix: HEIC decode is not available on this platform`

Windows では HEIC デコードはサポートされていません。macOS または Linux で実行してください。

### Deno で `--allow-ffi` が必要

```bash
deno run --allow-ffi --allow-read your-script.ts
```

### Windows で `libpict.dll` の読み込みに失敗

VC++ 再頒布可能パッケージ（x64）が必要な場合があります。Microsoft 公式サイトからインストールしてください。WSL2 では Linux バイナリが使われます。

---

## ローカルビルドのバイナリを使う

開発中など、optional パッケージより新しい `libpict` を試したい場合：

```bash
# macOS / Linux
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
# → build/libpict.{dylib,so}

# 環境変数でパスを指定（optional より優先して読み込まれる）
ZENPIX_LIB=/path/to/libpict.dylib node your-script.js
```

`libpict` の解決順：`ZENPIX_LIB` 環境変数 → `build/libpict.*` → `optionalDependencies`
