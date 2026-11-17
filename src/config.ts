import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

export type Config = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  stages: number[]; // connections per stage; more than one = ramp-up
  duration: number;
  timeout: number;
  rate: number;
  pipelining: number;
  maxErrorRate: number;
  maxP99: number;
  json: boolean;
};

export const HELP = `
loadprobe - HTTP load testing CLI

Usage: npm start -- <url> [options]

  -m, --method <verb>        HTTP method (default GET)
  -H, --header "K: V"        Request header, repeatable
  -b, --body <text|@file>    Request body; @path reads a file
  -c, --connections <n,...>  Concurrent connections (default 10).
                             A list ramps up: -c 10,50,200 runs 3 stages
                             and stops at the first stage that fails
  -d, --duration <s>         Seconds per stage (default 10)
  -t, --timeout <s>          Request timeout in seconds (default 10)
  -r, --rate <n>             Max requests/sec overall, 0 = no limit (default 0)
  -p, --pipelining <n>       Pipelined requests per connection (default 1)
      --max-error-rate <%>   Fail when error rate exceeds this (default 1)
      --max-p99 <ms>         Fail when p99 latency exceeds this (default 1000)
      --json                 Print machine-readable JSON only
  -h, --help                 Show this help

Exit codes: 0 = all stages passed, 1 = a stage failed, 2 = bad input.
Errors = timeouts + connection errors + 4xx + 5xx responses.
Only test servers you own or have permission to test.
`;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function wholeNumber(flag: string, raw: string, min: number): number {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isInteger(n) || n < min) {
    throw new Error(`--${flag} must be a whole number >= ${min}, got "${raw}"`);
  }
  return n;
}

function positiveNumber(flag: string, raw: string): number {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n) || n < 0) {
    throw new Error(`--${flag} must be a number >= 0, got "${raw}"`);
  }
  return n;
}

function parseUrl(raw: string | undefined): string {
  if (!raw) throw new Error("Missing target URL. Example: npm start -- http://localhost:3000");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid URL "${raw}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`URL must start with http:// or https://, got "${raw}"`);
  }
  return url.href;
}

function parseHeaders(raw: string[]): Record<string, string> {
  return Object.fromEntries(
    raw.map((line) => {
      const i = line.indexOf(":");
      if (i <= 0) throw new Error(`Header must look like "Name: value", got "${line}"`);
      return [line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()];
    }),
  );
}

function parseBody(raw: string | undefined, read: (p: string) => string): string | undefined {
  if (raw === undefined || !raw.startsWith("@")) return raw;
  try {
    return read(raw.slice(1));
  } catch {
    throw new Error(`Cannot read body file "${raw.slice(1)}"`);
  }
}

export function parseConfig(
  argv: string[],
  read: (p: string) => string = (p) => readFileSync(p, "utf8"),
): Config | "help" {
  // strict mode rejects unknown flags, so typos like --conections fail loudly
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      url: { type: "string", short: "u" },
      method: { type: "string", short: "m", default: "GET" },
      header: { type: "string", short: "H", multiple: true, default: [] },
      body: { type: "string", short: "b" },
      connections: { type: "string", short: "c", default: "10" },
      duration: { type: "string", short: "d", default: "10" },
      timeout: { type: "string", short: "t", default: "10" },
      rate: { type: "string", short: "r", default: "0" },
      pipelining: { type: "string", short: "p", default: "1" },
      "max-error-rate": { type: "string", default: "1" },
      "max-p99": { type: "string", default: "1000" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) return "help";
  if (positionals.length > 1) throw new Error(`Unexpected arguments: ${positionals.slice(1).join(" ")}`);

  const method = values.method.toUpperCase();
  if (!METHODS.includes(method)) throw new Error(`--method must be one of ${METHODS.join(", ")}`);

  const body = parseBody(values.body, read);
  const headers = parseHeaders(values.header);
  const withContentType =
    body !== undefined && !headers["content-type"]
      ? { ...headers, "content-type": "application/json" }
      : headers;

  const maxErrorRate = positiveNumber("max-error-rate", values["max-error-rate"]);
  if (maxErrorRate > 100) throw new Error("--max-error-rate is a percentage, 0-100");

  return {
    url: parseUrl(values.url ?? positionals[0]),
    method,
    headers: withContentType,
    body,
    stages: values.connections.split(",").map((c) => wholeNumber("connections", c, 1)),
    duration: wholeNumber("duration", values.duration, 1),
    timeout: wholeNumber("timeout", values.timeout, 1),
    rate: wholeNumber("rate", values.rate, 0),
    pipelining: wholeNumber("pipelining", values.pipelining, 1),
    maxErrorRate,
    maxP99: positiveNumber("max-p99", values["max-p99"]),
    json: values.json,
  };
}
