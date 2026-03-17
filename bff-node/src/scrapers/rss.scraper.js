const RSSParser = require("rss-parser");
const { scanRiskKeywords } = require("../config/riskKeywords");

const RSS_SOURCES = [
  { name: "Economic Times", url: "https://economictimes.indiatimes.com/rssfeedstopstories.cms" },
  { name: "Mint", url: "https://www.livemint.com/rss/news" },
  { name: "Business Standard", url: "https://www.business-standard.com/rss/home_page_top_stories.rss" },
  { name: "Financial Express", url: "https://www.financialexpress.com/feed/" },
  { name: "MoneyControl", url: "https://www.moneycontrol.com/rss/latestnews.xml" },
  { name: "Hindu BusinessLine", url: "https://www.thehindubusinessline.com/news/feeder/default.rss" },
  { name: "NDTV Profit", url: "https://feeds.feedburner.com/ndtvprofit-latest" },
  { name: "Reuters India", url: "https://feeds.reuters.com/reuters/INbusinessNews" },
  { name: "CNBC TV18", url: "https://www.cnbctv18.com/commonfeeds/v1/ind/rss/business.xml" },
  { name: "Zee Business", url: "https://www.zeebiz.com/rss" },
  { name: "Google News IN", url: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en" },
];

function googleNewsSearchURL(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
}

function buildGoogleNewsQueries(company) {
  const n = company.companyName || company.name || "";
  const promoters = company.promoters ?? [];

  return [
    // Company financial health
    `"${n}"`,
    `"${n}" fraud OR scam OR default`,
    `"${n}" NPA OR "non-performing"`,
    `"${n}" NCLT OR insolvency OR "winding up"`,
    `"${n}" SEBI OR "show cause" OR penalty`,
    `"${n}" RBI OR "RBI action" OR "RBI penalty"`,
    `"${n}" "Enforcement Directorate" OR "ED raid"`,
    `"${n}" CBI OR FIR OR arrested`,
    `"${n}" "debt restructuring" OR "one time settlement"`,
    `"${n}" "plant shutdown" OR "factory sealed"`,
    `"${n}" quarterly results OR earnings`,

    // CIN search (finds regulatory filings directly)
    ...(company.cin ? [`"${company.cin}"`] : []),

    // Promoter searches
    ...promoters.map((p) => `"${p}"`),
    ...promoters.map((p) => `"${p}" fraud OR arrested OR "ED raid"`),
    ...promoters.map((p) => `"${p}" SEBI OR RBI OR NCLT`),
  ].filter(Boolean);
}

const parser = new RSSParser({
  timeout: 12000,
  headers: { "User-Agent": "Mozilla/5.0 (CreditResearchBot/1.0)" },
});

function isRelevant(text, company) {
  const hay = String(text || "").toLowerCase();
  const terms = [company.name, ...(company.promoters || [])].filter(Boolean).map((t) => String(t).toLowerCase());
  return terms.some((t) => t && hay.includes(t));
}

function toResearchResult({ company, sourceName, sourceUrl, title, snippet, fullText, publishedAt }) {
  const scanText = `${title || ""} ${snippet || ""} ${fullText || ""}`;
  return {
    sourceType: "NEWS",
    sourceName,
    sourceUrl,
    companyId: company.id,
    title: title || "",
    snippet: (snippet || "").slice(0, 500),
    fullText: fullText || snippet || "",
    publishedAt: publishedAt ? new Date(publishedAt) : null,
    riskKeywordsFound: scanRiskKeywords(scanText),
    rawHtml: null,
    scrapedAt: new Date().toISOString(),
  };
}

async function scrapeRSS(company, feedUrls, { logger, reachableSources } = {}) {
  const feeds = feedUrls || RSS_SOURCES;

  const eligibleFeeds = feeds.filter(({ name }) => {
    if (!reachableSources || !reachableSources.size) return true;
    return reachableSources.has(name) || reachableSources.has(`${name} RSS`);
  });

  async function fetchFeed({ name, url }) {
    const out = [];
    const feed = await parser.parseURL(url);
    for (const item of feed.items || []) {
      const title = item.title || "";
      const snippet = item.contentSnippet || item.summary || item.content || "";
      const combined = `${title} ${snippet}`;
      if (!isRelevant(combined, company)) continue;
      const link = item.link || url;
      out.push(
        toResearchResult({
          company,
          sourceName: name,
          sourceUrl: link,
          title,
          snippet,
          fullText: item.content || item["content:encoded"] || snippet,
          publishedAt: item.pubDate || item.isoDate || null,
        })
      );
    }
    return out;
  }

  const feedPromises = eligibleFeeds.map((feed) =>
    fetchFeed(feed).catch((err) => {
      if (logger) logger.warn(`[SCRAPER][RSS] failed: ${feed.name}`, { error: err?.message });
      return [];
    })
  );

  const settled = await Promise.allSettled(feedPromises);
  return settled.flatMap((r) => (r.status === "fulfilled" ? (r.value || []) : []));
}

async function scrapeGoogleNews(company, { logger, reachableSources } = {}) {
  const queries = buildGoogleNewsQueries(company);
  const urls = queries.map((q) => ({ name: "Google News RSS", url: googleNewsSearchURL(q) }));
  return scrapeRSS(company, urls, { logger, reachableSources });
}

module.exports = {
  RSS_SOURCES,
  googleNewsSearchURL,
  buildGoogleNewsQueries,
  scrapeRSS,
  scrapeGoogleNews,
};

