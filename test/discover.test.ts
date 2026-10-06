import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverTests } from "../src/discover.ts";
import { gitEnv } from "./git-env.ts";

async function repo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "jev-discover-"));
  await mkdir(join(cwd, "spec"));
  await writeFile(join(cwd, "spec/cart_spec.rb"), 'RSpec.describe "Cart" do\n  it "sums" do\n  end\nend\n');
  await writeFile(join(cwd, "cart.test.ts"), 'import { test } from "vitest";\ntest("sums", () => {});\n');
  execFileSync("git", ["init", "-q"], { cwd, env: gitEnv() });
  execFileSync("git", ["add", "-A"], { cwd, env: gitEnv() });
  return cwd;
}

test("rspec is discovered only when asked for, so a Rails app's vitest run stays single-framework", async () => {
  const cwd = await repo();
  try {
    assert.deepEqual((await discoverTests(cwd, [], null)).map((t) => t.framework), ["vitest"]);
    assert.deepEqual((await discoverTests(cwd, [], "rspec")).map((t) => t.framework), ["rspec"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
