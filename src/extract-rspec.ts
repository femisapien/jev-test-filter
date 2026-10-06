/**
 * RSpec's examples, read out of the source.
 *
 * Asking RSpec instead (`rspec --dry-run`) would load every spec file, and in
 * a Rails application that means booting the application -- work nobody asked
 * this tool to do, for the same reason Rust is never listed unasked. The
 * source has everything a location filter needs, so the source is read.
 *
 * Selection is by location rather than by name, and every choice below
 * follows from how RSpec resolves a `file:line`, which was measured (RSpec
 * 3.13, Ruby 3.3) rather than assumed:
 *
 *   - A requested line runs the declaration nearest at or above it. RSpec
 *     records an example at a line of its own choosing -- `it "a",\n :slow do`
 *     at the first line, but `it(\n "a"\n) do` at the last -- so the first
 *     line of a multi-line call can resolve to the example BEFORE it, which
 *     is a wrong test run green. The last line of an example cannot: nothing
 *     is declared inside an example body. So an example is named by its last
 *     line.
 *   - A full description is not something to assemble. RSpec joins a group
 *     and its child with no space when the group is a class and the child
 *     starts with `#`, `.` or `::` (`Cart#total`), and with one otherwise
 *     (`"Cart" #total`). A name pattern spelled one way matches nothing
 *     spelled the other, and says nothing about it. A location has no
 *     spelling to get wrong.
 *   - Because of that, `dynamic` is never set. An interpolated title, a
 *     one-liner with no description at all and a row of an `.each` loop are
 *     all reachable by their line, so none of them has to be selected unasked.
 */
import { parse } from "@ast-grep/napi";
import type { SgNode } from "@ast-grep/napi";
import { registerLanguages } from "./languages.ts";
import type { TestCase } from "./types.ts";

/** `describe` and its spellings, including shared groups, which declare examples too. */
const GROUP = /^[xf]?(?:describe|context|feature|example_group)$|^shared_(?:examples(?:_for)?|context)$/;

/** `it` and its spellings. A call with no block declares nothing that runs. */
const EXAMPLE = /^[xf]?(?:it|specify|example|scenario|its)$|^(?:focus|pending|skip)$/;

/**
 * A nested group the shared examples are copied into. RSpec declares that
 * group at the call itself, so its line reaches every example it holds.
 */
const IT_BEHAVES_LIKE = /^it_(?:behaves|should_behave)_like$/;

/**
 * Shared examples copied straight into the enclosing group. They keep the
 * lines of the file that defined them, which is usually a support file, so
 * no line of this file reaches them -- except the enclosing group's own.
 */
const INCLUDE_SHARED = /^include_(?:examples|context)$/;

/** The receiver a group may be called on: none, or `RSpec`. */
function receiverAllowed(call: SgNode): boolean {
  const recv = call.field("receiver");
  return recv === null || /^(?:::)?RSpec$/.test(recv.text());
}

/** The positional arguments, without parentheses, commas or a trailing hash. */
function args(call: SgNode): SgNode[] {
  return (call.field("arguments")?.children() ?? []).filter((n) => n.isNamed() && n.kind() !== "comment");
}

/**
 * A string literal's text, with interpolations left as written. The grammar
 * has no escape nodes inside single quotes, where only `\\` and `\'` are
 * escapes at all.
 */
function stringText(node: SgNode): string {
  const text = node
    .children()
    .filter((n) => n.isNamed())
    .map((n) => (n.kind() === "escape_sequence" ? n.text().slice(1) : n.text()))
    .join("");
  return node.child(0)?.text() === "'" ? text.replace(/\\([\\'])/g, "$1") : text;
}

/** A class or module, as RSpec prints it: the constant path, exactly as written. */
function isConstant(node: SgNode): boolean {
  return node.kind() === "constant" || node.kind() === "scope_resolution";
}

/**
 * What RSpec prints for one level of the chain.
 *
 * `describe Cart, "#total"` is one description, "Cart#total": a second
 * string argument is appended by the same rule that joins a class to its
 * children. Symbols after the description are metadata and are dropped.
 */
export function description(call: SgNode): string {
  const [first, second] = args(call);
  if (!first) return "";
  let text: string;
  if (first.kind() === "string") text = stringText(first);
  else if (first.kind() === "simple_symbol") text = first.text().slice(1);
  else if (first.kind() === "pair" || first.kind() === "hash") return "";
  else text = first.text();
  if (second?.kind() === "string") text = joinDescriptions(text, stringText(second));
  return text;
}

/** RSpec's own separator: none between a class and a `#`, `.` or `::` child. */
function joinDescriptions(parent: string, child: string): string {
  if (child === "") return parent;
  if (parent === "") return child;
  return CONSTANT_PATH.test(parent) && /^(?:#|\.|::)/.test(child) ? `${parent}${child}` : `${parent} ${child}`;
}

const CONSTANT_PATH = /^(?:::)?[A-Z]\w*(?:::[A-Z]\w*)*$/;

/**
 * The full description, the way RSpec prints it.
 *
 * Only for reading: the class-versus-string distinction the separator turns
 * on is gone by the time a title is a string, so a group described by the
 * string `"Cart"` reads as if it were the class. Nothing is ever selected by
 * this name.
 */
export function rspecFullName(titlePath: readonly string[]): string {
  return titlePath.reduce((acc, part) => joinDescriptions(acc, part), "");
}

/** The line a block opens on, which is where RSpec records a group. */
function blockLine(call: SgNode): number {
  const block = call.field("block");
  return (block ?? call).range().start.line + 1;
}

export function extractRSpecTests(source: string, file: string): TestCase[] {
  registerLanguages();
  const root = parse("ruby", source).root();
  const out: TestCase[] = [];

  const push = (call: SgNode, titlePath: string[], runnerLine: number): void => {
    const range = call.range();
    out.push({
      file,
      titlePath,
      line: range.start.line + 1,
      endLine: range.end.line + 1,
      framework: "rspec",
      runnerLine,
      dynamic: false,
    });
  };

  // A walk rather than range containment, because where a call sits is what
  // decides whether it means anything: `skip "reason"` inside an example body
  // is a statement, not an example, so the walk never descends into one.
  const walk = (node: SgNode, chain: string[], groupLine: number | null): void => {
    if (node.kind() === "call") {
      const method = node.field("method")?.text() ?? "";
      const hasBlock = node.field("block") !== null;

      if (GROUP.test(method) && hasBlock && receiverAllowed(node)) {
        const next = [...chain, description(node)];
        for (const child of node.children()) walk(child, next, blockLine(node));
        return;
      }
      if (node.field("receiver") === null && chain.length > 0) {
        if (EXAMPLE.test(method) && hasBlock) {
          const title = description(node) || `example at ./${file}:${node.range().start.line + 1}`;
          push(node, [...chain, title], node.range().end.line + 1);
          return;
        }
        if (IT_BEHAVES_LIKE.test(method)) {
          const verb = method === "it_behaves_like" ? "behaves like" : "it should behave like";
          // A customization block may declare its own examples. Its last
          // line would select only the last of those, dropping the shared
          // examples. Select the nested group's declaration instead.
          const runnerLine = hasBlock ? blockLine(node) : node.range().end.line + 1;
          push(node, [...chain, `${verb} ${description(node)}`], runnerLine);
          return;
        }
        if (INCLUDE_SHARED.test(method)) {
          push(node, [...chain, `${method} ${description(node)}`], groupLine ?? node.range().start.line + 1);
          return;
        }
      }
    }
    for (const child of node.children()) walk(child, chain, groupLine);
  };

  walk(root, [], null);
  return out;
}
