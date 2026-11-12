/*
 * Copies the shared engine block from providers/anichin-care.js into the other
 * providers that use the same WordPress theme. Usage: node tools/sync-engine.js
 * Only the block between the SHARED ENGINE markers is replaced; each file keeps its own header.
 */
const fs = require("node:fs");
const path = require("node:path");

const START = "/* ==== SHARED ENGINE START ==== */";
const END = "/* ==== SHARED ENGINE END ==== */";
const dir = path.join(__dirname, "..", "providers");
const SOURCE = "anichin-care.js";
const TARGETS = ["animexin.js", "donghuaking.js"];

function engineOf(text, name) {
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error(name + " is missing the SHARED ENGINE markers");
  return { head: text.slice(0, a), body: text.slice(a, b + END.length), tail: text.slice(b + END.length) };
}

const source = engineOf(fs.readFileSync(path.join(dir, SOURCE), "utf8"), SOURCE);
for (const name of TARGETS) {
  const file = path.join(dir, name);
  const target = engineOf(fs.readFileSync(file, "utf8"), name);
  const next = target.head + source.body + target.tail;
  if (next === fs.readFileSync(file, "utf8")) { console.log(name + ": already in sync"); continue; }
  fs.writeFileSync(file, next);
  console.log(name + ": engine updated");
}
