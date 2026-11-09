# Anichin Providers

JavaScript providers for Nuvio. This repository contains streaming providers only, not a metadata catalog or a Stremio addon.

## Manifest

Add the following URL in the Nuvio Plugins menu:

`https://raw.githubusercontent.com/zeeelanddd-pixel/anichin-care-nuvio/main/manifest.json`

## Providers

- **Anichin**: Finds publicly accessible mirrors from Anichin pages. Implementation: `providers/anichin-care.js`.
- **Bilibili**: Searches public videos through the Bilibili web API and requests playback URLs supplied by the API. Implementation: `providers/bilibili.js`.
- **Odysee**: Resolves authorized public claims through Odysee's official SDK proxy. Implementation: `providers/odysee.js`. Only claims with a verifiable reusable license are returned.

All providers are registered separately in Nuvio. The Bilibili provider does not use login cookies or bypass regional restrictions, paywalls, DRM, challenges, or access controls. The Odysee provider only returns playback URLs supplied by the public API for claims with an explicitly verifiable reusable license. Content that requires login or is not authorized for public playback may return no streams.

Each provider exports `getStreams(tmdbId, mediaType, season, episode)` and returns an array of stream objects containing `name`, `title`, `url`, `quality`, and playback headers when required.

GitHub Actions checks JavaScript syntax, export contracts, and manifest JSON validity. Actual playback testing still depends on public content availability, regional availability, the provider APIs, and the Nuvio runtime.
