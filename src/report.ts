import { styleText } from "node:util";
import type { Config } from "./config.ts";
import type { Summary, Verdict } from "./stats.ts";

export type StageResult = { connections: number; summary: Summary; grade: string; verdict: Verdict };

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const bytes = (n: number) =>
  n >= 1048576 ? `${fmt(n / 1048576)} MB` : n >= 1024 ? `${fmt(n / 1024)} KB` : `${fmt(n)} B`;

function table(rows: string[][]): string {
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  const line = (r: string[]) => "  " + r.map((cell, i) => cell.padEnd(widths[i])).join("   ");
  return [styleText("bold", line(rows[0])), ...rows.slice(1).map(line)].join("\n");
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"];

export function printHeader(c: Config): void {
  console.log(styleText(["cyan", "bold"], "\nloadprobe"));
  console.log(`  ${c.method} ${c.url}`);
  console.log(
    `  stages: ${c.stages.join(" -> ")} connections, ${c.duration}s each` +
      (c.rate > 0 ? `, capped at ${c.rate} req/s` : ""),
  );
  console.log(`  pass if: error rate <= ${c.maxErrorRate}% and p99 <= ${c.maxP99}ms`);
  if (!LOCAL_HOSTS.includes(new URL(c.url).hostname)) {
    console.log(styleText("yellow", "  ! Remote target: only test servers you own or are allowed to test."));
  }
}

export function printStageStart(index: number, total: number, connections: number, duration: number): void {
  console.log(styleText("gray", `\nStage ${index + 1}/${total}: ${connections} connections for ${duration}s...`));
}

export function printStage({ summary: s, grade, verdict }: StageResult): void {
  console.log(
    table([
      ["Requests", "Req/sec", "Data/sec", "Error rate", "p50", "p90", "p99", "max"],
      [
        fmt(s.attempted), fmt(s.rps), bytes(s.bytesPerSec), `${s.errorRate.toFixed(2)}%`,
        `${s.latency.p50}ms`, `${s.latency.p90}ms`, `${s.latency.p99}ms`, `${s.latency.max}ms`,
      ],
    ]),
  );
  console.log(
    styleText("gray",
      `  2xx ${s.status["2xx"]} | 3xx ${s.status["3xx"]} | 4xx ${s.status["4xx"]} | 5xx ${s.status["5xx"]}` +
        ` | timeouts ${s.timeouts} | connection errors ${s.connectionErrors}`),
  );
  const color = verdict.passed ? "green" : "red";
  console.log(
    styleText([color, "bold"], `  Grade ${grade} - ${verdict.passed ? "PASS" : "FAIL"}`) +
      (verdict.passed ? "" : styleText(color, `: ${verdict.reasons.join("; ")}`)),
  );
}

export function printFinal(results: StageResult[], totalStages: number): void {
  const failedAt = results.find((r) => !r.verdict.passed);
  console.log("");
  if (!failedAt) {
    console.log(styleText(["green", "bold"], `All ${totalStages} stage(s) passed.`));
  } else if (results.length === 1) {
    console.log(styleText(["red", "bold"], "Test failed."));
  } else {
    const lastGood = results.at(-2)!;
    console.log(
      styleText(["red", "bold"], `Breaking point: between ${lastGood.connections} and ${failedAt.connections} connections.`),
    );
  }
  if (results.length < totalStages) {
    console.log(styleText("gray", `Stopped early; skipped ${totalStages - results.length} remaining stage(s).`));
  }
}
