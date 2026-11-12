/* Shared test helpers: a mocked fetch/TMDB environment. Nothing here touches the real network. */
const path = require("node:path");

const PROVIDERS = path.join(__dirname, "..", "providers");
const V3 = "0123456789abcdef0123456789abcdef";

// Providers log through console.log as "[Name vX.Y.Z] ..."; hide that unless VERBOSE=1.
const realLog = console.log;
console.log = function () {
  if (/^\[[A-Za-z]+ v\d+\.\d+\.\d+\]/.test(String(arguments[0] || ""))) {
    if (process.env.VERBOSE) realLog.apply(console, arguments);
    return;
  }
  realLog.apply(console, arguments);
};

function makeResponse(spec, url) {
  const status = spec.status || 200;
  return {
    status: status,
    ok: status >= 200 && status < 300,
    url: spec.url || url,
    text: function () { return Promise.resolve(spec.body == null ? "" : String(spec.body)); }
  };
}
// routes: functions (url, opts) => { body, status? } | falsy. Unmatched URLs reject like a dead network.
function load(file, routes, key) {
  const calls = [];
  global.fetch = function (url, opts) {
    url = String(url);
    calls.push({ url: url, opts: opts || {} });
    for (let i = 0; i < routes.length; i++) {
      const hit = routes[i](url, opts || {});
      if (hit) return Promise.resolve(makeResponse(hit, url));
    }
    return Promise.reject(new Error("no mock route for " + url));
  };
  if (key === undefined) delete global.TMDB_API_KEY; else global.TMDB_API_KEY = key;
  const full = path.join(PROVIDERS, file);
  delete require.cache[require.resolve(full)];
  return { provider: require(full), calls: calls };
}
const at = (prefix, body) => (u) => u.startsWith(prefix) && { body: typeof body === "string" ? body : JSON.stringify(body) };
const b64 = (s) => Buffer.from(s).toString("base64");

// Mirror dropdown as rendered by the theme: option values are base64 iframes.
const iframeOption = (label, src) => '<option value="' + b64('<iframe src="' + src + '" allowfullscreen></iframe>') + '">' + label + "</option>";
const mirrorPage = (options) =>
  '<html><body><select class="mirror" name="mirror"><option value="">Select Video Server</option>' +
  options.map((o) => iframeOption(o[0], o[1])).join("") + "</select></body></html>";

// OK.ru embed: JSON inside JSON inside an HTML attribute, with \u0026 for "&" (the shape that broke the old parser).
const htmlAttr = (o) => JSON.stringify(o).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const okMeta = (sig) => ({
  videos: [
    { name: "mobile", url: "https://vd1.okcdn.ru/?id=1&type=0&sig=" + sig },
    { name: "sd", url: "https://vd1.okcdn.ru/?id=1&type=2&sig=" + sig },
    { name: "hd", url: "https://vd1.okcdn.ru/?id=1&type=3&sig=" + sig }
  ],
  hlsManifestUrl: "https://vd1.okcdn.ru/video.m3u8?id=1&sig=" + sig
});
const okHtml = (flashvars) =>
  '<div data-options="{&quot;decoy&quot;:1}"></div><div data-module="OKVideo" data-options="' + htmlAttr({ flashvars: flashvars }) + '"></div>';
const okPage = (sig) => okHtml({ metadata: JSON.stringify(okMeta(sig)).replace(/&/g, "\\u0026") });

const rumbleApi = (tag) => ({ ua: { mp4: {
  "360": { url: "https://sp.rmbl.ws/s8/2/" + tag + "/360.mp4", meta: { h: 360, w: 640 } },
  "720": { url: "https://sp.rmbl.ws/s8/2/" + tag + "/720.mp4", meta: { h: 720, w: 1280 } }
} } });
const dmMeta = (tag) => ({ qualities: {
  auto: [{ type: "application/x-mpegURL", url: "https://www.dailymotion.com/cdn/manifest/video/" + tag + ".m3u8?auth=1" }],
  "720": [{ type: "video/mp4", url: "https://cdn.dmcdn.net/" + tag + "/720.mp4?x=1" }]
} });

module.exports = { load, at, b64, V3, iframeOption, mirrorPage, htmlAttr, okHtml, okPage, okMeta, rumbleApi, dmMeta };
