# loadprobe

HTTP load-testing CLI built on [autocannon](https://github.com/mcollina/autocannon).
It gives an honest pass/fail verdict, finds your breaking point with ramp-up stages, and returns exit codes your CI can use.

> Only test servers you own or have permission to test.

## Setup

Requires Node 22.18+ (runs TypeScript directly, no build step).

```bash
npm install
```

## Usage

```bash
# 10 connections for 10s
npm start -- http://localhost:3000

# Ramp up: 10 -> 50 -> 200 connections, 15s each; stops at the first failing stage
npm start -- http://localhost:3000/api -c 10,50,200 -d 15

# POST with auth header and JSON body (or -b @payload.json)
npm start -- http://localhost:3000/login -m POST \
  -H "Authorization: Bearer $TOKEN" -b '{"user":"demo"}'

# CI: custom thresholds, JSON output, non-zero exit on failure
npm start -- http://staging/api --max-error-rate 0.5 --max-p99 300 --json > result.json
```

Run `npm start -- --help` for all options.

## How results are judged

- **Error rate** = (timeouts + connection errors + 4xx + 5xx) / all attempted requests.
- **Grade** (A+ to F) is the worse of the p99 latency grade and the error-rate grade. It uses p99, not the average, so a slow tail can't hide.
- **Pass/fail** uses `--max-error-rate` (default 1%) and `--max-p99` (default 1000ms).
- **Exit codes:** `0` = all stages passed, `1` = a stage failed, `2` = bad input.

## Development

```bash
npm test          # unit tests (node:test)
npm run typecheck
```
