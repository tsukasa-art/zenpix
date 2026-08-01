/**
 * Spawn the benchmark worker and sample Linux proc/cgroup state from a separate
 * process. Timer drift is a scheduling-headroom indicator, not application
 * request latency.
 */

import { readFileSync } from "node:fs";

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

function procStatus(pid: number): { rssKiB: number; threads: number } | null {
  const status = readText(`/proc/${pid}/status`);
  if (!status) return null;
  const rss = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
  const threads = status.match(/^Threads:\s+(\d+)$/m);
  return {
    rssKiB: rss ? Number(rss[1]) : 0,
    threads: threads ? Number(threads[1]) : 0,
  };
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))]!;
}

function cpuStat(): Record<string, number> {
  const raw = readText("/sys/fs/cgroup/cpu.stat");
  if (!raw) return {};
  return Object.fromEntries(raw.split("\n").map((line) => {
    const [key, value] = line.split(/\s+/, 2);
    return [key!, Number(value)];
  }));
}

const intervalMs = 20;
let expected = performance.now() + intervalMs;
let peakRssKiB = 0;
let peakThreads = 0;
const schedulingDelayMs: number[] = [];
const cpuBefore = cpuStat();
const wallStarted = performance.now();

const runtime = process.env.BENCH_RUNTIME ?? "bun";
if (runtime !== "bun" && runtime !== "node") {
  throw new Error("BENCH_RUNTIME must be bun or node");
}

const child = Bun.spawn({
  cmd: runtime === "node"
    ? ["/usr/bin/node", "bench/resource-worker.node.js"]
    : ["bun", "run", "bench/resource-worker.ts"],
  env: process.env,
  stdout: "pipe",
  stderr: "pipe",
});

const timer = setInterval(() => {
  const now = performance.now();
  schedulingDelayMs.push(Math.max(0, now - expected));
  expected = now + intervalMs;
  const status = procStatus(child.pid);
  if (status) {
    peakRssKiB = Math.max(peakRssKiB, status.rssKiB);
    peakThreads = Math.max(peakThreads, status.threads);
  }
}, intervalMs);

const [exitCode, stdout, stderr] = await Promise.all([
  child.exited,
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
]);
clearInterval(timer);
const wallElapsedMs = performance.now() - wallStarted;
const cpuAfter = cpuStat();

if (exitCode !== 0) {
  process.stderr.write(stderr);
  process.exit(exitCode);
}

const worker = JSON.parse(stdout);
const memoryCurrent = Number(readText("/sys/fs/cgroup/memory.current"));
const memoryPeak = Number(readText("/sys/fs/cgroup/memory.peak"));
const cpuUsageUsec = (cpuAfter.usage_usec ?? 0) - (cpuBefore.usage_usec ?? 0);
const throttledUsec = (cpuAfter.throttled_usec ?? 0) - (cpuBefore.throttled_usec ?? 0);

process.stdout.write(`${JSON.stringify({
  ...worker,
  workerRuntime: runtime,
  limits: {
    cpuMax: readText("/sys/fs/cgroup/cpu.max"),
    memoryMaxBytes: Number(readText("/sys/fs/cgroup/memory.max")),
  },
  process: {
    peakRssKiB,
    peakThreads,
  },
  cgroup: {
    memoryCurrentBytes: Number.isFinite(memoryCurrent) ? memoryCurrent : null,
    memoryPeakBytes: Number.isFinite(memoryPeak) ? memoryPeak : null,
    wallElapsedMs,
    cpuUsageUsec,
    averageCpuCores: wallElapsedMs > 0 ? cpuUsageUsec / (wallElapsedMs * 1000) : null,
    throttledUsec,
    nrThrottled: (cpuAfter.nr_throttled ?? 0) - (cpuBefore.nr_throttled ?? 0),
  },
  schedulingProbe: {
    intervalMs,
    samples: schedulingDelayMs.length,
    p95DelayMs: percentile(schedulingDelayMs, 0.95),
    maxDelayMs: schedulingDelayMs.length > 0 ? Math.max(...schedulingDelayMs) : 0,
    meaning: "Delay observed by a separate lightweight process in the same 2-vCPU cgroup",
  },
}, null, 2)}\n`);
