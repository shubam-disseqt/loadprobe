import assert from "node:assert/strict";
import { test } from "node:test";
import type { Result } from "autocannon";
import { grade, summarize, verdict } from "../src/stats.ts";

// Only the fields summarize() reads.
function fakeResult(over: Partial<Record<string, unknown>> = {}): Result {
  return {
    requests: { total: 1000, average: 100 },
    throughput: { average: 5000 },
    latency: { p50: 10, p90: 20, p99: 40, max: 60, average: 12 },
    errors: 0,
    timeouts: 0,
    "2xx": 1000, "3xx": 0, "4xx": 0, "5xx": 0,
    duration: 10,
    ...over,
  } as unknown as Result;
}

const limits = { maxErrorRate: 1, maxP99: 1000 };

test("healthy API gets A+ and passes", () => {
  const s = summarize(fakeResult());
  assert.equal(s.errorRate, 0);
  assert.equal(grade(s), "A+");
  assert.equal(verdict(s, limits).passed, true);
});

test("API returning 500 on every request fails with 100% error rate", () => {
  const s = summarize(fakeResult({ "2xx": 0, "5xx": 1000 }));
  assert.equal(s.errorRate, 100);
  assert.equal(grade(s), "F");
  assert.equal(verdict(s, limits).passed, false);
});

test("4xx responses count as failures", () => {
  const s = summarize(fakeResult({ "2xx": 900, "4xx": 100 }));
  assert.equal(s.failed, 100);
  assert.equal(s.errorRate, 10);
});

test("timeouts are not double counted and denominator includes failed attempts", () => {
  // old tool: (49 errors + 49 timeouts) / 1 response = 9800%
  const s = summarize(fakeResult({ requests: { total: 1, average: 0.1 }, "2xx": 1, errors: 49, timeouts: 49 }));
  assert.equal(s.attempted, 50);
  assert.equal(s.failed, 49);
  assert.equal(s.errorRate, 98);
  assert.equal(s.connectionErrors, 0);
});

test("no responses at all counts as total failure", () => {
  const s = summarize(fakeResult({ requests: { total: 0, average: 0 }, "2xx": 0 }));
  assert.equal(s.errorRate, 100);
  assert.equal(grade(s), "F");
  assert.match(verdict(s, limits).reasons.join(), /server running/);
});

test("server down (only connection errors) explains itself", () => {
  const s = summarize(fakeResult({ requests: { total: 0, average: 0 }, "2xx": 0, errors: 500 }));
  assert.equal(s.errorRate, 100);
  assert.match(verdict(s, limits).reasons.join(), /server running/);
});

test("grade uses p99, so a slow tail drags it down even with a fast average", () => {
  const s = summarize(fakeResult({ latency: { p50: 10, p90: 20, p99: 1500, max: 3000, average: 25 } }));
  assert.equal(grade(s), "D");
});

test("verdict reports p99 over the limit", () => {
  const s = summarize(fakeResult({ latency: { p50: 10, p90: 20, p99: 1500, max: 3000, average: 25 } }));
  const v = verdict(s, limits);
  assert.equal(v.passed, false);
  assert.match(v.reasons[0], /p99 latency 1500ms > 1000ms/);
});
