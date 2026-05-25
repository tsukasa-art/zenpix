# リリース手順（`main` へ push 済み → npm 公開まで）

**このファイルを上から順に実行すれば、`zenpix` を npm に出せる**ように書いてある。  
機密（npm トークン、`.npmrc`）はコミットしない。

## 用語

| 名前 | 意味 |
|------|------|
| **build** | GitHub Actions「Build & Test」（`build.yml`）。成果物: `libpict-darwin-arm64` / `libpict-darwin-x64` / `libpict-linux-x64` / `libpict-linux-arm64` / `libpict-win32-x64` |
| **RUN_ID** | GitHub Actions の run の **database id**（URL `.../actions/runs/12345` の `12345`）|

## 事前チェック（ここを飛ばさない）

- [ ] 変更は **`main` にマージ済み**で、意図したコミットが先頭
- [ ] **Build & Test** が **`main` で緑**（失敗 run の artifact は使わない）
- [ ] ルート `package.json` の `version` と `optionalDependencies`、および `npm/zenpix-*/package.json` の `version` が **すべて同じ番号**
- [ ] ルート **`CHANGELOG.md`** にそのバージョンの見出しと箇条書きがある
- [ ] 手元: **`gh` が GitHub にログイン済み**（`gh auth status`）、**`npm whoami`** が通る
- [ ] 作業ディレクトリは **リポジトリルート**

---

## Phase 0 — コミットと `main` への push

npm publish より先に、バージョン・CHANGELOG・README・各 `npm/zenpix-*/package.json` を **コミットして `origin/main` に push** する。

1. `git status` で **不要なファイルが混ざっていない**ことを確認。
2. リリースに含めるファイルを add:

   ```bash
   git add package.json CHANGELOG.md README.md README.ja.md \
     npm/zenpix-darwin-arm64/package.json \
     npm/zenpix-darwin-x64/package.json \
     npm/zenpix-linux-x64/package.json \
     npm/zenpix-linux-arm64/package.json \
     npm/zenpix-win32-x64/package.json
   ```

3. コミット・push:

   ```bash
   git commit -m "chore(release): zenpix X.Y.Z"
   git push origin main
   ```

4. **Build & Test** が **`main` で緑**になるまで待つ。

---

## Phase 1 — ネイティブ `zenpix`（optional → メタパッケージ）

**順序**: optional パッケージ（5つ）を先に publish → ルート `zenpix` を publish。

### 1.1 `libpict` を CI 成果物で `npm/zenpix-*/` に置く

```bash
gh run list --workflow=build.yml --branch main --limit 5
```

先頭の**緑**の run の `ID` 列をコピーする。

```bash
export RUN_ID=実際の数字

rm -rf /tmp/libpict-darwin-arm64 /tmp/libpict-darwin-x64 \
       /tmp/libpict-linux-x64 /tmp/libpict-linux-arm64 /tmp/libpict-win32-x64

gh run download "$RUN_ID" -n libpict-darwin-arm64 -D /tmp/libpict-darwin-arm64
gh run download "$RUN_ID" -n libpict-darwin-x64   -D /tmp/libpict-darwin-x64
gh run download "$RUN_ID" -n libpict-linux-x64    -D /tmp/libpict-linux-x64
gh run download "$RUN_ID" -n libpict-linux-arm64  -D /tmp/libpict-linux-arm64
gh run download "$RUN_ID" -n libpict-win32-x64    -D /tmp/libpict-win32-x64
```

確認:

```bash
ls -la /tmp/libpict-darwin-arm64/libpict.dylib
ls -la /tmp/libpict-darwin-x64/libpict.dylib
ls -la /tmp/libpict-linux-x64/libpict.so
ls -la /tmp/libpict-linux-arm64/libpict.so
ls -la /tmp/libpict-win32-x64/libpict.dll
```

`npm/` へコピー:

```bash
cp /tmp/libpict-darwin-arm64/libpict.dylib npm/zenpix-darwin-arm64/
cp /tmp/libpict-darwin-x64/libpict.dylib   npm/zenpix-darwin-x64/
cp /tmp/libpict-linux-x64/libpict.so       npm/zenpix-linux-x64/
cp /tmp/libpict-linux-arm64/libpict.so     npm/zenpix-linux-arm64/
cp /tmp/libpict-win32-x64/libpict.dll      npm/zenpix-win32-x64/

cp LICENSE THIRD_PARTY_LICENSES npm/zenpix-darwin-arm64/
cp LICENSE THIRD_PARTY_LICENSES npm/zenpix-darwin-x64/
cp LICENSE THIRD_PARTY_LICENSES npm/zenpix-linux-x64/
cp LICENSE THIRD_PARTY_LICENSES npm/zenpix-linux-arm64/
cp LICENSE THIRD_PARTY_LICENSES npm/zenpix-win32-x64/
```

### 1.2 optional パッケージを publish

```bash
npm publish npm/zenpix-darwin-arm64 --access public
npm publish npm/zenpix-darwin-x64   --access public
npm publish npm/zenpix-linux-x64    --access public
npm publish npm/zenpix-linux-arm64  --access public
npm publish npm/zenpix-win32-x64    --access public
```

**確認**（各パッケージが見えること）:

```bash
npm info zenpix-darwin-arm64 version
npm info zenpix-linux-x64    version
```

### 1.3 JS dist をビルドしてルートを publish

```bash
bun run build
npm publish --access public
```

**確認**:

```bash
npm info zenpix version
```

---

## Phase 2 — git タグを打つ

```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## Phase 3 — GitHub Release を作る（任意）

```bash
gh release create v1.0.0 \
  --title "zenpix v1.0.0" \
  --notes-file CHANGELOG.md
```

---

## バージョン番号を上げるとき

1. ルート `package.json` の `version` を更新
2. `optionalDependencies` 内の各 optional パッケージのバージョンも同じ番号に更新
3. `npm/zenpix-*/package.json` の `version` を同じ番号に更新
4. `CHANGELOG.md` に新バージョンのセクションを追加
5. Phase 0〜3 を実行

```bash
# 一括確認
grep '"version"' package.json npm/*/package.json
```

---

## トラブルシューティング

### `npm publish` で 403

- `.npmrc` に `//registry.npmjs.org/:_authToken=...` が設定されているか確認
- `npm whoami` でログイン状態を確認

### CI artifact が見つからない

- `gh run list --workflow=build.yml` で緑の run があることを確認
- `gh run download` の `-n` オプションは artifact 名（`libpict-darwin-arm64` など）と一致させる

### optional パッケージが install されない

```bash
npm install zenpix --include=optional
```
