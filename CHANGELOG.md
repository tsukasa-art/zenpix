# Changelog

このファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) の体裁に近づけ、利用者向けの差分を記録する。

## [1.0.3] - 未公開

### ネイティブresize SIMD

- scalarの2-pass Lanczos-3を正解基準として残し、RGBAの水平・垂直passにarm64 NEONとx86_64 SSE2の経路を追加した。
- 1 / 2 / 3 channel、未対応CPU、`ZENPIX_ENABLE_SIMD=OFF`はscalarへfallbackする。公開API / ABIは変更しない。
- scalar対SIMDのC単体・共有ライブラリFFI・既存RGB / 操作テストを追加した。macOS arm64ではNEON、macOS x64ではRosetta上のSSE2について画素一致を確認した。
- GitHub Actions run `30674867350`でmacOS arm64 / x64、Linux arm64 / x64、Windows x64のSIMD・強制scalar build/test、共有ライブラリFFI比較、AVIF roundtrip、artifact生成が通過した。最終versionの全7 tarball、npm配布物、本番利用は未確認。
- Apple M4 Proでのローカル測定では、対象RGBA resizeでscalar比約1.08〜1.15倍、decode→resize→AVIF全体で約1.07〜1.13倍だった。RGB fallbackは改善せず、この範囲を一般性能の主張には使用しない。

## [1.0.2 / zenpix-wasm 1.1.0] - 2026-07-22

### zenpix 1.0.2

- 公開説明をCネイティブ画像処理エンジン、TypeScript FFI、CLI、platform optional packageの実装範囲に合わせた。
- Denoの通常経路では`--allow-ffi`と`--allow-read`だけを使い、`ZENPIX_LIB`上書き時だけ`--allow-env=ZENPIX_LIB`を必要とする権限処理へ変更した。
- rootと5つのplatform optional packageを1.0.2へ同期し、公開tarballへ既存の`LICENSE`と`THIRD_PARTY_LICENSES`を同梱した。
- `prepack`でTypeScript成果物をclean buildし、古い`js/dist`をpackしないようにした。

### zenpix-wasm 1.1.0

- 公開済み1.0.0と同じく、package rootのdefault exportをbaseline版raw Emscripten factoryとして維持した。
- `zenpix-wasm/encoder`に`createAvifEncoder` wrapperを追加し、baseline / SIMD成果物を選べるようにした。
- `zenpix-wasm/raw`をbaseline版raw factoryの明示的aliasとして追加した。
- package metadataとREADMEを現在のESM・browser向け成果物に合わせ、既存の`LICENSE`と`THIRD_PARTY_LICENSES`をtarballへ同梱した。

この更新でroot importをwrapperへ差し替える破壊的変更は行っていない。

## [1.0.1] - 2026-05-30

### 修正

- Linux 向け `libpict.so` を vcpkg 静的リンクでビルドするよう CI を変更。
  これにより `libavif.so`・`libwebp.so`・`libjpeg.so`・`libpng.so` 等の
  システムライブラリへの実行時依存がなくなり、Docker 等の最小イメージでも動作する。

## [1.0.0] - 2026-05-25

### 初回リリース

zenpix-c — C で実装した画像変換ライブラリ。以前の Zig 実装からフルリライト。

### 機能

- **`decode()`**: JPEG・PNG・静止画 WebP・AVIF・GIF（先頭フレームのみ）をデコード。JPEG EXIF Orientation 自動適用。
- **`decodeHeic()`**: HEIC/HEIF をデコード（macOS・Linux）。libheif を実行時 dlopen で読み込み、未インストール時は他機能に影響なし。
- **`resize()`**: Lanczos-3 フィルタ。`fit: "stretch" | "contain" | "cover"`。`threads` オプションで並列化。
- **`encodeAvif()`**: AVIF エンコード（quality 0–100、speed 0–10、threads）。
- **`encodeWebP()`**: WebP エンコード（quality、lossless）。
- **`encodePng()`**: PNG エンコード（compression 0–9）。
- **`crop()`**: 矩形切り出し。
- **`convert()`**: decode → crop → resize → encode の一括パイプライン。
- **`removeBackground()`**: 四隅 BFS フラッドフィルで白背景を透過化。
- **`flattenBackground()`**: RGBA → 白背景合成 RGB。
- **`roundCorners()`**: 角丸マスク（px または `"full"` で完全な円形）。
- **CLI**: `npx zenpix` でコマンドライン変換。

### 対応プラットフォーム

Node.js 18+・Bun・Deno 2.x、macOS arm64/x64、Linux x86_64/arm64、Windows x64。

### 当時のベンチマーク記録（対 Sharp）

2026-05-25のVPS（Ubuntu 2vCPU）測定では、使用したキャラクターイラスト・厚塗り風景fixtureでSharpを1.2〜1.5倍上回り、CPU user時間はSharpの約40%だった。fixtureを再配布していないため、この数値は当時の条件に限る記録であり、一般性能の主張には使用しない。

### 既知の制限

- Alpine Linux（musl）非対応（glibc 前提）
- Cloudflare Workers 非対応（CPU 制限）
- HEIC エンコード非対応（HEVC 特許問題）
- アニメーション WebP 非対応
- アニメーション GIF は先頭フレームのみ
