const express = require('express');
const router = express.Router();
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');

const CSV_PATH = '/home/krsna/Desktop/IITH-vivriti/MCA/portaldownloadtelangana.csv';
const API_KEY = '579b464db66ec23bdd000001e55a2b7e099f45e96f171d7ee20c7b5a';
const API_URL = 'https://api.data.gov.in/resource/4dbe5667-7b6b-41d7-82af-211562424d9a';

let localData = [];
let stats = {
  total_companies: 0,
  roc_breakdown: {}
};

/**
 * Load and cache the local CSV on startup
 */
function loadCSV() {
  if (fs.existsSync(CSV_PATH)) {
    const results = [];
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        localData = results;
        stats.total_companies = results.length;
        
        const breakdown = {};
        results.forEach(row => {
          const roc = row.CompanyROCcode || 'Unknown';
          breakdown[roc] = (breakdown[roc] || 0) + 1;
        });
        stats.roc_breakdown = breakdown;
        
        console.log(`[MCA] Successfully loaded ${localData.length} companies from ${CSV_PATH}`);
      })
      .on('error', (err) => {
        console.error('[MCA] Failed to parse CSV:', err.message);
      });
  } else {
    console.error(`[MCA] Local CSV dataset NOT FOUND at ${CSV_PATH}`);
  }
}

loadCSV();

// GET /mca/stats - Returns quick stats from local CSV
router.get('/stats', (req, res) => {
  if (localData.length === 0 && !fs.existsSync(CSV_PATH)) {
    return res.status(404).json({ error: "Local dataset not found", path: CSV_PATH });
  }
  res.json(stats);
});

// GET /mca/search - Search local first, then fallback to API
router.get('/search', async (req, res) => {
  const start = Date.now();
  const q = (req.query.q || '').trim();
  const mode = req.query.localOnly === 'true' ? 'local' : 'hybrid';

  if (!q) {
    return res.json({ source: 'local', results: [], total: 0 });
  }

  // 1. Search Local CSV (case-insensitive partial match)
  const localResults = localData.filter(row => 
    (row.CompanyName || '').toLowerCase().includes(q.toLowerCase()) || 
    (row.CIN || '').toLowerCase().includes(q.toLowerCase())
  );

  if (localResults.length > 0) {
    return res.json({
      source: 'local',
      results: localResults.slice(0, 100).map(r => ({ ...r, source: 'local' })),
      total: localResults.length,
      responseTimeMs: Date.now() - start
    });
  }

  // 2. Fallback to data.gov.in API (if not local-only)
  if (localResults.length === 0 && mode !== 'local') {
    try {
      const params = {
        'api-key': API_KEY,
        'format': 'json',
        'limit': '20',
        'offset': '0',
        'filters[CIN]': q.toUpperCase()  // CIN filter IS supported
      };

      console.log('[MCA SEARCH] Falling back to Live API for CIN:', q.toUpperCase());
      
      const apiRes = await axios.get(API_URL, { 
        params, 
        timeout: 25000,
        headers: { 'Accept': 'application/json' }
      });

      const apiRecords = apiRes.data?.records || [];

      // Normalize API fields to match local CSV shape for consistent UI
      const normalized = apiRecords.map(r => ({
        CIN: r.CIN,
        CompanyName: r.CompanyName,
        CompanyROCcode: r.CompanyROCcode,
        CompanyStatus: r.CompanyStatus,
        CompanyCategory: r.CompanyCategory,
        CompanyClass: r.CompanyClass,
        AuthorizedCapital: r.AuthorizedCapital,
        PaidupCapital: r.PaidupCapital,
        RegistrationDate: r.CompanyRegistrationdate_date,
        RegisteredAddress: r.Registered_Office_Address,
        ListingStatus: r.Listingstatus,
        StateCode: r.CompanyStateCode,
        IndustrialClassification: r.CompanyIndustrialClassification,
        source: 'live-api'
      }));

      return res.json({
        source: 'live-api',
        results: normalized,
        total: apiRes.data?.total || normalized.length,
        responseTimeMs: Date.now() - start
      });

    } catch (apiErr) {
      console.error('[MCA SEARCH FALLBACK ERROR]', apiErr.message);
      return res.status(502).json({
        error: 'Live API fallback failed',
        hint: apiErr.code === 'ECONNABORTED'
          ? 'Timeout — data.gov.in unreachable'
          : `API error: ${apiErr.response?.status || apiErr.message}`,
        results: [],
        total: 0,
        source: 'live-api-error'
      });
    }
  }

  return res.json({ source: 'local', results: [], total: 0 });
});

// GET /mca/live - Proxy to data.gov.in API with response time
router.get('/live', async (req, res) => {
  const start = Date.now();
  const { offset = 0, limit = 100, state = '' } = req.query;

  try {
    const params = {
      'api-key': API_KEY,
      'format': 'json',
      'offset': String(offset),
      'limit': String(limit),
    };

    // CRITICAL: state codes are lowercase full names e.g. "telangana" not "TG"
    // Map short codes to full lowercase names as API expects
    const stateMap = {
      'TG': 'telangana',
      'AP': 'andhra pradesh',
      'MH': 'maharashtra',
      'KA': 'karnataka',
      'DL': 'delhi',
      'TN': 'tamil nadu',
      'GJ': 'gujarat',
      'RJ': 'rajasthan',
      'UP': 'uttar pradesh',
      'WB': 'west bengal',
      'MP': 'madhya pradesh',
      'KL': 'kerala',
      'HR': 'haryana',
      'PB': 'punjab',
      'BR': 'bihar',
      'OR': 'odisha',
    };

    if (state && stateMap[state.toUpperCase()]) {
      params['filters[CompanyStateCode]'] = stateMap[state.toUpperCase()];
    } else if (state && !stateMap[state.toUpperCase()]) {
      // passed as full name already e.g. "telangana"
      params['filters[CompanyStateCode]'] = state.toLowerCase();
    }

    console.log('[MCA LIVE] Fetching:', API_URL, params);

    const response = await axios.get(API_URL, {
      params,
      timeout: 25000,
      headers: { 'Accept': 'application/json' }
    });

    const elapsed = Date.now() - start;
    const records = response.data?.records || [];

    return res.json({
      records,
      total: response.data?.total || 0,
      count: response.data?.count || records.length,
      offset: Number(offset),
      limit: Number(limit),
      responseTimeMs: elapsed,
      source: 'live-api',
      fields: response.data?.field || []
    });

  } catch (err) {
    console.error('[MCA LIVE ERROR]', err.message, err.response?.data);
    return res.status(502).json({
      error: 'Live API unavailable',
      detail: err.message,
      hint: err.code === 'ECONNABORTED'
        ? 'Request timed out — data.gov.in unreachable from this network'
        : err.response?.status === 403
        ? 'API key rejected — regenerate at data.gov.in'
        : `data.gov.in error: ${err.response?.status || 'unknown'}`,
      records: [],
      total: 0,
      responseTimeMs: Date.now() - start
    });
  }
});

module.exports = router;
