#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(CDPATH= cd -- "$(dirname "$0")/.." >/dev/null && pwd)"
image="${BENCH_DOCKER_IMAGE:-zenpix-low-resource-bench:local}"
trials="${BENCH_TRIALS:-3}"
engines="${BENCH_ENGINES:-sharp-default sharp-tuned zenpix-1 zenpix-2}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
result_dir="$repo_dir/bench/results/resource/$stamp"

mkdir -p "$result_dir"

if [[ "${BENCH_SKIP_BUILD:-0}" != "1" ]]; then
  docker build --file "$repo_dir/bench/Dockerfile.low-resource" --tag "$image" "$repo_dir"
fi

for engine in $engines; do
  for ((trial = 1; trial <= trials; trial++)); do
    output="$result_dir/${engine}-trial${trial}.json"
    docker run --rm \
      --cpus=2 \
      --memory=2g \
      --memory-swap=2g \
      --pids-limit=512 \
      --volume "$repo_dir/test/fixtures:/fixtures:ro" \
      --env "BENCH_ENGINE=$engine" \
      --env "BENCH_WARMUP_N=${BENCH_WARMUP_N:-1}" \
      --env "BENCH_MEASURE_N=${BENCH_MEASURE_N:-5}" \
      --env "BENCH_RUNTIME=${BENCH_RUNTIME:-bun}" \
      --env "SHARP_AVIF_QUALITY=${SHARP_AVIF_QUALITY:-60}" \
      --env "ZENPIX_AVIF_QUALITY=${ZENPIX_AVIF_QUALITY:-60}" \
      "$image" > "$output"
    jq -c '{engine, medianMs, p95Ms, process, cgroup, schedulingProbe, limits}' "$output"
  done
done

jq -s '.' "$result_dir"/*.json > "$result_dir/all.json"
printf 'results=%s\n' "$result_dir"
