# Changelog — zenpix-wasm

[`zenpix-wasm`](https://www.npmjs.com/package/zenpix-wasm)（ブラウザ向け AVIF エンコード専用）の利用者向け差分。

## [1.1.1] - 未公開

- clean buildでbaseline / SIMDのJS・WASM成果物がすべて存在することをpack前に検査する。
- packed tarballのbaseline / SIMD encodeをChromiumで検証する。
- 実際に同梱するlibavif、libaom、libyuvのライセンス通知を明確化する。
- package rootと`zenpix-wasm/encoder`のAPIは1.1.0から変更しない。

## [1.1.0] - 2026-07-22

- package rootのdefault exportを、公開済み1.0.0と同じbaseline版raw Emscripten factoryとして維持。
- `zenpix-wasm/encoder`に`createAvifEncoder` wrapperを追加し、baseline / SIMD成果物を選択可能にした。
- `zenpix-wasm/raw`をbaseline版raw factoryの明示的aliasとして追加。
- 公開tarballへ既存の`LICENSE`と`THIRD_PARTY_LICENSES`を同梱。

root importの差し替えは行わず、1.0.0のESM・browser向けraw APIを維持する。

## [1.0.0] - 2026-05-28

### 変更

- **正式リリース**: zenpix 本体（ネイティブ）の 1.0.0 に合わせ、WASM も 1.0.0 に昇格。
- **ビルド基盤を C に移行**: 内部実装を Zig → C に変更（zenpix 本体と同様）。WASM バイナリ・API に変更なし。
- libavif v1.4.1 / libaom v3.12.1（変更なし）。

### 互換性

API・成果物（`dist/avif.js` / `avif.wasm`、SIMD 版、エンコードオプション）に **変更なし**。`zenpix-wasm@0.2.0` からそのまま移行可能。
