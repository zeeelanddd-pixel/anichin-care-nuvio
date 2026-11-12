const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const REQUIRED = ["id", "name", "description", "version", "author", "supportedTypes", "filename", "enabled", "formats"];

test("manifest has a scrapers array", () => {
  assert.ok(Array.isArray(manifest.scrapers), "manifest.scrapers must be an array");
  assert.ok(manifest.scrapers.length >= 1);
});

test("manifest ids are unique", () => {
  const ids = manifest.scrapers.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id in manifest: " + ids.join(", "));
});

test("every provider file in providers/ is registered in the manifest", () => {
  const registered = manifest.scrapers.map((x) => path.basename(x.filename)).sort();
  const onDisk = fs.readdirSync(path.join(root, "providers")).filter((f) => f.endsWith(".js")).sort();
  assert.deepEqual(registered, onDisk);
});

for (const scraper of manifest.scrapers) {
  test("provider contract: " + scraper.id, () => {
    for (const key of REQUIRED) assert.ok(key in scraper, scraper.id + " is missing manifest field '" + key + "'");
    assert.match(scraper.version, /^\d+\.\d+\.\d+$/, scraper.id + " version must be semver");
    assert.ok(Array.isArray(scraper.supportedTypes) && scraper.supportedTypes.length, scraper.id + " needs supportedTypes");
    for (const t of scraper.supportedTypes) assert.ok(["movie", "tv"].includes(t), scraper.id + " has unknown type " + t);

    const file = path.join(root, scraper.filename);
    assert.ok(fs.existsSync(file), scraper.filename + " does not exist");
    const source = fs.readFileSync(file, "utf8");

    // The version users see in Nuvio must match the version logged by the code.
    const declared = /var VERSION = "([^"]+)"/.exec(source);
    assert.ok(declared, scraper.filename + " must declare var VERSION");
    assert.equal(declared[1], scraper.version, scraper.filename + " VERSION differs from manifest");

    // Nuvio runs providers in a minimal JS runtime: these are not available there.
    assert.ok(!/\bsetTimeout\b|\bsetInterval\b/.test(source), scraper.filename + " must not use timers (missing in Nuvio runtime)");
    assert.ok(!/\brequire\s*\(/.test(source), scraper.filename + " must not require() modules");

    const provider = require(file);
    assert.equal(typeof provider.getStreams, "function", scraper.filename + " must export getStreams");
    assert.equal(provider.getStreams.length, 4, scraper.filename + " getStreams must accept (tmdbId, mediaType, season, episode)");
  });
}

test("CHANGELOG documents the current Anichin version", () => {
  const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const anichin = manifest.scrapers.find((x) => x.id === "anichin");
  assert.ok(changelog.includes("## " + anichin.version), "CHANGELOG.md has no '## " + anichin.version + "' section");
  assert.ok(!/^-\s*$/m.test(changelog), "CHANGELOG.md contains an empty bullet");
});

test("anichin-care, animexin and donghuaking share an identical engine (after editing it, run: node tools/sync-engine.js)", () => {
  const START = "/* ==== SHARED ENGINE START ==== */";
  const END = "/* ==== SHARED ENGINE END ==== */";
  const engine = (name) => {
    const text = fs.readFileSync(path.join(root, "providers", name), "utf8");
    const a = text.indexOf(START), b = text.indexOf(END);
    assert.ok(a >= 0 && b > a, name + " has no SHARED ENGINE markers");
    return text.slice(a, b + END.length);
  };
  const reference = engine("anichin-care.js");
  for (const name of ["animexin.js", "donghuaking.js"]) {
    assert.equal(engine(name), reference, name + " engine differs from anichin-care.js");
  }
});
