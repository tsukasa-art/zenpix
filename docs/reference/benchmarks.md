# ベンチマーク

zenpixとSharpの処理時間は、CPU、スレッド数、画像の特徴、解像度、コーデック実装によって変わります。**zenpixが一般にSharpより速い、または常に高画質であるとは主張しません。**

このページの数値は2026-05-25に実施した過去の測定記録です。測定に使用した画像には再配布できないものが含まれ、`test/fixtures/`と`bench/results/`はGit管理対象外です。そのため、表の数値は第三者がclone直後に再現できる一般性能の根拠ではなく、条件依存の参考値として扱ってください。

## 測定方法

- パイプライン: PNG decode → resize → AVIF encode
- AVIF: `quality=60`, `speed=6`
- warm-up 2回、計測10回、wall-clock中央値
- ratio = Sharp中央値 ÷ zenpix中央値
- ratioが1を超える場合はその測定でzenpixが速く、1未満の場合はSharpが速い

ベンチマーク実装は[`bench/bench.ts`](../../bench/bench.ts)と[`bench/bench-threads.ts`](../../bench/bench-threads.ts)です。結果JSONには実行環境の完全なメタデータが含まれないため、異なる環境の数値を直接比較しないでください。

## 過去の測定結果

### Ubuntu VPS・2 vCPU・2 GB RAM

zenpix 1.0.0、シングルスレッド、2026-05-25測定。

| 画像カテゴリ | FHD ratio | WQHD ratio | 4K ratio |
|---|:---:|:---:|:---:|
| タイル系 | 0.19 | 0.18 | 0.25 |
| キャラクターイラストA | 1.43 | 1.35 | 1.29 |
| キャラクターイラストB | 1.46 | 1.35 | 1.29 |
| 暗色風景 | 1.14 | 1.27 | 1.01 |
| 厚塗り風景 | 1.62 | 1.45 | 1.63 |
| 明色風景 | 1.08 | 0.60 | 0.51 |

この測定では一部のキャラクター・厚塗り画像でzenpixが速く、タイル系と高解像度の明色画像ではSharpが速い結果でした。

### Apple M4 Pro・24 GB RAM

シングルスレッド、2026-05-25測定。

| 画像カテゴリ | FHD ratio | WQHD ratio | 4K ratio |
|---|:---:|:---:|:---:|
| タイル系 | 0.27 | 0.18 | 0.15 |
| キャラクターイラストA | 0.64 | 0.47 | 0.45 |
| キャラクターイラストB | 0.63 | 0.46 | 0.45 |
| 暗色風景 | 0.62 | 0.57 | 0.43 |
| 厚塗り風景 | 0.62 | 0.48 | 0.40 |
| 明色風景 | 0.59 | 0.52 | 0.39 |

この測定では全セルでSharpが速い結果でした。

### Apple M4 Pro・zenpix `threads=14`

| 画像カテゴリ | FHD ratio | WQHD ratio | 4K ratio |
|---|:---:|:---:|:---:|
| タイル系 | 0.34 | 0.22 | 0.19 |
| キャラクターイラストA | 1.13 | 0.86 | 0.81 |
| キャラクターイラストB | 1.13 | 0.86 | 0.81 |
| 暗色風景 | 0.83 | 0.87 | 0.64 |
| 厚塗り風景 | 1.12 | 0.85 | 0.91 |
| 明色風景 | 0.84 | 0.75 | 0.57 |

スレッド数を増やすと一部のFHD画像ではzenpixが上回りましたが、WQHD / 4Kの多くではSharpが速い結果でした。

## 画質設定について

zenpixのAVIF encode実装はlibavifへYUV 4:4:4を指定し、alpha qualityをlosslessに設定します。実際の出力はcodec実装・versionにも依存します。Sharpのデフォルト設定とはクロマ形式や出力サイズが異なるため、同じ`quality=60`を同一画質・同一条件とはみなしません。

比較画像生成スクリプト[`bench/quality-compare.ts`](../../bench/quality-compare.ts)は出力ファイルとサイズを確認するためのもので、SSIM / PSNRなどの客観評価は行いません。生成画像は設定差を目視する参考に限定してください。

## 手元で測定する

ベンチマーク画像はリポジトリに含まれていません。実行者が利用権を持つPNGを、次のファイル名で`test/fixtures/`へ配置してください。

```text
bench_input.png
bench_chara_chika.png
bench_chara_kanata.png
bench_landscape_dark.png
bench_landscape_impasto.png
bench_landscape_light.png
```

```bash
npm run build
npm run bench

BENCH_FIXTURES=bench_input npm run bench
AVIF_THREADS=4 npm run bench:threads
bun bench/quality-compare.ts
```

結果はGit管理対象外の`bench/results/`へ出力されます。数値を公開する場合は、OS、CPU、メモリ、zenpix / Sharp / codecのバージョン、スレッド数、fixtureの配布可否を併記してください。
