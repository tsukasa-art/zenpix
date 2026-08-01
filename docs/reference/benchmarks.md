# ベンチマーク

zenpixとSharpの処理時間は、CPU、スレッド数、画像の特徴、解像度、コーデック実装によって変わります。**zenpixが一般にSharpより速い、または常に高画質であるとは主張しません。**

このページの数値は2026-05-25に実施した過去の測定記録です。測定に使用した画像には再配布できないものが含まれ、`test/fixtures/`と`bench/results/`はGit管理対象外です。そのため、表の数値は第三者がclone直後に再現できる一般性能の根拠ではなく、条件依存の参考値として扱ってください。

## 開発動機と当時のSharp経路

zenpixを作る前のサイトでは、2 vCPU・2 GB RAMのVPS上でSharpによるAVIF変換が実用時間内に完了しませんでした。これは当時の運用上の事実ですが、「Sharpが常に全コアを使い切る」「Sharpでは低スペック環境の変換が完了しない」という一般的な性質には広げません。

当時のアップロード実装（サイト側commit `6c182e5`から`46ddb63`の直前まで）は、入力を事前縮小せず、同じHTTPリクエスト内でフル解像度WebP q85、フル解像度AVIF q70、最大4096pxの原形式画像を順に生成し、R2へのupload完了まで待つ構成でした。圧縮後ファイルサイズには20 MB上限がありましたが、画素数上限とencodeの同時実行制限はなく、nginxの`proxy_read_timeout`は60秒でした。

2026-07-31に4093×2894の同一fixtureでこの3出力を再現すると、M4 Pro上の2 vCPU・2 GB Linux arm64コンテナでNode.js / Bunとも約7.6秒、peak memoryは約0.5〜0.6 GiBでした。別途段階別に測ると約6.8〜6.9秒はフル解像度AVIFだけが占めました。この再現にはR2通信、PostgreSQL、SSRアプリ、nginxとの資源競合を含みません。したがって、実VPSでの未完了は、フル解像度AVIFを含むrequest設計がCPU性能・共有memory・60秒の応答時間予算に合わなかった可能性が高い一方、当時のsystem logがないためtimeoutとOOMのどちらが直接原因だったかは確定していません。

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

zenpixのAVIF encode実装はlibavifへYUV 4:4:4を指定し、alpha qualityをlosslessに設定します。SharpのAVIF既定も4:4:4ですが、encoder、codec version、quality scale、出力サイズは同一ではありません。そのため、同じ`quality=60`を同一画質・同一条件とはみなしません。

比較画像生成スクリプト[`bench/quality-compare.ts`](../../bench/quality-compare.ts)は、共通のリサイズ済みPNGを基準に、各qualityの出力サイズ、RGB PSNR、RGB MAEを記録し、ファイルサイズ差が5%以内の組を抽出します。PSNRだけで知覚品質を代表できないため、目視結果と併用してください。

2026-07-31に明色風景fixtureを960px幅へリサイズして比較したところ、同じ`quality=60`ではzenpixの方がRGB PSNRは0.624 dB高い一方、ファイルサイズも37.8%大きくなりました。ほぼ同じサイズの組では、Sharp q57対zenpix q45でSharpが0.511 dB、Sharp q72対zenpix q60でSharpが0.499 dB高い結果でした。したがって、このfixtureの同一quality比較でzenpixが細部を多く残したことは、一般的な圧縮効率の優位性を意味しません。

## 未公開source branchのscalar対SIMD CI測定

GitHub Actions run `30674226376`で、同じsourceからSIMD版と強制scalar版をCMake Releaseのportable baselineでbuildしました。`bench/resize-simd.ts`が生成する決定的なgradient/checker RGBA PNG（1920×1080）を使い、各trialはwarm-up 3回、scalar / SIMDを交互に15組、中央値を使用し、全体を3回実行しました。

| architecture / backend | 対象 | threads | 3回のmedian speedup範囲 |
|---|---|---:|---:|
| macOS arm64 / NEON | raw RGBA resize 1920×1080 → 960×540 | 1 | 1.117〜1.146× |
| macOS arm64 / NEON | raw RGBA resize 1920×1080 → 960×540 | 3 | 1.082〜1.098× |
| macOS arm64 / NEON | RGBA PNG decode → resize → AVIF（q60 / speed10） | 1 | 1.113〜1.120× |
| macOS arm64 / NEON | RGBA PNG decode → resize → AVIF（q60 / speed10） | 3 | 1.074〜1.082× |
| macOS arm64 / scalar fallback | raw RGB resize | 3 | 0.996〜1.002× |
| macOS x64 / SSE2 | raw RGBA resize 1920×1080 → 960×540 | 1 | 1.133〜1.148× |
| macOS x64 / SSE2 | raw RGBA resize 1920×1080 → 960×540 | 4 | 1.095〜1.131× |
| macOS x64 / SSE2 | RGBA PNG decode → resize → AVIF（q60 / speed10） | 1 | 1.091〜1.122× |
| macOS x64 / SSE2 | RGBA PNG decode → resize → AVIF（q60 / speed10） | 4 | 1.080〜1.104× |
| macOS x64 / scalar fallback | raw RGB resize | 4 | 0.964〜0.998× |

RGBAではNEON / SSE2の両方で3 trialすべて改善し、RGBはSIMD対象外で改善しませんでした。同runではmacOS arm64 / x64、Linux arm64 / x64、Windows x64の正確性・FFI・AVIF testも通過しています。ただし性能値はこのfixtureとrunnerに限り、zenpix全体が常に高速化するという主張には使用しません。

## 2 vCPU・2 GB制限下の補助測定

2026-07-31にApple M4 Pro上のOrbStack Linux arm64コンテナへ2 vCPU、2 GB RAM、swapなしの上限を設定し、Node.js 20.19.2でPNG decode → cover 1920×1080 → AVIF encodeを測定しました。各試行はwarm-up 1回、計測5回の中央値とし、試行全体を3回実行しました。Sharp 0.34.5はこの環境で既定concurrencyが1でした。

出力サイズを近づけた組の3試行中央値は次のとおりです。peak memoryはコンテナcgroup全体の値です。

| 対象 | 出力サイズ | 処理時間 | peak memory | 平均CPU使用量 |
|---|---:|---:|---:|---:|
| Sharp q60 | 16,446 bytes | 1,858 ms | 270 MiB | 1.02 cores |
| zenpix q52 / 1 thread | 16,414 bytes | 1,578 ms | 584 MiB | 1.02 cores |
| Sharp q67 | 20,027 bytes | 1,985 ms | 231 MiB | 1.02 cores |
| zenpix q60 / 1 thread | 20,297 bytes | 1,649 ms | 587 MiB | 1.02 cores |

この条件ではzenpixの処理時間が約15〜17%短い一方、peak memoryは約2.2〜2.5倍でした。両方とも2 GB内で完走し、Sharpが2コアを使い切る挙動や顕著なスケジューリング遅延は再現しませんでした。これは実VPSではなく仮想化コンテナ上の単一fixture・逐次処理であり、過去のVPSで処理が完了しなかった原因を特定する証拠ではありません。「Sharpより低メモリ」「Sharpが常に全コアを占有する」という主張には使用しません。

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
bench/run-low-resource.sh

# 2026年3月のサイト側Sharp 3出力経路を再現（R2通信は含まない）
BENCH_ENGINES=sharp-historical BENCH_WARMUP_N=0 BENCH_MEASURE_N=1 bench/run-low-resource.sh
```

結果はGit管理対象外の`bench/results/`へ出力されます。数値を公開する場合は、OS、CPU、メモリ、zenpix / Sharp / codecのバージョン、スレッド数、fixtureの配布可否を併記してください。
