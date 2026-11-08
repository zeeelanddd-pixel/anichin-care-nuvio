const assert = require("node:assert/strict");
const provider = require("../providers/anichin-care.js");

assert.equal(typeof provider.getStreams, "function", "provider must export getStreams");
assert.equal(provider.getStreams.length, 4, "getStreams must accept TMDB id, media type, season and episode");

const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../providers/anichin-care.js"), "utf8");
assert.match(source, /var VERSION = "1\\.2\\.2"/, "provider version should be current");
assert.match(source, /name: PROVIDER/, "streams should use the provider display name");
assert.match(source, /var dedupeKey = host \+ path/, "streams should be deduplicated by canonical media URL");
assert.match(source, /quality: resolution \? resolution\[1\] \+ "p" : "Auto"/, "quality should only be shown when detected");

console.log("Provider contract and stream-quality checks OK");
