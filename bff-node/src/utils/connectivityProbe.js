const axios = require("axios");

// Module-level reachability cache (5 minutes)
let lastProbeAt = 0;
const PROBE_TTL_MS = 5 * 60 * 1000;
let lastResults = [];

// Module-level set used by scrapers to skip unreachable sources
const REACHABLE_SOURCES = new Set();

async function probeConnectivity({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastProbeAt < PROBE_TTL_MS) {
    return {
      cached: true,
      lastProbeAt,
      results: lastResults,
      reachableSources: Array.from(REACHABLE_SOURCES),
    };
  }

  const targets = [
    { name: "Google News RSS", url: "https://news.google.com/rss/search?q=test&hl=en-IN" },
    { name: "Economic Times RSS", url: "https://economictimes.indiatimes.com/rssfeedstopstories.cms" },
    { name: "Mint RSS", url: "https://www.livemint.com/rss/news" },
    { name: "Reddit API", url: "https://www.reddit.com/r/india/search.json?q=test&limit=1" },
    { name: "RBI site", url: "https://www.rbi.org.in" },
  ];

  const results = [];
  REACHABLE_SOURCES.clear();

  for (const t of targets) {
    try {
      const start = Date.now();
      await axios.get(t.url, {
        timeout: 5000,
        headers: { "User-Agent": "Mozilla/5.0" },
        validateStatus: (s) => s >= 200 && s < 300,
      });
      const ms = Date.now() - start;
      results.push({ ...t, reachable: true, ms });
      REACHABLE_SOURCES.add(t.name);
    } catch (e) {
      results.push({ ...t, reachable: false, error: e?.code ?? e?.message ?? "unknown_error" });
    }
  }

  lastProbeAt = now;
  lastResults = results;
  return { cached: false, lastProbeAt, results, reachableSources: Array.from(REACHABLE_SOURCES) };
}

module.exports = {
  probeConnectivity,
  REACHABLE_SOURCES,
};

