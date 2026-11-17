HTTP load-testing CLI built on [autocannon](https://github.com/mcollina/autocannon).



## Usage

```bash
npm start -- <url> -c <connections> -d <seconds>
```

- `-c` = number of connections (simultaneous users). Default 10.
- `-d` = how many seconds to run. Default 10.

Example: 100 connections for 30 seconds

```bash
npm start -- http://localhost:3000 -c 100 -d 30
```

Stress test: find the breaking point by ramping up 10 → 50 → 200 → 500 connections, 15 seconds each. It stops at the first stage that fails.

```bash
npm start -- http://localhost:3000 -c 10,50,200,500 -d 15
```

Run `npm start -- --help` for all options.

## How results are judged

- **Error rate** = (timeouts + connection errors + 4xx + 5xx) / all attempted requests.
- **Grade** (A+ to F) is the worse of the p99 latency grade and the error-rate grade. It uses p99, not the average, so a slow tail can't hide.
- **Pass/fail** uses `--max-error-rate` (default 1%) and `--max-p99` (default 1000ms).
- **Exit codes:** `0` = all stages passed, `1` = a stage failed, `2` = bad input.

