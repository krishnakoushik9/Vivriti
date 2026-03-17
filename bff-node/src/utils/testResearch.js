const axios = require("axios");

const testCompany = {
  companyId: "test-001",
  companyName: "Reliance Industries",
  cin: "L17110MH1973PLC019786",
  promoters: ["Mukesh Ambani"],
  sector: "Petrochemicals",
};

async function main() {
  const base = process.env.BFF_URL || "http://localhost:3001";
  const r = await axios.post(`${base}/api/research`, testCompany, { timeout: 30000 });
  console.log(JSON.stringify(r.data, null, 2));
}

main().catch((e) => {
  console.error(e?.response?.data || e.message);
  process.exit(1);
});

