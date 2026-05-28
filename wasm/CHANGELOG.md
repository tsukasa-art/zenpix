# Changelog — zenpix-wasm

[`zenpix-wasm`](https://www.npmjs.com/package/zenpix-wasm)（ブラウザ向け AVIF エンコード専用）の利用者向け差分。

## [1.0.0] - 2026-05-28

### 変更

- **正式リリース**: zenpix 本体（ネイティブ）の 1.0.0 に合わせ、WASM も 1.0.0 に昇格。
- **ビルド基盤を C に移行**: 内部実装を Zig → C に変更（zenpix 本体と同様）。WASM バイナリ・API に変更なし。
- libavif v1.4.1 / libaom v3.12.1（変更なし）。

### 互換性

API・成果物（`dist/avif.js` / `avif.wasm`、SIMD 版、エンコードオプション）に **変更なし**。`zenpix-wasm@0.2.0` からそのまま移行可能。
