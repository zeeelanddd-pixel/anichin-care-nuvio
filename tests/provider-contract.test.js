const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const provider = require("../providers/anichin-care.js");

assert.equal(typeof provider.getStreams, "function", "provider must export getStreams");
assert.equal(provider.getStreams.length, 4, "getStreams must accept TMDB id, media type, season and episode");

const source = fs.readFileSync(path.join(__dirname, "../providers/anichin-care.js"), "utf8");
assert.ok(source.includes('var VERSION = "1.2.3"'), "provider version should be current");
assert.ok(source.includes("name: PROVIDER"), "streams should use the provider display name");
assert.ok(source.includes("var dedupeKey = host + path"), "streams should be deduplicated by canonical media URL");
assert.ok(source.includes('quality: resolution ? resolution[1] + "p" : "Auto"'), "quality should only be shown when detected");

console.log("Provider contract and stream-quality checks OK");
