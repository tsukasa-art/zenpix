# リリース手順

この手順は、ネイティブ版`zenpix`、5つのplatform optional package、`zenpix-wasm`、公開サイトを分けて検証・公開するためのチェックリストです。

`npm publish`、website deploy、tag作成、GitHub Release作成は外部状態を変更します。**それぞれ明示的な許可を得るまで実行しません。** GitHubへのpushだけでは、既存のnpm tarballや公開済みwebsiteは更新されません。

以下では例としてネイティブ版を`1.0.4`、WASM版を`1.1.2`とします。次回以降は対象versionへ読み替え、固定されたversionを使わないでください。

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

配布候補の正典は`.github/workflows/build.yml`です。5つのnative jobは固定したvcpkg manifestから依存をbuildし、SIMD有効版と強制scalar版を別々に検証します。macOS jobは専用static tripletとdeployment target 12.0を使います。

次はmacOS arm64で同じ構成を再現する例です。ほかのOSではworkflowに記載したtripletと拡張子へ読み替えます。

```bash
vcpkg install --triplet arm64-osx-zenpix \
  --overlay-triplets=cmake/triplets \
  --x-install-root="$PWD/vcpkg_installed"
cmake --fresh -S . -B build -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0 \
  -DZENPIX_ENABLE_SIMD=ON \
  -DZENPIX_BUILD_TESTS=ON \
  -DCMAKE_TOOLCHAIN_FILE="$VCPKG_INSTALLATION_ROOT/scripts/buildsystems/vcpkg.cmake" \
  -DVCPKG_TARGET_TRIPLET=arm64-osx-zenpix \
  -DVCPKG_OVERLAY_TRIPLETS=cmake/triplets \
  -DVCPKG_INSTALLED_DIR="$PWD/vcpkg_installed"
cmake --build build --parallel
cmake --fresh -S . -B build-scalar -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0 \
  -DZENPIX_ENABLE_SIMD=OFF \
  -DZENPIX_BUILD_TESTS=ON \
  -DCMAKE_TOOLCHAIN_FILE="$VCPKG_INSTALLATION_ROOT/scripts/buildsystems/vcpkg.cmake" \
  -DVCPKG_TARGET_TRIPLET=arm64-osx-zenpix \
  -DVCPKG_OVERLAY_TRIPLETS=cmake/triplets \
  -DVCPKG_INSTALLED_DIR="$PWD/vcpkg_installed"
cmake --build build-scalar --parallel
ctest --test-dir build --output-on-failure
ctest --test-dir build-scalar --output-on-failure
ZENPIX_SIMD_LIB="$PWD/build/libpict.dylib" ZENPIX_SCALAR_LIB="$PWD/build-scalar/libpict.dylib" bun run test/resize_simd_precision.ts
bun run test/lanczos_precision.ts
bun run test/ops_precision.ts
npm run build
node scripts/verify-native-dependencies.mjs darwin build/libpict.dylib
```

Linuxでは`.so`、Windowsでは`.dll`へ読み替えます。依存検査はmacOSで外部codec dylibと`minos`、Linuxでcodecの`NEEDED`、Windowsでcodec DLL importをfail closedで検査します。

WASM成果物は次を確認します。

```bash
ZENPIX_COPY_WEBSITE=0 npm run build:all --prefix wasm
npm test --prefix wasm
node scripts/verify-wasm-dist.mjs
```

## 3. CIで全7 packageを作り直す

無視された`npm/zenpix-*`内の既存バイナリを配布候補として再利用しません。各native jobは直前にbuild・依存検査したバイナリを`pack-native-ci.mjs`へ渡し、package内へコピーしてからpackします。このスクリプトはbuild出力とpacked binaryのSHA256一致を確認し、Node.js / Bun / Deno APIとNode.js / Bun CLIを一時install先で実行します。

```bash
node scripts/pack-native-ci.mjs zenpix-darwin-arm64 build/libpict.dylib
npm pack . --pack-destination packed
npm pack ./wasm --pack-destination packed
```

上の2つの`npm pack`も、それぞれroot jobとclean WASM jobの内部で実行します。最後の`verify-release-candidate` jobは全7 jobのartifactをdownloadし、`verify-release-candidate.mjs`で次を機械検査して`SHA256SUMS`と7 tarballだけを再artifact化します。

- package名とversionが予定した7件に完全一致し、重複や余分なtarballがない
- root `optionalDependencies`が5 native packageと一致する
- 全tarballに`LICENSE`と`THIRD_PARTY_LICENSES`がある
- native tarballに対象の`libpict`、rootにJS/型/CLIとREADME参照画像・benchmark文書がある
- WASMにbaseline / SIMDのJS・WASMとwrapperがある

WASMでは具体的に次が必要です。

- `dist/avif.js`, `dist/avif.wasm`
- `dist/avif.simd.js`, `dist/avif.simd.wasm`
- `js/index.js`, `js/index.d.ts`, `js/index.ts`
- `README.md`, `CHANGELOG.md`, `LICENSE`, `THIRD_PARTY_LICENSES`

## 4. packed zenpix-wasmをブラウザで検証する

CIはpacked tarballを展開してローカルHTTP serverから配信し、Playwright Chromiumで次を確認します。

- [ ] baseline / SIMDをwrapperから選択できる
- [ ] RGBAのencode結果が得られ、出力にAVIFの`ftyp` boxがある

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
- [ ] 5環境でSIMD有効版と強制scalar版がbuildされ、RGBAの水平・垂直SIMD到達テストとFFI差分テストが成功している
- [ ] macOS arm64 / Linux arm64はNEON、macOS x64 / Linux x64 / Windows x64はSSE2の対象buildであることをworkflow logと成果物で確認している
- [ ] npm registry上の現行versionと次versionの実装差を確認し、次versionの配布確認前に公開説明へ未公開機能を「公開済み」と書いていない
- [ ] 各native jobが直前のbuild出力をpackし、packed binaryとのSHA256一致を確認している
- [ ] `zenpix-release-candidate` artifactに全7 tarballと`SHA256SUMS`があり、集約検査が成功している
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
npm pack zenpix@1.0.4
npm pack zenpix-wasm@1.1.2
npm pack zenpix-darwin-arm64@1.0.4
```

残り4 optional packageも同様に取得し、全7件のファイル一覧、`LICENSE`、`THIRD_PARTY_LICENSES`、version、root `optionalDependencies`を再検査します。別の一時projectでroot install/API/CLIとWASM browser E2Eも再実行します。

## 9. website deploy、tag、GitHub Release

registry再取得の検証後、明示許可がある場合だけwebsiteをdeployします。公開URLで日英ページとWASM例を確認します。

tag名は対象versionから作り、固定値をコピーしません。ネイティブ版とWASM版でversionが異なるため、tag命名方針を決めてから作成します。GitHub Releaseも対応するtagとCHANGELOGの範囲を確認し、明示許可後だけ作成します。

## GitHub Actionsと外部処理の境界

現在の`.github/workflows/build.yml`は`main`、`feat/**`、`codex/**`へのpush、`main`向けpull request、手動実行でbuild/testを起動します。npm publish、website deploy、tag、GitHub Releaseを自動実行するworkflowは含まれていません。
