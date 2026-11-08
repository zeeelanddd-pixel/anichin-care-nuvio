const assert = require("node:assert/strict");
const provider = require("../providers/anichin-care.js");

assert.equal(typeof provider.getStreams, "function", "provider must export getStreams");
assert.equal(provider.getStreams.length, 4, "getStreams must accept TMDB id, media type, season and episode");

console.log("Provider contract OK");
