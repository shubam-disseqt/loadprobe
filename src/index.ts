import autocannon from "autocannon";
import { HELP, parseConfig, type Config } from "./config.ts";
import { printFinal, printHeader, printStage, printStageStart, type StageResult } from "./report.ts";
import { grade, summarize, verdict } from "./stats.ts";

function runStage(c: Config, connections: number): Promise<autocannon.Result> {
  return autocannon({
    url: c.url,
    method: c.method as autocannon.Request["method"],
    headers: c.headers,
    body: c.body,
    connections,
    duration: c.duration,
    timeout: c.timeout,
    pipelining: c.pipelining,
    ...(c.rate > 0 && { overallRate: c.rate }),
  });
}

async function main(): Promise<number> {
  let config: Config | "help";
  try {
    config = parseConfig(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${(err as Error).message}\nRun with --help for usage.`);
    return 2;
  }
  if (config === "help") {
    console.log(HELP);
    return 0;
  }
  const c = config;
  if (!c.json) printHeader(c);

  // Sequential on purpose: each stage must finish before the next adds load.
  const results: StageResult[] = [];
  for (const [i, connections] of c.stages.entries()) {
    if (!c.json) printStageStart(i, c.stages.length, connections, c.duration);
    const summary = summarize(await runStage(c, connections));
    const result = { connections, summary, grade: grade(summary), verdict: verdict(summary, c) };
    results.push(result);
    if (!c.json) printStage(result);
    if (!result.verdict.passed) break; // don't keep hammering a server that's already failing
  }

  const passed = results.length === c.stages.length && results.every((r) => r.verdict.passed);
  if (c.json) {
    console.log(JSON.stringify({ target: { method: c.method, url: c.url }, passed, stages: results }, null, 2));
  } else {
    printFinal(results, c.stages.length);
  }
  return passed ? 0 : 1;
}

main().then(
  (code) => { process.exitCode = code; },
  (err) => {
    console.error(`Load test crashed: ${(err as Error).message}`);
    process.exitCode = 2;
  },
);
