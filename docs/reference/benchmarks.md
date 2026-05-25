# ベンチマーク

---

## 比較の読み方

**ratio = Sharp 中央値 ÷ zenpix 中央値**（1 超なら zenpix が速い）

パイプライン: PNG decode → Sharp でリサイズ → AVIF encode (quality=60, speed=6)  
warm-up 2・計測 10、各セルは wall-clock 中央値の ratio

---

## VPS 実測（Ubuntu・vCPU 2・RAM 2 GB）

2026-05-25 計測、zenpix 1.0.0

| フィクスチャ | FHD（ratio） | WQHD（ratio） | 4K（ratio） |
|---|:---:|:---:|:---:|
| bench_input（タイル系） | 0.19 | 0.18 | 0.25 |
| bench_chara_chika（キャラ） | **1.43** | **1.35** | **1.29** |
| bench_chara_kanata（キャラ） | **1.46** | **1.35** | **1.29** |
| bench_landscape_dark（風景） | **1.14** | **1.27** | 1.01 |
| bench_landscape_impasto（厚塗り） | **1.62** | **1.45** | **1.63** |
| bench_landscape_light（ハイキー） | 1.08 | 0.60 | 0.51 |

**傾向**:
- キャラ・厚塗り風景では zenpix が一貫して優位（1.3〜1.6×）
- タイル系・単純構造の画像は libaom の内部パスが高速なため Sharp が優位
- ハイキー（明部が広い）画像は FHD のみ拮抗、解像度増加で Sharp が優位になる

---

## Mac 実測（14 インチ MacBook Pro・Apple M4 Pro・RAM 24 GB）

シングルスレッド・2026-05-25 計測

| フィクスチャ | FHD（ratio） | WQHD（ratio） | 4K（ratio） |
|---|:---:|:---:|:---:|
| bench_input | 0.27 | 0.18 | 0.15 |
| bench_chara_chika | 0.64 | 0.47 | 0.45 |
| bench_chara_kanata | 0.63 | 0.46 | 0.45 |
| bench_landscape_dark | 0.62 | 0.57 | 0.43 |
| bench_landscape_impasto | 0.62 | 0.48 | 0.40 |
| bench_landscape_light | 0.59 | 0.52 | 0.39 |

**傾向**: Mac では全セルで Sharp が速い。Sharp（libvips）が M4 Pro の多コアを活用しているため。**VPS 表が実運用上のメイン指標**。Mac 表はリグレッション検知用。

---

## Mac マルチスレッド（threads=14）

同条件・同フィクスチャ、`encodeAvif` に `threads=14`（`os.cpus().length`）を指定。2026-05-25 計測

| フィクスチャ | FHD（ratio） | WQHD（ratio） | 4K（ratio） |
|---|:---:|:---:|:---:|
| bench_input | 0.34 | 0.22 | 0.19 |
| bench_chara_chika | **1.13** | 0.86 | 0.81 |
| bench_chara_kanata | **1.13** | 0.86 | 0.81 |
| bench_landscape_dark | 0.83 | 0.87 | 0.64 |
| bench_landscape_impasto | **1.12** | 0.85 | 0.91 |
| bench_landscape_light | 0.84 | 0.75 | 0.57 |

**傾向**: シングルスレッドより全行で ratio が改善。キャラ系・厚塗り FHD は Sharp とほぼ互角〜微勝（1.12〜1.13×）。WQHD/4K は Sharp がリード。

## 画質について

同じ `quality=60` でも zenpix は Sharp より多くのビット数を使い視覚的なディテールを保持します。  
パステル・グラデーションの多いイラストで顕著で、シャープのエッジや繊細な色のニュアンスが残ります。

| | zenpix | Sharp |
|---|---|---|
| 複雑・イラスト画像 | ディテール保持（やや大きめ） | 積極的に間引く（小さめ） |
| シンプル・均一画像 | ほぼ同等 | ほぼ同等 |

---

## ユースケース別推奨

| ユースケース | 推奨 |
|---|---|
| VPS での大量変換（イラスト・キャラ系） | **zenpix**（1.3〜1.6× 速い） |
| 画質優先（繊細なグラデーション保持） | **zenpix** |
| シングルコア高性能マシンでの単発処理 | Sharp |
| 単純構造・均一色の画像 | Sharp |

---

## ベンチマークの再実行

```bash
npm run build

# フルベンチマーク
npm run bench

# フィクスチャを絞る
BENCH_FIXTURES=bench_chara_chika,bench_landscape_impasto npm run bench

# マルチスレッド計測
npm run bench:threads
AVIF_THREADS=4 npm run bench:threads

# 品質比較サンプル生成
bun bench/quality-compare.ts
```

成果物は `bench/results/` に出力されます。
