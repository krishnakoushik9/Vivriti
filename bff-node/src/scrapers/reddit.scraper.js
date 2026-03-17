const axios = require("axios");
const { scanRiskKeywords } = require("../config/riskKeywords");

const SUBREDDITS_TO_SEARCH = [
  "india",
  "IndiaInvestments",
  "IndianStreetBets",
  "StocksIndia",
  "IndianBusinessNews",
];

async function searchRedditGlobal(query) {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&t=year&limit=25`;
  const res = await axios.get(url, {
    timeout: 8000,
    headers: { "User-Agent": "Mozilla/5.0 (CreditResearchBot/1.0)" },
    validateStatus: (s) => s >= 200 && s < 300,
  });
  return (res.data?.data?.children || []).map((c) => c?.data).filter(Boolean);
}

async function searchSubreddit(sub, query) {
  const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(
    query
  )}&restrict_sr=1&sort=relevance&t=year&limit=10`;
  const res = await axios.get(url, {
    timeout: 8000,
    headers: { "User-Agent": "Mozilla/5.0 (CreditResearchBot/1.0)" },
    validateStatus: (s) => s >= 200 && s < 300,
  });
  return (res.data?.data?.children || []).map((c) => c?.data).filter(Boolean);
}

function isRelevantPost(post, company) {
  const title = String(post?.title || "").toLowerCase();
  const terms = [company.name, ...(company.promoters || [])].filter(Boolean).map((t) => String(t).toLowerCase());
  return terms.some((t) => t && title.includes(t));
}

function toResearchResult(company, post, sourceName) {
  const title = post.title || "";
  const selftext = post.selftext || "";
  const fullText = `${title}\n${selftext}`.trim();
  const riskKeywordsFound = scanRiskKeywords(fullText);
  return {
    sourceType: "REDDIT",
    sourceName,
    sourceUrl: `https://www.reddit.com${post.permalink || ""}`,
    companyId: company.id,
    title,
    snippet: (selftext || "").slice(0, 500),
    fullText,
    publishedAt: post.created_utc ? new Date(post.created_utc * 1000) : null,
    riskKeywordsFound,
    rawHtml: null,
    scrapedAt: new Date().toISOString(),
  };
}

async function scrapeReddit(company, { logger, reachableSources } = {}) {
  if (reachableSources && reachableSources.size && !reachableSources.has("Reddit API")) {
    return [];
  }

  const results = [];
  const seen = new Set();
  const queries = [company.name, ...(company.promoters || [])].filter(Boolean);

  for (const q of queries) {
    try {
      const posts = await searchRedditGlobal(q);
      for (const p of posts) {
        if (!p?.id || seen.has(p.id)) continue;
        if (!isRelevantPost(p, company)) continue;
        seen.add(p.id);
        const rr = toResearchResult(company, p, "Reddit (global)");
        // keep if risk keywords found OR notable engagement
        if ((rr.riskKeywordsFound || []).length === 0 && (p.score || 0) < 50) continue;
        results.push(rr);
      }
    } catch (err) {
      if (logger) logger.warn(`[SCRAPER][REDDIT] global failed for "${q}"`, { error: err?.message });
    }

    for (const sub of SUBREDDITS_TO_SEARCH) {
      try {
        const posts = await searchSubreddit(sub, q);
        for (const p of posts) {
          if (!p?.id || seen.has(p.id)) continue;
          if (!isRelevantPost(p, company)) continue;
          seen.add(p.id);
          const rr = toResearchResult(company, p, `Reddit r/${sub}`);
          if ((rr.riskKeywordsFound || []).length === 0 && (p.score || 0) < 50) continue;
          results.push(rr);
        }
      } catch (err) {
        if (logger) logger.warn(`[SCRAPER][REDDIT] r/${sub} failed for "${q}"`, { error: err?.message });
      }
    }
  }

  return results;
}

module.exports = {
  SUBREDDITS_TO_SEARCH,
  searchRedditGlobal,
  searchSubreddit,
  scrapeReddit,
};

