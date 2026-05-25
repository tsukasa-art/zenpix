---
title: CLI Guide
description: zenpix CLI options and usage. Run with npx zenpix — no install required.
---

Run without installing via `npx zenpix`. Global install is also available:

```bash
npm install -g zenpix
```

---

## Basic Usage

```bash
# JPEG → AVIF (default, quality=60)
npx zenpix photo.jpg

# Specify format and quality
npx zenpix photo.jpg output.webp -q 92

# Resize (long edge up to 1920px)
npx zenpix photo.jpg --max-size 1920

# Batch conversion
npx zenpix *.jpg --out-dir ./avif/

# stdin / stdout (pipeline integration)
cat photo.jpg | npx zenpix - output.avif
npx zenpix photo.jpg - | your-next-command

# Multi-threaded AVIF
npx zenpix photo.jpg output.avif --threads 8
```

---

## Background Removal & Rounded Corners (favicon / icon workflow)

```bash
# Remove white background and crop to circle
npx zenpix icon.jpg favicon.png --remove-bg --round-corners full

# Rounded corners (40px radius)
npx zenpix icon.jpg icon-rounded.png --remove-bg --round-corners 40

# Remove white ring from transparent PNG, then crop to circle
npx zenpix icon.png favicon.png --flatten-bg --remove-bg --round-corners full
```

---

## Options

| Option | Description | Default |
|---|---|---|
| `-f, --format` | `avif` \| `webp` \| `png` | output extension, or `avif` |
| `-q, --quality` | Quality 0–100 | AVIF: 60, WebP: 92 |
| `-s, --speed` | AVIF encode speed 0–10 (10 = fastest) | 6 |
| `--threads` | AVIF encode thread count | 1 |
| `--max-size` | Max long-edge px (contain) | — |
| `--width` | Output width (px) | — |
| `--height` | Output height (px) | — |
| `--fit` | `stretch` \| `contain` \| `cover` | `contain` |
| `--out-dir` | Batch output directory | — |
| `--flatten-bg` | Composite RGBA onto white background before processing | — |
| `--remove-bg [threshold]` | Remove white background (threshold 0–255, default 30) | — |
| `--round-corners <r\|full>` | Rounded corners (px) or full circle (`full`) | — |

---

## Calling from Python

```python
import subprocess
import glob

# Single file
subprocess.run(["npx", "zenpix", "input.jpg", "output.avif", "-q", "60"], check=True)

# Batch
subprocess.run(["npx", "zenpix", *glob.glob("*.jpg"), "--out-dir", "./avif/"], check=True)
```

---

## Calling from Ruby

```ruby
require 'open3'

# Single file
Open3.capture3('npx', 'zenpix', 'input.jpg', 'output.avif', '-q', '60')

# Batch
jpgs = Dir.glob('*.jpg')
Open3.capture3('npx', 'zenpix', *jpgs, '--out-dir', './avif/')
```

Works the same from Rails:

```ruby
# After ActiveStorage upload, for example
def convert_to_avif(input_path, output_path)
  system('npx', 'zenpix', input_path, output_path, '-q', '60', exception: true)
end
```

---

## Calling from PHP

```php
<?php

// Single file
exec('npx zenpix input.jpg output.avif -q 60');

// Pass arguments safely with escaping
$input  = escapeshellarg('input.jpg');
$output = escapeshellarg('output.avif');
exec("npx zenpix {$input} {$output} -q 60");

// Batch via glob
$files = implode(' ', array_map('escapeshellarg', glob('*.jpg')));
exec("npx zenpix {$files} --out-dir " . escapeshellarg('./avif/'));
```

---

## Shell Script (Bash)

Typical usage in CI/CD pipelines and batch processing:

```bash
#!/bin/bash

# Convert all JPEGs in a directory to AVIF
mkdir -p ./avif
npx zenpix *.jpg --out-dir ./avif/ --threads 4

# Include subdirectories with find
find ./images -name '*.jpg' | while read -r file; do
  out="${file%.jpg}.avif"
  npx zenpix "$file" "$out" -q 60
done

# GitHub Actions example
- name: Convert images to AVIF
  run: npx zenpix public/images/*.jpg --out-dir public/images/ --threads 4
```

---

## stdin / stdout

Pass `-` as the input file to read from stdin, or as the output file to write to stdout:

```bash
# Receive output from another command
curl -s https://example.com/photo.jpg | npx zenpix - output.avif

# Pipe to another command
npx zenpix photo.jpg - | upload-command
```
