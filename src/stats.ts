import type { Result } from "autocannon";

export type Summary = {
  attempted: number; // finished responses + requests that errored/timed out
  responses: number; // requests that got any HTTP response back
  failed: number;
  errorRate: number; // percent of attempted
  timeouts: number;
  connectionErrors: number; // refused, reset, etc. (excludes timeouts)
  status: { "2xx": number; "3xx": number; "4xx": number; "5xx": number };
  rps: number;
  bytesPerSec: number;
  latency: { p50: number; p90: number; p99: number; max: number; avg: number };
  durationSec: number;
};

export type Verdict = { passed: boolean; reasons: string[] };

export function summarize(r: Result): Summary {
  // autocannon's `errors` already includes timeouts; requests.total is completed responses only
  const responses = r.requests.total;
  const attempted = responses + r.errors;
  const failed = r.errors + r["4xx"] + r["5xx"];
  return {
    attempted,
    responses,
    failed,
    errorRate: attempted === 0 ? 100 : (failed / attempted) * 100,
    timeouts: r.timeouts,
    connectionErrors: r.errors - r.timeouts,
    status: { "2xx": r["2xx"], "3xx": r["3xx"], "4xx": r["4xx"], "5xx": r["5xx"] },
    rps: r.requests.average,
    bytesPerSec: r.throughput.average,
    latency: {
      p50: r.latency.p50,
      p90: r.latency.p90,
      p99: r.latency.p99,
      max: r.latency.max,
      avg: r.latency.average,
    },
    durationSec: r.duration,
  };
}

// Graded on p99 (the slow tail users actually feel), not the average.
const LATENCY_STEPS: [number, string][] = [
  [100, "A+"], [250, "A"], [500, "B"], [1000, "C"], [2000, "D"],
];
const ERROR_STEPS: [number, string][] = [
  [0, "A+"], [0.1, "A"], [0.5, "B"], [1, "C"], [5, "D"],
];
const ORDER = ["A+", "A", "B", "C", "D", "F"];

function step(value: number, steps: [number, string][]): string {
  return steps.find(([limit]) => value <= limit)?.[1] ?? "F";
}

export function grade(s: Summary): string {
  if (s.attempted === 0) return "F";
  const byLatency = ORDER.indexOf(step(s.latency.p99, LATENCY_STEPS));
  const byErrors = ORDER.indexOf(step(s.errorRate, ERROR_STEPS));
  return ORDER[Math.max(byLatency, byErrors)];
}

export function verdict(s: Summary, limits: { maxErrorRate: number; maxP99: number }): Verdict {
  const reasons = [
    ...(s.responses === 0 ? ["no HTTP responses received - is the server running?"] : []),
    ...(s.errorRate > limits.maxErrorRate
      ? [`error rate ${s.errorRate.toFixed(2)}% > ${limits.maxErrorRate}%`]
      : []),
    ...(s.latency.p99 > limits.maxP99 ? [`p99 latency ${s.latency.p99}ms > ${limits.maxP99}ms`] : []),
  ];
  return { passed: reasons.length === 0, reasons };
}
