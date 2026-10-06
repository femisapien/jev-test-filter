import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extractRSpecTests } from "../src/extract-rspec.ts";
import { buildFilter } from "../src/filter.ts";
import type { Selection, TestCase } from "../src/types.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const hasRSpec = spawnSync("rspec", ["--version"]).status === 0;

async function runSelection(file: string, choose: (t: TestCase) => boolean): Promise<string[]> {
  const all = extractRSpecTests(await readFile(new URL(file, new URL("..", import.meta.url)), "utf8"), file);
  const selected = all.filter(choose);
  assert.ok(selected.length > 0, "the fixture must contain the selected test");
  const selection: Selection = { all, selected, verdicts: [], fallback: null };
  const filter = buildFilter(selection, "rspec");
  assert.equal(filter.mode, "locations");
  const result = spawnSync("rspec", ["--format", "json", ...filter.argv], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.ok(report.examples.length > 0, "the runner must execute examples");
  return report.examples.map((example: { description: string }) => example.description).sort();
}

test("RSpec runs the multiline and description-less examples selected by their last lines", { skip: !hasRSpec }, async () => {
  assert.deepEqual(await runSelection("test/fixtures/rspec/cart_spec.rb", (t) =>
    t.titlePath.at(-1) === "clamps at zero" || t.titlePath.at(-1)?.startsWith("example at ") === true), [
    "clamps at zero", "is expected to eq 0",
  ]);
});

for (const group of ["customized inclusion", "multiline inclusion"]) {
  test(`RSpec runs every shared example in ${group}`, { skip: !hasRSpec }, async () => {
    assert.deepEqual(await runSelection("test/fixtures/rspec/shared_spec.rb", (t) =>
      t.titlePath[0] === group && t.titlePath.at(-1)?.includes("behave") === true), [
      group === "customized inclusion" ? "custom example" : "multiline custom example",
      "first shared example", "second shared example",
    ].sort());
  });
}

test("RSpec runs examples from include_context by selecting its enclosing group", { skip: !hasRSpec }, async () => {
  assert.deepEqual(await runSelection("test/fixtures/rspec/shared_spec.rb", (t) =>
    t.titlePath.at(-1)?.startsWith("include_context ") === true), ["context example", "local example"]);
});
