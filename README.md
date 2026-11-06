# Anichin Care - Nuvio test scaffold

This package is a **provider-loading test scaffold**, not a functioning video source.
It confirms that Nuvio can load and invoke the JavaScript provider. It intentionally
returns an empty stream list and does not scrape or extract video from third-party sites.

## Files
- `manifest.json`: repository manifest
- `providers/anichin-care.js`: Nuvio provider entry point

## Important
Nuvio plugins are stream providers only. They do not create catalogs, search pages,
episode lists, or metadata screens. Nuvio passes a TMDB ID and episode parameters
to `getStreams`, and the provider returns playable stream objects.

To make this a functional provider, a source that is licensed or otherwise authorized
to distribute the video must be supplied, together with its documented access method.

## Validation
- JSON manifest: valid JSON
- Provider: exports `getStreams`
- Stream result: intentionally empty pending an authorized source
- Not yet tested inside your installed Nuvio APK
