# Changelog

このファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) の体裁に近づけ、利用者向けの差分を記録する。

## [Unreleased]

（次パッチ以降の差分をここに書く）

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

### ベンチマーク（対 Sharp）

VPS（Ubuntu 2vCPU）でキャラクターイラスト・厚塗り風景で Sharp を 1.2〜1.5× 上回る。CPU user 時間は Sharp の約 40%（同時処理時のコア競合を低減）。

### 既知の制限

- Alpine Linux（musl）非対応（glibc 前提）
- Cloudflare Workers 非対応（CPU 制限）
- HEIC エンコード非対応（HEVC 特許問題）
- アニメーション WebP 非対応
- アニメーション GIF は先頭フレームのみ
