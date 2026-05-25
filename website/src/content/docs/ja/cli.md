---
title: CLI ガイド
description: zenpix CLI のオプション一覧と使用例。npx zenpix でインストール不要で使えます。
---

`npx zenpix` でインストール不要で使えます。グローバルインストールも可能です。

```bash
npm install -g zenpix
```

---

## 基本的な使い方

```bash
# JPEG → AVIF（デフォルト、quality=60）
npx zenpix photo.jpg

# フォーマット・品質指定
npx zenpix photo.jpg output.webp -q 92

# リサイズ（長辺を 1920px 以内に収める）
npx zenpix photo.jpg --max-size 1920

# バッチ変換
npx zenpix *.jpg --out-dir ./avif/

# stdin / stdout（パイプラインへの組み込み）
cat photo.jpg | npx zenpix - output.avif
npx zenpix photo.jpg - | your-next-command

# マルチスレッド AVIF
npx zenpix photo.jpg output.avif --threads 8
```

---

## 背景除去・角丸（favicon・アイコン制作向け）

```bash
# 白背景を透過にして円形クロップ
npx zenpix icon.jpg favicon.png --remove-bg --round-corners full

# 角丸（40px）
npx zenpix icon.jpg icon-rounded.png --remove-bg --round-corners 40

# 透過 PNG の白リングも除去してから円形クロップ
npx zenpix icon.png favicon.png --flatten-bg --remove-bg --round-corners full
```

---

## オプション一覧

| オプション | 説明 | デフォルト |
|---|---|---|
| `-f, --format` | `avif` \| `webp` \| `png` | 出力拡張子、または `avif` |
| `-q, --quality` | 品質 0–100 | AVIF: 60、WebP: 92 |
| `-s, --speed` | AVIF エンコード速度 0–10（10 = 最速） | 6 |
| `--threads` | AVIF エンコードスレッド数 | 1 |
| `--max-size` | 長辺の最大 px（contain） | — |
| `--width` | 出力幅（px） | — |
| `--height` | 出力高さ（px） | — |
| `--fit` | `stretch` \| `contain` \| `cover` | `contain` |
| `--out-dir` | バッチ出力先ディレクトリ | — |
| `--flatten-bg` | RGBA を白背景に合成してから処理 | — |
| `--remove-bg [threshold]` | 白背景を透過化（閾値 0–255、省略時 30） | — |
| `--round-corners <r\|full>` | 角丸（px 数）または円形クロップ（`full`） | — |

---

## Python から呼ぶ

```python
import subprocess
import glob

# 単一ファイル
subprocess.run(["npx", "zenpix", "input.jpg", "output.avif", "-q", "60"], check=True)

# バッチ
subprocess.run(["npx", "zenpix", *glob.glob("*.jpg"), "--out-dir", "./avif/"], check=True)
```

---

## Ruby から呼ぶ

```ruby
require 'open3'

# 単一ファイル
Open3.capture3('npx', 'zenpix', 'input.jpg', 'output.avif', '-q', '60')

# バッチ
jpgs = Dir.glob('*.jpg')
Open3.capture3('npx', 'zenpix', *jpgs, '--out-dir', './avif/')
```

Rails から呼ぶ場合も同様です。

```ruby
# ActiveStorage のアップロード後などに
def convert_to_avif(input_path, output_path)
  system('npx', 'zenpix', input_path, output_path, '-q', '60', exception: true)
end
```

---

## PHP から呼ぶ

```php
<?php

// 単一ファイル
exec('npx zenpix input.jpg output.avif -q 60');

// 引数をエスケープして安全に渡す
$input  = escapeshellarg('input.jpg');
$output = escapeshellarg('output.avif');
exec("npx zenpix {$input} {$output} -q 60");

// バッチ（glob でまとめて渡す）
$files = implode(' ', array_map('escapeshellarg', glob('*.jpg')));
exec("npx zenpix {$files} --out-dir " . escapeshellarg('./avif/'));
```

---

## シェルスクリプト（Bash）から使う

CI/CD パイプラインやバッチ処理での典型的な使い方です。

```bash
#!/bin/bash

# ディレクトリ内の JPEG を一括 AVIF 変換
mkdir -p ./avif
npx zenpix *.jpg --out-dir ./avif/ --threads 4

# find と組み合わせてサブディレクトリも対象にする
find ./images -name '*.jpg' | while read -r file; do
  out="${file%.jpg}.avif"
  npx zenpix "$file" "$out" -q 60
done

# GitHub Actions などの CI での例
- name: Convert images to AVIF
  run: npx zenpix public/images/*.jpg --out-dir public/images/ --threads 4
```

---

## stdin / stdout の活用

入力ファイルに `-` を指定すると stdin から読み込みます。出力ファイルに `-` を指定すると stdout に書き出します。

```bash
# 他コマンドの出力を受け取る
curl -s https://example.com/photo.jpg | npx zenpix - output.avif

# 他コマンドに渡す
npx zenpix photo.jpg - | upload-command
```
