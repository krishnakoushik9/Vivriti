// Paste-exact list per spec
const RISK_KEYWORDS = [
  // Financial distress
  "NPA",
  "non-performing",
  "default",
  "write-off",
  "write off",
  "restructured loan",
  "one-time settlement",
  "OTS",
  "moratorium",
  "SARFAESI",
  "DRT",
  "debt recovery tribunal",
  // Insolvency
  "NCLT",
  "insolvency",
  "IBC",
  "liquidation",
  "winding up",
  "NCLAT",
  "corporate insolvency",
  "resolution professional",
  "CIRP",
  // Regulatory
  "SEBI notice",
  "SEBI order",
  "RBI penalty",
  "RBI action",
  "show cause",
  "debarred",
  "suspended",
  "cancelled licence",
  "PCA framework",
  "prompt corrective action",
  // Fraud / Criminal
  "fraud",
  "scam",
  "money laundering",
  "ED raid",
  "Enforcement Directorate",
  "CBI investigation",
  "FIR registered",
  "chargesheet",
  "arrested",
  "absconding",
  "lookout notice",
  "hawala",
  "benami",
  // Operational red flags
  "plant shutdown",
  "factory closed",
  "factory sealed",
  "labour strike",
  "capacity underutilization",
  "power disconnected",
  "sealed premises",
  // Promoter red flags
  "promoter pledge",
  "promoter sold shares",
  "insider trading",
  "related party",
  "siphoning",
  "diversion of funds",
];

function scanRiskKeywords(text) {
  const lower = String(text || "").toLowerCase();
  return RISK_KEYWORDS.filter((k) => lower.includes(k.toLowerCase()));
}

function getRiskLevel(keywords) {
  const HIGH_RISK = [
    "fraud",
    "arrested",
    "NCLT",
    "insolvency",
    "ED raid",
    "CBI investigation",
    "absconding",
    "liquidation",
    "FIR",
  ];
  const list = Array.isArray(keywords) ? keywords : [];
  if (list.some((k) => HIGH_RISK.some((h) => String(k).toLowerCase().includes(String(h).toLowerCase())))) return "HIGH";
  if (list.length >= 3) return "MEDIUM";
  if (list.length >= 1) return "LOW";
  return "NONE";
}

module.exports = { RISK_KEYWORDS, scanRiskKeywords, getRiskLevel };

