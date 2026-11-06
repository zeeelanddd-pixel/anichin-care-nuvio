providers/anichin-care.js/*
 * Anichin Care - Nuvio provider test scaffold
 *
 * This is an integration test only. It intentionally does not scrape
 * or extract video streams from third-party pages.
 *
 * Nuvio provider contract:
 * getStreams(tmdbId, mediaType, season, episode) -> Promise<Array>
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Anichin Care] Provider loaded");
  console.log("[Anichin Care] Input:", {
    tmdbId: tmdbId,
    mediaType: mediaType,
    season: season,
    episode: episode
  });

  // Soul Land is a TV series. This confirms the provider was invoked,
  // but no stream is returned until a licensed/authorized source is configured.
  if (mediaType !== "tv") {
    console.log("[Anichin Care] Skipped: unsupported media type.");
    return [];
  }

  console.log("[Anichin Care] Test completed. No stream source configured.");
  return [];
}

module.exports = { getStreams };
