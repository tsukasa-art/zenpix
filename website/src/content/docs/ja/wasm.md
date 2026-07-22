---
title: ブラウザ（WASM）
description: zenpix-wasm — WebAssembly にコンパイルしたブラウザ向け AVIF エンコーダ。
---

`zenpix-wasm` はブラウザ内でRGB / RGBA生ピクセルをAVIFへencodeします。サーバーへの送信は不要です。ネイティブ版のdecode、resize、CLIは含みません。libavif + libaomをEmscriptenでWebAssemblyにコンパイルしています。

- **npm**: https://www.npmjs.com/package/zenpix-wasm
- **GitHub**: https://github.com/tsukasa-art/zenpix

---

## 用途別パッケージの選択

| 用途 | パッケージ |
|---|---|
| Node.js / Bun / Deno サーバー | `zenpix`（ネイティブの全パイプライン） |
| ブラウザ / Cloudflare Pages 静的 JS | `zenpix-wasm` |
| Cloudflare Workers Free | 非対応（CPU 10ms 制限） |

---

## インストール

```bash
npm install zenpix-wasm
```

バージョン確認：

```bash
npm list zenpix-wasm
```

---

## クイックスタート

```typescript
import { createAvifEncoder } from "zenpix-wasm/encoder";

const enc = await createAvifEncoder();

// pixels: RGBA 生ピクセル（width × height × 4 の Uint8Array）
const avif = enc.encode(pixels, width, height, { quality: 60, speed: 10 });

if (avif) {
  const blob = new Blob([avif], { type: "image/avif" });
  const url  = URL.createObjectURL(blob);
}

enc.dispose(); // WASM ヒープを解放（省略可、GC が回収する）
```

---

## SIMD版とbaseline版

`zenpix-wasm/encoder`が高水準wrapperです。既定ではbaseline版を選び、`{ variant: "simd" }`でSIMD版を選択できます。`zenpix-wasm/simd`はEmscripten生成factoryのraw exportです。

2026-05-28にChrome / macOS arm64、`quality=60`、`speed=10`で測定した記録では、SIMD版は画像サイズによりbaseline版と同等から約21%短い処理時間でした。入力fixtureが再現可能な形で残っていないため、この数値は当時の条件に限る記録であり、一般性能の根拠にはしません。

raw SIMD factoryを使う場合は、WASM URLを明示して初期化します。

```typescript
import createAvifModule from "zenpix-wasm/simd";
import wasmUrl from "zenpix-wasm/dist/avif.simd.wasm?url";

const Module = await createAvifModule({
  locateFile: (file: string) => file.endsWith(".wasm") ? wasmUrl : file,
});
```

raw factoryでは`_malloc`、`_avif_encode`、`_avif_get_out_size`、`_avif_free_output`、`_free`を直接扱います。通常は高水準wrapperを使用してください。

1.0.0との互換性のため、package rootはbaseline版のraw factoryを維持します。

```typescript
import createAvifModule from "zenpix-wasm";
```

`zenpix-wasm/raw`は同じraw factoryへの明示的aliasです。このpackageは引き続きESM・browser向けです。Node.js smoke testは生成したWASM成果物を検証しますが、Node.jsでbrowser APIの動作を保証するものではありません。

---

## Vite / バンドラー

Vite では `.wasm` ファイルを URL として渡す必要があります：

```typescript
import wasmUrl from "zenpix-wasm/dist/avif.wasm?url";
import { createAvifEncoder } from "zenpix-wasm/encoder";

const enc = await createAvifEncoder({ variant: "baseline", wasmUrl });
```

## Worker での使用（大画像・低 speed 設定時）

処理時間は端末、画像、設定によって変わります。UIをブロックしないよう、必要に応じて`Worker`内で実行します。

```js
// avif-worker.js
import { createAvifEncoder } from "zenpix-wasm/encoder";

const enc = await createAvifEncoder();

self.onmessage = ({ data: { pixels, width, height, quality, speed } }) => {
  const avif = enc.encode(pixels, width, height, { quality, speed });
  self.postMessage({ avif }, avif ? [avif.buffer] : []);
};
```

```js
// main.js
const worker = new Worker("./avif-worker.js", { type: "module" });

worker.postMessage({ pixels, width, height, quality: 60, speed: 6 });
worker.onmessage = ({ data: { avif } }) => {
  if (avif) {
    const blob = new Blob([avif], { type: "image/avif" });
  }
};
```

---

## API

### `createAvifEncoder(options?)`

WASM モジュールをロードして `AvifEncoder` を返します。

```typescript
type CreateAvifEncoderOptions = {
  variant?: "baseline" | "simd";
  wasmUrl?: string;
};

async function createAvifEncoder(
  options?: string | CreateAvifEncoderOptions,
): Promise<AvifEncoder>
```

- `variant` — `"baseline"`（既定）または`"simd"`。
- `wasmUrl` — 選択した`.wasm`成果物のパス / URL。文字列引数はbaseline版`wasmUrl`の省略記法として維持します。

### `AvifEncoder`

| メンバー | 型 | 説明 |
|--------|------|------|
| `encode(pixels, width, height, opts?)` | `Uint8Array \| null` | 生ピクセルを AVIF にエンコード |
| `version` | `string` | libavif バージョン（例: `"1.4.1"`） |
| `dispose()` | `void` | WASM ヒープを解放 |

### `AvifEncodeOptions`

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|------|
| `quality` | `number` | `60` | 0–100（高いほど高品質・ファイルが大きい） |
| `speed` | `number` | `10` | 0–10（10 = 最速・低品質） |

---

## バンドルサイズ

| ファイル | raw | gzip |
|------|-----|------|
| `avif.wasm`（baseline） | 3.4 MB | **1.1 MB** |
| `avif.simd.wasm` | 3.4 MB | **1.1 MB** |
| `avif.js` | 60 KB | — |

---

## 過去の測定記録

2026-05-28のChrome（macOS arm64）、`speed=10`、ウォームアップ1回除外・3回中央値の記録です。入力fixtureが残っていないため再現可能なbenchmarkではなく、一般性能の根拠にはしません。

| サイズ | Baseline (ms) | SIMD (ms) | Speedup |
|--------|--------------|-----------|---------|
| 256×256    | 5.1 | 4.2 | 1.21× |
| 512×512    | 16.5 | 14.6 | 1.13× |
| 1024×1024  | 60.5 | 53.1 | 1.14× |

これらはすべて`speed=10`での値です。異なる端末、入力、quality / speed設定では結果が変わります。
