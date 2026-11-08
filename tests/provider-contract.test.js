const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

for (const file of ["anichin-care.js", "bilibili.js"]) {
  const provider = require("../providers/" + file);
  assert.equal(typeof provider.getStreams, "function", file + " must export getStreams");
  assert.equal(provider.getStreams.length, 4, file + " must accept four arguments");
}

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"));
assert.equal(manifest.scrapers.length, 2, "manifest should register two providers");
assert.ok(manifest.scrapers.some(x => x.id === "anichin-care"));
assert.ok(manifest.scrapers.some(x => x.id === "bilibili-public"));
assert.ok(fs.existsSync(path.join(__dirname, "../providers/bilibili.js")));

console.log("Both provider contracts and manifest OK");
