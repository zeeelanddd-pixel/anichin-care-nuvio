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
| **DonghuaStream** | yes | The most up to date of the four (Beyond Time's Gaze episode 48 on the day it aired). Offers Dailymotion, Rumble and OK.ru mirrors with multiple subtitles. Reported as returning nothing on the first tests; from 1.7.0 it shows a "⚠" card that says why. |
| **LuciferDonghua** | yes | Added in 1.8.0. The freshest site checked: it already had Renegade Immortal episode 167 on the day it aired. Dropdown offers Dailymotion (Indo + Eng), Rumble and OK.ru; its VidHide server is not read. Not yet tested by the maintainer. |
| **DonghuaKing** | yes | Works only for what the site hosts. Its catalogue is partly stale: Renegade Immortal there starts at episode 69 and stops at 121 (December 2025), and many newer titles are missing. Reported as returning nothing on the first tests; the "⚠" card now says why. |
| **Dailymotion** | yes | Added in 1.8.0. Searches Dailymotion's public API for full episodes and plays public videos, so it works even when the donghua sites are blocked. Matching is strict (episode number, show title, at least 8 minutes, no trailers) because Dailymotion has many unrelated uploads. Not yet tested by the maintainer. |
| **Bilibili** | yes | Finds videos, but the streams were reported unplayable. 1.1.0 upgrades `http://` links to HTTPS (Android blocks cleartext), asks for MP4 (`platform=html5`), drops the `mcdn`/bare-IP mirrors that players cannot use, skips clips shorter than 8 minutes, and checks every URL with the player's headers before offering it. It searches fan uploads, not official episodes, so many titles still return nothing. |
| **Odysee** | no | By design it returns only claims with a verifiable reusable license (CC0, Public Domain, CC BY, CC BY-SA; NonCommercial and NoDerivatives are rejected). Donghua are almost never published that way. |

**Anichin, Animexin, DonghuaStream, LuciferDonghua and DonghuaKing** run on the same WordPress theme and share one engine (`providers/anichin-care.js`, `providers/animexin.js`, `providers/donghuastream.js`, `providers/luciferdonghua.js`, `providers/donghuaking.js`); they carry the version of that engine. They look up the site's public pages, read the mirror dropdown and the page's default player, and resolve OK.ru, Rumble, Dailymotion and direct `.m3u8`/`.mp4` embeds, plus a site's own player page. Options labelled "Indonesia" are listed first, and the site's own option text (for example "Hardsub English Ok.ru AX") is kept in the stream title so the subtitle language is visible. Mega, Streamwish and Dood are skipped because they need tokens or scripts that this project does not work around; Dtube and Odysee embeds are tried but their pages expose no media URL, so they usually yield nothing.

None of the providers use login cookies or bypass regional restrictions, paywalls, DRM, challenges, or access controls. If a site blocks a request, the provider returns no streams.

Each provider exports `getStreams(tmdbId, mediaType, season, episode)` and returns an array of stream objects with `name`, `title`, `url`, `quality`, and playback `headers`.

## File size

Progressive files (MP4) show their size in the line below the bold name, after the quality: `720p • 245.3 MB`. The size comes from what a server already reports: the CDN's answer to a `HEAD` request (so nothing is downloaded), Rumble's own `meta.size`, or Bilibili's `playurl` size. If nobody reports one, no size is shown; nothing is estimated. HLS streams (`Auto`) have no single file and therefore no size. The same text is also in the stream's `title` and `size` fields.

## The "⚠" card

When a donghua provider (or Bilibili) finds nothing, it shows one entry named `⚠ <cause>`. Nuvio's card shows only two lines, so the **bold line is the cause** and the **line below is the detail**:

| Bold line | Detail line | Meaning |
| --- | --- | --- |
| `⚠ Diblokir situs (HTTP 403)` | `donghuastream.org menolak permintaan Nuvio` | The site refused Nuvio's request. Nothing is done to get around that. |
| `⚠ Halaman verifikasi bot` | `donghuastream.org meminta verifikasi (tidak ditembus)` | The site answered with a bot check. |
| `⚠ Tidak bisa terhubung` | `donghuastream.org (fetch failed)` | No connection to the site. |
| `⚠ Judul tidak ada di situs` | `'Beyond Time Gaze': wp 0, cari 0 [Other Show \| Another]` | No title matched. `wp` and `cari` are how many results the site's two searches returned; the titles in brackets are what it returned instead, so a naming mismatch shows up here. |
| `⚠ Episode 130 tidak ada` | `'Fake Show' hanya terdaftar 53 episode (69–121)` | The site has the series but not that episode (or numbers it differently). |
| `⚠ Server tidak didukung` | `dilewati: mega.nz, streamwish.to` | Every player on the page is one this project does not read. |
| `⚠ Video tidak terbaca` | `Ok ru English — OK.ru: video dihapus atau halaman berubah` | The players exist but gave no video link. |
| `⚠ Judul TMDB tidak terbaca` | `periksa TMDB_API_KEY di Nuvio` | The title could not be read from TMDB. |
| `⚠ CDN menolak pemutaran (HTTP 403)` | `'Fake Show Episode 3'` | Bilibili's CDN refused the video. |

The card is not a video; tapping it does nothing useful. It exists so a failure can be reported with a screenshot. To hide it, set `var SHOW_DIAGNOSTICS = false;` near the top of a provider file.

## Not supported, and why

- **YouTube.** Stream URLs are produced by YouTube's private client API and are gated by signatures and anti-bot tokens that change often. Getting them means defeating those protections, which this project does not do (and YouTube's terms forbid). Use the YouTube app.
- **iQIYI (iq.com).** Streams are DRM-protected, requested with signed parameters, and limited by region.
- **AnimeKhor (animekhor.org).** It answers automated requests with bot detection (it even blocked the lookup used to check its structure). A site that blocks Nuvio would only produce a "⚠" card, and this project does not try to get past bot detection.
- **AnimeCube (animecube.live).** A JavaScript app whose video sources come from an API that encrypts its responses for its own player; the page HTML is an empty shell. Reading it would mean decrypting that payload.

This project only reads what a site publishes openly in its pages.

## How a lookup works

1. The TMDB id becomes a title, its aliases (for example the pinyin name) and the episode count of each season.
2. The site is searched with punctuation removed, because a WordPress search treats `Time's` and `Time’s` as different words.
3. One series page is chosen per series. A page marked "Season N" wins for season N.
4. The episode is located. TMDB numbers episodes per season while sites usually number them continuously, so on a page without a season marker S2E3 after a 26-episode S1 becomes episode 29. If that episode does not exist yet, nothing is returned rather than a wrong episode.
5. The mirrors are resolved to direct media URLs.

## TMDB key

The providers read the `TMDB_API_KEY` global that the Nuvio runtime provides. Both a v3 API key and a v4 read-access token (the long `eyJ…` string) are accepted. Without a key, the donghua providers fall back to reading the title from the public TMDB web page; Bilibili and Odysee return no streams.

## No streams?

0. **Read the "⚠" card** (see above): it usually names the cause.
1. **The site does not have it.** Open the site and look for the title and episode. Mirrors differ per site: Anichin, Animexin, DonghuaStream and LuciferDonghua carry most titles, DonghuaKing fewer.
2. **The mirrors are all unsupported or dead.** Mega, Streamwish and Dood are skipped, and OK.ru, Rumble or Dailymotion videos get deleted.
3. **Numbering differs.** The site uses its own episode numbers (specials, recaps, merged episodes).
4. **Find out where it stops.** On a computer with Node 20 or newer, run
   `TMDB_API_KEY=<your key> node tools/diagnose.js animexin 281233 tv 1 5`
   (provider, TMDB id, type, season, episode). It prints each step against the real sites.

## Development

```
npm run check      # node --check on every provider and tool
npm test           # manifest/provider contract + mocked-network behaviour tests
npm run sync       # copy the shared engine from anichin-care.js into every other theme-based provider
npm run diagnose -- animexin 281233 tv 1 5   # run a provider against the real network
```

The engine between the `SHARED ENGINE` markers must stay identical in every theme-based provider. Edit it in `providers/anichin-care.js`, run `npm run sync`, and bump the versions in `manifest.json` (the theme-based providers share a version number); the contract test fails if the copies drift apart.

The tests never touch the real network (`VERBOSE=1 npm test` shows the providers' own log lines). GitHub Actions runs the same commands on every push and pull request. Playback still depends on public content availability, regional availability, the sites' markup and the Nuvio runtime, so a site redesign is not caught by CI.

Providers run in Nuvio's minimal JavaScript runtime: they must stay free of `setTimeout`/`setInterval`, `require()` and modern syntax (arrow functions, `let`/`const`); the contract test enforces the first two.
