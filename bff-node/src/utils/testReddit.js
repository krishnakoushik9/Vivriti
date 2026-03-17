const { probeConnectivity, REACHABLE_SOURCES } = require("./connectivityProbe");
const { scrapeReddit } = require("../scrapers/reddit.scraper");

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
  const out = await scrapeReddit(testCompany, { reachableSources: REACHABLE_SOURCES });
  console.log("Reddit results:", out.length);
  console.log(JSON.stringify(out.slice(0, 5), null, 2));
}

main().catch((e) => {
  console.error(e?.response?.data || e.message);
  process.exit(1);
});

