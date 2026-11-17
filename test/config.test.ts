import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig, type Config } from "../src/config.ts";

const parse = (args: string[], read?: (p: string) => string) => parseConfig(args, read) as Config;

test("defaults with positional URL", () => {
  const c = parse(["http://localhost:3000"]);
  assert.equal(c.method, "GET");
  assert.deepEqual(c.stages, [10]);
  assert.equal(c.duration, 10);
  assert.equal(c.maxErrorRate, 1);
});

test("comma list of connections becomes ramp-up stages", () => {
  assert.deepEqual(parse(["http://x.test", "-c", "10,50,200"]).stages, [10, 50, 200]);
});

test("rejects non-numeric and zero values", () => {
  assert.throws(() => parse(["http://x.test", "-c", "abc"]), /connections must be a whole number/);
  assert.throws(() => parse(["http://x.test", "-c", "10,,50"]), /connections/);
  assert.throws(() => parse(["http://x.test", "-d", "0"]), /duration/);
  assert.throws(() => parse(["http://x.test", "-t", "1.5"]), /timeout/);
});

test("rejects unknown flags such as typos", () => {
  assert.throws(() => parse(["http://x.test", "--conections", "100"]), /Unknown option/);
});

test("rejects missing and invalid URLs", () => {
  assert.throws(() => parse([]), /Missing target URL/);
  assert.throws(() => parse(["not a url"]), /Invalid URL/);
  assert.throws(() => parse(["ftp://x.test"]), /http:\/\/ or https:\/\//);
});

test("parses method, repeatable headers and JSON body", () => {
  const c = parse([
    "http://x.test", "-m", "post", "-H", "Authorization: Bearer abc:def", "-H", "X-Id: 1", "-b", '{"a":1}',
  ]);
  assert.equal(c.method, "POST");
  assert.deepEqual(c.headers, {
    authorization: "Bearer abc:def", "x-id": "1", "content-type": "application/json",
  });
  assert.equal(c.body, '{"a":1}');
});

test("explicit content-type is kept", () => {
  const c = parse(["http://x.test", "-b", "a=1", "-H", "Content-Type: text/plain"]);
  assert.equal(c.headers["content-type"], "text/plain");
});

test("@file body is read from disk", () => {
  const c = parse(["http://x.test", "-b", "@payload.json"], (p) => `read:${p}`);
  assert.equal(c.body, "read:payload.json");
});

test("rejects bad method, header and error-rate", () => {
  assert.throws(() => parse(["http://x.test", "-m", "FETCH"]), /method/);
  assert.throws(() => parse(["http://x.test", "-H", "nocolon"]), /Header/);
  assert.throws(() => parse(["http://x.test", "--max-error-rate", "150"]), /0-100/);
});

test("--help returns help", () => {
  assert.equal(parseConfig(["--help"]), "help");
});
