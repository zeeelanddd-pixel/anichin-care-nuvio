# Anichin Providers

JavaScript streaming providers for [Nuvio](https://github.com/tapframe/NuvioStreaming), focused on donghua. This repository contains providers only, not a metadata catalog or a Stremio addon.

## Install

Add this URL in the Nuvio Plugins menu:

`https://raw.githubusercontent.com/zeeelanddd-pixel/anichin-care-nuvio/main/manifest.json`

`manifest.json` uses the Nuvio format: top-level metadata plus a `scrapers` array, one entry per provider.

## Providers

| Provider | On by default | Status |
| --- | --- | --- |
| **Anichin** | yes | Reported working on Renegade Immortal and Beyond Time's Gaze (v1.4.0). |
| **Animexin** | yes | Reported working on Renegade Immortal, all episodes. v1.5.0 fixes titles with apostrophes ("Beyond Time's Gaze") and continuous episode numbering across seasons. |
| **DonghuaKing** | yes | Works only for what the site hosts. Its catalogue is partly stale: Renegade Immortal there starts at episode 69 and stops at 121 (December 2025), and many newer titles are missing. |
| **Bilibili** | no | Bilibili answers anonymous API requests with HTTP 412 and rarely carries Indonesian subtitles. Getting past that needs cookies or request signing, which this project does not do. |
| **Odysee** | no | By design it returns only claims with a verifiable reusable license (CC0, Public Domain, CC BY, CC BY-SA; NonCommercial and NoDerivatives are rejected). Donghua are almost never published that way. |

**Anichin, Animexin and DonghuaKing** run on the same WordPress theme and share one engine (`providers/anichin-care.js`, `providers/animexin.js`, `providers/donghuaking.js`). They look up the site's public pages, read the mirror dropdown and the page's default player, and resolve OK.ru, Rumble, Dailymotion and direct `.m3u8`/`.mp4` embeds, plus a site's own player page. Options labelled "Indonesia" are listed first, and the site's own option text (for example "Hardsub English Ok.ru AX") is kept in the stream title so the subtitle language is visible. Mega, Streamwish and Dood are skipped because they need tokens or scripts that this project does not work around; Dtube and Odysee embeds are tried but their pages expose no media URL, so they usually yield nothing.

None of the providers use login cookies or bypass regional restrictions, paywalls, DRM, challenges, or access controls. If a site blocks a request, the provider returns no streams.

Each provider exports `getStreams(tmdbId, mediaType, season, episode)` and returns an array of stream objects with `name`, `title`, `url`, `quality`, and playback `headers`.

## How a lookup works

1. The TMDB id becomes a title, its aliases (for example the pinyin name) and the episode count of each season.
2. The site is searched with punctuation removed, because a WordPress search treats `Time's` and `Time’s` as different words.
3. One series page is chosen per series. A page marked "Season N" wins for season N.
4. The episode is located. TMDB numbers episodes per season while sites usually number them continuously, so on a page without a season marker S2E3 after a 26-episode S1 becomes episode 29. If that episode does not exist yet, nothing is returned rather than a wrong episode.
5. The mirrors are resolved to direct media URLs.

## TMDB key

The providers read the `TMDB_API_KEY` global that the Nuvio runtime provides. Both a v3 API key and a v4 read-access token (the long `eyJ…` string) are accepted. Without a key, the three donghua providers fall back to reading the title from the public TMDB web page; Bilibili and Odysee return no streams.

## No streams?

1. **The site does not have it.** Open the site and look for the title and episode. Mirrors differ per site: Anichin and Animexin carry most titles, DonghuaKing fewer.
2. **The mirrors are all unsupported or dead.** Mega, Streamwish and Dood are skipped, and OK.ru, Rumble or Dailymotion videos get deleted.
3. **Numbering differs.** The site uses its own episode numbers (specials, recaps, merged episodes).
4. **Find out where it stops.** On a computer with Node 20 or newer, run
   `TMDB_API_KEY=<your key> node tools/diagnose.js animexin 281233 tv 1 5`
   (provider, TMDB id, type, season, episode). It prints each step against the real sites.

## Development

```
npm run check      # node --check on every provider and tool
npm test           # manifest/provider contract + mocked-network behaviour tests
npm run sync       # copy the shared engine from anichin-care.js into animexin.js and donghuaking.js
npm run diagnose -- animexin 281233 tv 1 5   # run a provider against the real network
```

The engine between the `SHARED ENGINE` markers must stay identical in the three theme-based providers. Edit it in `providers/anichin-care.js`, run `npm run sync`, and bump the versions in `manifest.json` (the three providers share a version number); the contract test fails if the copies drift apart.

The tests never touch the real network (`VERBOSE=1 npm test` shows the providers' own log lines). GitHub Actions runs the same commands on every push and pull request. Playback still depends on public content availability, regional availability, the sites' markup and the Nuvio runtime, so a site redesign is not caught by CI.

Providers run in Nuvio's minimal JavaScript runtime: they must stay free of `setTimeout`/`setInterval`, `require()` and modern syntax (arrow functions, `let`/`const`); the contract test enforces the first two.
