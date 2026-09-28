import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRSpecTests, rspecFullName } from "../src/extract-rspec.ts";
import { buildFilter } from "../src/filter.ts";
import { displayName } from "../src/questions.ts";
import type { Selection, TestCase } from "../src/types.ts";

const SRC = `
RSpec.shared_examples "a container" do
  it "is empty at first" do
  end
end

RSpec.describe Cart, "#total", :slow do
  it "sums" do
    skip "not yet"
    pending "either"
  end

  it(
    "multi line"
  ) do
  end

  it { is_expected.to eq 0 }

  it "row #{n}" do
  end

  it "has no block"

  context(
    "when empty"
  ) do
    include_examples "a container"
    it_behaves_like "a container"
    specify "is zero" do
    end
  end

  describe ".build" do
    xit 'is \\'quoted\\'' do
    end
  end
end

describe :legacy do
  scenario "top level describe" do
  end
end

Other.describe "not rspec" do
  it "is ignored" do
  end
end
`;

const found = extractRSpecTests(SRC, "spec/cart_spec.rb");

function sel(all: TestCase[], selected: TestCase[]): Selection {
  return {
    all,
    selected,
    verdicts: all.map((t, i) => ({
      id: `q${i}`,
      test: t,
      answer: null,
      reason: selected.includes(t) ? "scored" : "below",
      selected: selected.includes(t),
    })),
    fallback: null,
  };
}

test("every example is collected under its group chain", () => {
  assert.deepEqual(found.map((t) => t.titlePath), [
    ["a container", "is empty at first"],
    ["Cart#total", "sums"],
    ["Cart#total", "multi line"],
    ["Cart#total", "example at ./spec/cart_spec.rb:18"],
    ["Cart#total", "row #{n}"],
    ["Cart#total", "when empty", "include_examples a container"],
    ["Cart#total", "when empty", "behaves like a container"],
    ["Cart#total", "when empty", "is zero"],
    ["Cart#total", ".build", "is 'quoted'"],
    ["legacy", "top level describe"],
  ]);
});

test("nothing is dynamic: a location reaches a title the source cannot spell", () => {
  assert.equal(found.every((t) => !t.dynamic && t.framework === "rspec"), true);
});

test("an example is named by its last line, where RSpec cannot resolve it to another", () => {
  // `it(\n "multi line"\n) do` is recorded by RSpec at the `) do` line; its
  // first line resolves to the example before it.
  const multi = found.find((t) => t.titlePath.at(-1) === "multi line")!;
  assert.deepEqual([multi.line, multi.endLine, multi.runnerLine], [13, 16, 16]);
});

test("include_examples is named by the line its group's block opens on", () => {
  const inc = found.find((t) => t.titlePath.at(-1) === "include_examples a container")!;
  assert.equal(inc.line, 28);
  assert.equal(inc.runnerLine, 27);
});

test("the full name follows RSpec's separator between a class and its members", () => {
  assert.equal(rspecFullName(["Cart", "#total", "sums"]), "Cart#total sums");
  assert.equal(rspecFullName(["Cart", ".build", "x"]), "Cart.build x");
  assert.equal(rspecFullName(["Foo::Bar", "::Baz"]), "Foo::Bar::Baz");
  assert.equal(rspecFullName(["a cart", "#total"]), "a cart #total");
  assert.equal(displayName(found[1]!), "Cart#total sums");
});

test("the filter names each file once, with its lines", () => {
  const [, sums, multi, , , inc] = found;
  const other: TestCase = { ...sums!, file: "spec/other_spec.rb", runnerLine: 4 };
  const all = [...found, other];
  const f = buildFilter(sel(all, [inc!, multi!, sums!, other]), "rspec");
  assert.deepEqual(f, { mode: "locations", argv: ["spec/cart_spec.rb:11:16:27", "spec/other_spec.rb:4"] });
});

test("the filter falls back to whole files when most of the suite is selected", () => {
  const f = buildFilter(sel(found, found.slice(1)), "rspec");
  assert.deepEqual(f, { mode: "files", argv: ["spec/cart_spec.rb"] });
});
