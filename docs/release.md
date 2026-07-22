# リリース手順

この手順は、ネイティブ版`zenpix`、5つのplatform optional package、`zenpix-wasm`、公開サイトを分けて検証・公開するためのチェックリストです。

`npm publish`、website deploy、tag作成、GitHub Release作成は外部状態を変更します。**それぞれ明示的な許可を得るまで実行しません。** GitHubへのpushだけでは、既存のnpm tarballや公開済みwebsiteは更新されません。

以下では例としてネイティブ版を`1.0.2`、WASM版を`1.1.0`とします。次回以降は対象versionへ読み替え、固定された`v1.0.0`を使わないでください。

## 1. 公開差分とversionを確定する

- [ ] `README.md`が日本語主軸、`README.en.md`が英語版、`README.ja.md`が日本語READMEへの互換導線になっている
- [ ] root `package.json`と5つの`npm/zenpix-*/package.json`の`version`が同じ
- [ ] root `optionalDependencies`の5件が上記versionと同じ
- [ ] `wasm/package.json`はWASM固有のversionになっている
- [ ] `CHANGELOG.md`で`zenpix`と`zenpix-wasm`の変更内容を分けている
- [ ] `.claude_state.md`など公開対象外の内部ファイルやcommitを含めない

確認例：

```bash
node -e 'const fs=require("node:fs"); const root=require("./package.json"); for (const dir of fs.readdirSync("npm")) { const p=require(`./npm/${dir}/package.json`); console.log(p.name, p.version, root.optionalDependencies[p.name]); } console.log("zenpix", root.version); console.log("zenpix-wasm", require("./wasm/package.json").version)'
```

## 2. buildとテスト

ネイティブ依存を導入済みの環境で、CMake cacheを再生成し、既存成果物をcleanしてからbuildします。

```bash
cmake --fresh -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --clean-first --parallel
bun run test/lanczos_precision.ts
bun run test/ops_precision.ts
npm run build
npx tsc --noEmit
```

Linuxでは`.so`、Windowsでは`.dll`へ読み替えます。Node.js / Bun / Deno API、CLI変換も実画像で確認します。Denoの通常経路は`--allow-ffi --allow-read`だけ、`ZENPIX_LIB`上書き経路は`--allow-env=ZENPIX_LIB`も付けて確認します。

WASM成果物は次を確認します。

```bash
npm run build:wrapper --prefix wasm
node wasm/test.node.mjs
```

## 3. 全7 packageをpackする

rootの`npm pack`は`prepack`からTypeScriptのclean buildを実行します。`prepublishOnly`だけには依存しません。

```bash
npm pack --dry-run --json
npm pack ./npm/zenpix-darwin-arm64 --dry-run --json
npm pack ./npm/zenpix-darwin-x64 --dry-run --json
npm pack ./npm/zenpix-linux-arm64 --dry-run --json
npm pack ./npm/zenpix-linux-x64 --dry-run --json
npm pack ./npm/zenpix-win32-x64 --dry-run --json
npm pack ./wasm --dry-run --json
```

各JSONの`files`を確認し、全tarballに`LICENSE`と`THIRD_PARTY_LICENSES`があることを機械的に検査します。rootではbuild後の`js/dist/index.js`、`index.d.ts`、`index.deno.js`、`cli.js`が入ること、WASMでは次が入ることを確認します。

- `dist/avif.js`, `dist/avif.wasm`
- `dist/avif.simd.js`, `dist/avif.simd.wasm`
- `js/index.js`, `js/index.d.ts`, `js/index.ts`
- `README.md`, `CHANGELOG.md`, `LICENSE`, `THIRD_PARTY_LICENSES`

## 4. packed zenpix-wasmをブラウザで検証する

リポジトリ外の一時projectへローカルtarballをinstallし、次を確認します。

- [ ] Vite production buildが成功する
- [ ] browser native ESMでもpackageの実ファイルをimportできる
- [ ] `import createAvifModule from "zenpix-wasm"`がbaseline raw factoryを返す
- [ ] `import { createAvifEncoder } from "zenpix-wasm/encoder"`が成功する
- [ ] baseline / SIMDをwrapperから選択できる
- [ ] RGB / RGBAのencode結果が得られ、出力にAVIFの`ftyp` boxがある

一時projectの生成物はリポジトリへ追加しません。

## 5. websiteを検証する

```bash
bun install --cwd website
bun run --cwd website build
```

READMEとwebsiteの日英説明、WASM import path、対応範囲、性能に関する注意が一致していることを確認します。deployは明示許可後だけ実行します。

## 6. 公開前の外部確認

- [ ] 公開対象commitが意図した履歴だけを祖先に持つ
- [ ] GitHub Actions `Build & Test`が対象commitで成功している
- [ ] CI成果物の5バイナリを対応するoptional packageへ配置している
- [ ] 全7 tarballを最終versionで作り直し、内容とライセンスを再確認した
- [ ] `npm whoami`とpublish権限を確認した
- [ ] npm publish、website deploy、tag、GitHub Releaseについて明示許可を得た

## 7. publish順

明示許可後、依存されるpackageから公開します。

1. `zenpix-darwin-arm64`
2. `zenpix-darwin-x64`
3. `zenpix-linux-arm64`
4. `zenpix-linux-x64`
5. `zenpix-win32-x64`
6. `zenpix-wasm`
7. root `zenpix`

rootは5つのoptional packageの新versionがregistryに見えることを確認してからpublishします。WASMはrootの依存ではありませんが、公開物の確認順を一定にするためrootより先に置きます。

## 8. registryから再取得して検証する

publish後は作業treeのtarballを信用せず、registryから各versionを再取得します。

```bash
npm pack zenpix@1.0.2
npm pack zenpix-wasm@1.1.0
npm pack zenpix-darwin-arm64@1.0.2
```

残り4 optional packageも同様に取得し、全7件のファイル一覧、`LICENSE`、`THIRD_PARTY_LICENSES`、version、root `optionalDependencies`を再検査します。別の一時projectでroot install/API/CLIとWASM browser E2Eも再実行します。

## 9. website deploy、tag、GitHub Release

registry再取得の検証後、明示許可がある場合だけwebsiteをdeployします。公開URLで日英ページとWASM例を確認します。

tag名は対象versionから作り、固定値をコピーしません。ネイティブ版とWASM版でversionが異なるため、tag命名方針を決めてから作成します。GitHub Releaseも対応するtagとCHANGELOGの範囲を確認し、明示許可後だけ作成します。

## GitHub Actionsと外部処理の境界

現在の`.github/workflows/build.yml`は`main`と`feat/**`へのpush、`main`向けpull request、手動実行でbuild/testを起動します。npm publish、website deploy、tag、GitHub Releaseを自動実行するworkflowは含まれていません。
