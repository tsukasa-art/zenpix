# zenpix-wasm — ブラウザ向けAVIFエンコーダ

libavif + libaomをEmscriptenでWebAssemblyへコンパイルした、ブラウザ向けのAVIF encode packageです。

## 機能範囲

`zenpix-wasm`が受け取る入力は、8-bitのRGBまたはRGBA生ピクセルです。

| 機能 | 対応 |
|---|:---:|
| RGB / RGBA → AVIF encode | ✅ |
| JPEG / PNG / WebPなどのdecode | ❌ |
| resize / crop / 背景処理 | ❌ |
| CLI | ❌ |

ファイルのdecodeやresizeを含むパイプラインは、Node.js / Bun / Deno向けのネイティブpackage [`zenpix`](https://www.npmjs.com/package/zenpix)を使用してください。

## インストール

```bash
npm install zenpix-wasm
```

npm registry上の公開versionは`1.1.1`です。CIで作成したtarballをnpmへ公開し、registryから再取得したtarballのSHA256一致とbaseline / SIMDのChromium encodeを確認しています。

## クイックスタート

```typescript
import { createAvifEncoder } from "zenpix-wasm/encoder";

const encoder = await createAvifEncoder();

// width × height × 3 または width × height × 4 の Uint8Array
const avif = encoder.encode(pixels, width, height, {
  quality: 60,
  speed: 10,
});

if (avif) {
  const blob = new Blob([avif], { type: "image/avif" });
  const url = URL.createObjectURL(blob);
}

encoder.dispose();
```

## API

### `createAvifEncoder(options?)`

WASMをロードし、`AvifEncoder`を返します。baseline / SIMDを`variant`で選択できます。ViteなどがWASM assetを別URLへ配置する場合は、選択した成果物の`wasmUrl`を渡します。文字列だけを渡す従来のwrapper呼び出しは、baseline版の`wasmUrl`として扱います。

```typescript
type CreateAvifEncoderOptions = {
  variant?: "baseline" | "simd";
  wasmUrl?: string;
};

async function createAvifEncoder(
  options?: string | CreateAvifEncoderOptions,
): Promise<AvifEncoder>
```

### `AvifEncoder`

| メンバー | 型 | 説明 |
|---|---|---|
| `encode(pixels, width, height, options?)` | `Uint8Array \| null` | RGB / RGBA生ピクセルをAVIFへencode |
| `version` | `string` | libavif version |
| `dispose()` | `void` | 現行実装ではno-op。将来の互換性のため呼び出し可能 |

| option | default | 範囲 |
|---|---:|---|
| `quality` | `60` | 0–100 |
| `speed` | `10` | 0–10。10はエンコーダの最速設定 |

## Vite / bundler

```typescript
import wasmUrl from "zenpix-wasm/dist/avif.wasm?url";
import { createAvifEncoder } from "zenpix-wasm/encoder";

const encoder = await createAvifEncoder({ variant: "baseline", wasmUrl });
```

## baseline版とSIMD版

`zenpix-wasm/encoder`のwrapperはbaseline版を既定値とし、`{ variant: "simd" }`でSIMD版を選択できます。`zenpix-wasm/simd`はEmscripten生成factoryのraw exportで、高水準wrapperではありません。

2026-05-28にChrome / macOS arm64、`quality=60`、`speed=10`、warm-up 1回除外・3回中央値で測定した記録では、SIMD版はサイズによりbaseline版と同等から約21%短い処理時間でした。この数値はその環境と入力に限定され、一般性能の主張には使用しません。libaomの手書きSIMDは`AOM_TARGET_CPU=generic`のため無効で、差はEmscriptenの自動ベクトル化によるものです。

raw SIMD factoryを使う場合：

```typescript
import createAvifModule from "zenpix-wasm/simd";
import wasmUrl from "zenpix-wasm/dist/avif.simd.wasm?url";

const Module = await createAvifModule({
  locateFile: (file: string) => file.endsWith(".wasm") ? wasmUrl : file,
});
```

raw factoryでは`_malloc`、`_avif_encode`、`_avif_get_out_size`、`_avif_free_output`、`_free`を呼び出す必要があります。通常はbaseline版の高水準wrapperを推奨します。

高水準wrapperからSIMD版を選ぶ場合：

```typescript
import { createAvifEncoder } from "zenpix-wasm/encoder";
import wasmUrl from "zenpix-wasm/dist/avif.simd.wasm?url";

const encoder = await createAvifEncoder({ variant: "simd", wasmUrl });
```

## 1.0.0とのroot import互換

package rootは公開済み1.0.0と同じbaseline版のraw Emscripten factoryです。1.1.1でも次のimportは変更しません。

```typescript
import createAvifModule from "zenpix-wasm";
```

同じraw factoryは`zenpix-wasm/raw`からも明示的にimportできます。`createAvifEncoder`はrootではなく`zenpix-wasm/encoder`からimportしてください。このpackageはESM・browser向けであり、Node.jsでのbrowser API動作は保証しません。Node.js smoke testはWASM成果物自体の検証です。

## Worker

大きい画像や低い`speed`設定はUIをブロックする可能性があるため、必要に応じてWeb Worker内で実行してください。

## ソースからビルド

前提条件：

- Emscripten SDKが有効で`emcc`がPATHにあること
- CMake 3.20以上
- Ninja
- submodule `vendor/libaom`と`vendor/libavif`が取得済みであること

```bash
git submodule update --init --recursive
source ~/emsdk/emsdk_env.sh

bash scripts/build-wasm.sh
bash scripts/build-wasm.sh --simd
```

成果物は`wasm/dist/`へ生成されます。通常buildはbrowser用とNode.js smoke test用を生成します。

## テスト

build後にNode.js smoke testを実行します。

```bash
node wasm/test.node.mjs
```

現在のGitHub Actions `Build & Test`はネイティブ版とTypeScript wrapperを対象とし、WASM build / test jobはありません。WASMのbuild、test、npm publishは現状手動です。存在しないworkflowやartifact取得scriptを前提にしないでください。

## リリース時の確認

```bash
npm pack ./wasm --dry-run
```

tarballに次が含まれることを確認します。

- `dist/avif.js`, `dist/avif.wasm`
- `dist/avif.simd.js`, `dist/avif.simd.wasm`
- `js/index.js`, `js/index.d.ts`, `js/index.ts`
- `README.md`, `CHANGELOG.md`
- `LICENSE`, `THIRD_PARTY_LICENSES`

`npm publish`は自動化されていません。

## ライセンス

zenpix-wasmはMIT Licenseです。既存のライセンス本文は`LICENSE`、同梱するlibavif / libaomなどのnoticeは`THIRD_PARTY_LICENSES`を参照してください。
