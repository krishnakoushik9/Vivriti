const { probeConnectivity, REACHABLE_SOURCES } = require("./connectivityProbe");
const { scrapeRSS, scrapeGoogleNews, RSS_SOURCES } = require("../scrapers/rss.scraper");

const testCompany = {
  id: "test-001",
  name: "Reliance Industries",
  cin: "L17110MH1973PLC019786",
  promoters: ["Mukesh Ambani"],
  sector: "Petrochemicals",
};

async function main() {
  await probeConnectivity({ force: true });
  console.log("Reachable:", Array.from(REACHABLE_SOURCES));
  const rss = await scrapeRSS(testCompany, RSS_SOURCES, { reachableSources: REACHABLE_SOURCES });
  const gn = await scrapeGoogleNews(testCompany, { reachableSources: REACHABLE_SOURCES });
  console.log("RSS results:", rss.length);
  console.log("Google News results:", gn.length);
  console.log(JSON.stringify([...rss, ...gn].slice(0, 5), null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

