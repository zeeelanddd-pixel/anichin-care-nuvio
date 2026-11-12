# Anichin Providers

JavaScript providers for Nuvio. This repository contains streaming providers only, not a metadata catalog or a Stremio addon.

## Manifest

Add the following URL in the Nuvio Plugins menu:

`https://raw.githubusercontent.com/zeeelanddd-pixel/anichin-care-nuvio/main/manifest.json`

`manifest.json` uses the Nuvio format: top-level metadata plus a `scrapers` array, one entry per provider.

## Providers

- **Anichin**, **Animexin**, **DonghuaKing**: Find publicly accessible mirrors from the site's pages and resolve OK.ru, Rumble, Dailymotion and direct `.m3u8`/`.mp4` embeds. The three sites use the same WordPress theme and share one engine. Implementation: `providers/anichin-care.js`, `providers/animexin.js`, `providers/donghuaking.js`. Options labelled "Indonesia" are listed first; the site's own option text (for example "Hardsub English Ok.ru AX") is kept in the stream title so the subtitle language is visible. Mega, Streamwish and Dood mirrors are skipped because they need tokens or scripts that this project does not work around; Dtube and Odysee embeds are tried but their pages expose no media URL, so they usually yield nothing.
- **Bilibili**: Searches public videos through the Bilibili web API and requests playback URLs supplied by the API. Implementation: `providers/bilibili.js`. Disabled by default in the manifest.
- **Odysee**: Resolves authorized public claims through Odysee's official SDK proxy. Implementation: `providers/odysee.js`. Only claims with a verifiable reusable license (CC0, Public Domain, CC BY, CC BY-SA) are returned; NonCommercial and NoDerivatives licenses are rejected.

All providers are registered separately in Nuvio. The Bilibili provider does not use login cookies or bypass regional restrictions, paywalls, DRM, challenges, or access controls. The Odysee provider only returns playback URLs supplied by the public API for claims with an explicitly verifiable reusable license. Content that requires login or is not authorized for public playback may return no streams.

Each provider exports `getStreams(tmdbId, mediaType, season, episode)` and returns an array of stream objects containing `name`, `title`, `url`, `quality`, and playback headers when required.

## TMDB key

The providers turn a TMDB id into a title, so they read the `TMDB_API_KEY` global that the Nuvio runtime provides. Both a v3 API key and a v4 read-access token (the long `eyJ…` string) are accepted. Without a key, Anichin falls back to reading the title from the public TMDB web page; Bilibili and Odysee return no streams.

## Development

```
npm run check   # node --check on every provider
npm test        # manifest/provider contract + mocked-network behaviour tests
npm run sync    # copy the shared engine from anichin-care.js into animexin.js and donghuaking.js
```

The engine between the `SHARED ENGINE` markers must stay identical in the three theme-based providers. Edit it in `providers/anichin-care.js`, run `npm run sync`, and bump the versions in `manifest.json`; the contract test fails if the copies drift apart.

The tests never touch the real network (`VERBOSE=1 npm test` shows the providers' own log lines). GitHub Actions runs the same commands on every push and pull request. Actual playback still depends on public content availability, regional availability, the provider APIs, and the Nuvio runtime, so changes to a site's markup are not caught by CI.

Providers run in Nuvio's minimal JavaScript runtime: they must stay free of `setTimeout`/`setInterval` and `require()` calls (the contract test enforces this).
