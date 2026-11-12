/*
 * Runs one provider against the REAL network (Node 20+ with global fetch) and prints its log lines,
 * so you can see where a lookup stops: TMDB title -> search -> candidate -> episode -> mirrors -> streams.
 *
 *   TMDB_API_KEY=<v3 key or v4 token> node tools/diagnose.js <provider> <tmdbId> [tv|movie] [season] [episode]
 *   TMDB_API_KEY=... node tools/diagnose.js animexin 281233 tv 1 5
 *
 * <provider> is a manifest id (anichin, animexin, donghuaking, ...) or a file name.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const [name, id, type, season, episode] = process.argv.slice(2);

if (!name || !id) {
  console.log("usage: node tools/diagnose.js <provider> <tmdbId> [tv|movie] [season] [episode]");
  console.log("providers: " + manifest.scrapers.map((s) => s.id).join(", "));
  process.exit(1);
}
const scraper = manifest.scrapers.find((s) => s.id === name || path.basename(s.filename, ".js") === name.replace(/\.js$/, ""));
if (!scraper) { console.log("unknown provider '" + name + "'"); process.exit(1); }
if (typeof fetch !== "function") { console.log("this Node has no global fetch; use Node 20 or newer"); process.exit(1); }
if (process.env.TMDB_API_KEY) global.TMDB_API_KEY = process.env.TMDB_API_KEY;
else console.log("(TMDB_API_KEY is not set: only the TMDB web-page fallback can work)");

const provider = require(path.join(root, scraper.filename));
const started = Date.now();
provider.getStreams(id, type || "tv", Number(season) || 1, Number(episode) || 1).then((streams) => {
  console.log("\n" + streams.length + " stream(s) in " + ((Date.now() - started) / 1000).toFixed(1) + "s");
  streams.forEach((s, i) => console.log((i + 1) + ". [" + s.quality + "] " + s.title + "\n   " + s.url));
}).catch((e) => { console.log("provider threw: " + (e && e.stack || e)); process.exit(1); });
