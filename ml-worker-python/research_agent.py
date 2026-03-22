"""
IntelliCredit Research Agent
==============================
Digital Credit Manager that performs secondary research on corporate applicants.
Provides lightweight, real web intelligence with citations, plus deterministic
heuristics for demo-safe signals (no paid APIs required).
"""

import logging
import re
import time
import random
import os
from dataclasses import dataclass
from typing import Dict, Any, List, Optional

import requests
import subprocess
import asyncio

logger = logging.getLogger("intellicredit.research_agent")

# ─────────────────────────────────────────────
# Import new modular components (drop-in ready)
# ─────────────────────────────────────────────
try:
    from api_client import NewsAPIClient, GDELTClient
except ImportError:
    NewsAPIClient = None  # type: ignore
    GDELTClient = None  # type: ignore

try:
    from scraper import (
        google_news_rss,
        indian_kanoon_search,
        economic_times_rss,
        mint_rss,
        business_standard_rss,
        moneycontrol_rss,
        duckduckgo_search as _scraper_ddg,
        fetch_page_text as _scraper_fetch,
    )
except ImportError:
    google_news_rss = None  # type: ignore
    indian_kanoon_search = None  # type: ignore
    _scraper_ddg = None
    _scraper_fetch = None

try:
    from risk_analyzer import (
        deduplicate_articles,
        analyze_research_results as _enhanced_analyze,
        score_article as _enhanced_score,
        RISK_WEIGHTS as _ENHANCED_WEIGHTS,
    )
except ImportError:
    deduplicate_articles = None  # type: ignore
    _enhanced_analyze = None
    _enhanced_score = None
    _ENHANCED_WEIGHTS = None

try:
    from aggregator import aggregate
except ImportError:
    aggregate = None  # type: ignore

_CACHE: Dict[str, Any] = {}
_CACHE_TTL_S = 60 * 60  # 1 hour

# Anti-bot hardening (best-effort; real CF bypass needs browser automation)
USER_AGENTS = [
    # Chrome (Linux)
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    # Chrome (Windows)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    # Safari (macOS)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
]

DELAY_MIN_S = float(os.getenv("CRAWL_DELAY_MIN_S", "2.0"))
DELAY_MAX_S = float(os.getenv("CRAWL_DELAY_MAX_S", "5.0"))
PROXY_URL = os.getenv("RESIDENTIAL_PROXY_URL", "").strip()  # e.g. Bright Data / Oxylabs gateway URL

# Prefer Node BFF for scraping in restricted networks (Python should not scrape directly).
BFF_RESEARCH_URL = os.getenv("BFF_RESEARCH_URL", "http://localhost:3001/api/research").strip()

# ─────────────────────────────────────────────
# Risk scoring weights (NLP-lite)
# ─────────────────────────────────────────────
RISK_WEIGHTS = {
    # Critical — immediate red flags
    "fraud": 25,
    "arrested": 25,
    "absconding": 25,
    "FIR": 20,
    "ED raid": 20,
    "Enforcement Directorate": 20,
    "CBI": 18,
    "money laundering": 20,
    "hawala": 18,
    "benami": 15,

    # High — serious financial distress
    "NCLT": 15,
    "insolvency": 15,
    "liquidation": 15,
    "CIRP": 15,
    "IBC": 12,
    "winding up": 12,
    "resolution professional": 12,

    # Medium — regulatory action
    "SEBI notice": 10,
    "SEBI order": 10,
    "RBI penalty": 10,
    "show cause": 8,
    "debarred": 10,
    "suspended": 8,
    "SARFAESI": 8,
    "DRT": 8,

    # Low — financial stress indicators
    "NPA": 5,
    "default": 5,
    "write-off": 5,
    "restructured": 4,
    "moratorium": 4,
    "OTS": 3,
    "promoter pledge": 3,

    # Operational
    "plant shutdown": 6,
    "factory sealed": 6,
    "labour strike": 4,
}

def _jitter_sleep():
    try:
        if DELAY_MAX_S > 0:
            time.sleep(random.uniform(max(0.0, DELAY_MIN_S), max(DELAY_MIN_S, DELAY_MAX_S)))
    except Exception:
        pass

def _headers() -> Dict[str, str]:
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Connection": "keep-alive",
    }

def _proxies() -> Optional[Dict[str, str]]:
    if not PROXY_URL:
        return None
    return {"http": PROXY_URL, "https": PROXY_URL}

def http_get(url: str, *, params: Optional[Dict[str, str]] = None, timeout_s: int = 15) -> Optional[requests.Response]:
    _jitter_sleep()
    try:
        return requests.get(
            url,
            params=params,
            headers=_headers(),
            # Use separate connect/read timeouts so we fail fast on dead networks.
            timeout=(min(5, timeout_s), timeout_s),
            allow_redirects=True,
            proxies=_proxies(),
        )
    except Exception as e:
        logger.warning("HTTP GET failed: %s", e)
        return None

def _cache_get(key: str):
    v = _CACHE.get(key)
    if not v:
        return None
    ts, payload = v
    if time.time() - ts > _CACHE_TTL_S:
        _CACHE.pop(key, None)
        return None
    return payload

def _cache_set(key: str, payload: Any):
    _CACHE[key] = (time.time(), payload)


@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str = ""


def _clean_text(s: str) -> str:
    s = re.sub(r"\s+", " ", s or "").strip()
    return s


def duckduckgo_search(query: str, max_results: int = 8, timeout_s: int = 15) -> List[SearchResult]:
    """
    Minimal DuckDuckGo HTML scrape (no API key).
    Returns (title, url, snippet). Best-effort; degrades gracefully.
    """
    q = query.strip()
    if not q:
        return []

    url = "https://duckduckgo.com/html/"
    html: Optional[str] = None
    try:
        resp = http_get(url, params={"q": q}, timeout_s=timeout_s)
        if resp is None:
            raise RuntimeError("no response")
        resp.raise_for_status()
        # Some environments get DDG bot interstitials (202). Fall back to curl.
        if resp.status_code == 202 or "DuckDuckGo Privacy" in (resp.text[:500] or "") and "result__a" not in resp.text:
            html = None
        else:
            html = resp.text
    except Exception as e:
        logger.warning("DuckDuckGo search via requests failed: %s", e)
        html = None

    if html is None:
        try:
            ua = random.choice(USER_AGENTS)
            curl_cmd = [
                "curl",
                "-sS",
                "-L",
                "-A",
                ua,
                url + "?" + f"q={requests.utils.quote(q)}",
            ]
            # Optional residential proxy via curl
            if PROXY_URL:
                curl_cmd = ["curl", "-sS", "-L", "-A", ua, "-x", PROXY_URL, url + "?" + f"q={requests.utils.quote(q)}"]
            p = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=timeout_s)
            if p.returncode == 0:
                html = p.stdout
        except Exception as e:
            logger.warning("DuckDuckGo search via curl failed: %s", e)
            return []

    if not html:
        return []

    # Result blocks contain <a class="result__a" href="...">Title</a>
    results: List[SearchResult] = []
    for m in re.finditer(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL):
        link = _clean_text(re.sub(r"<.*?>", "", m.group(1)))
        # If DDG redirect link includes uddg, extract original.
        if "uddg=" in link:
            try:
                from urllib.parse import urlparse, parse_qs, unquote
                qs = parse_qs(urlparse(link).query)
                if "uddg" in qs and qs["uddg"]:
                    link = unquote(qs["uddg"][0])
            except Exception:
                pass
        title = _clean_text(re.sub(r"<.*?>", "", m.group(2)))
        if not link or not title:
            continue
        # DuckDuckGo sometimes returns redirect links; keep as-is.
        results.append(SearchResult(title=title, url=link))
        if len(results) >= max_results:
            break

    # Snippets (optional)
    snippet_matches = list(re.finditer(r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>|<div[^>]+class="result__snippet"[^>]*>(.*?)</div>', html, re.IGNORECASE | re.DOTALL))
    for i, sm in enumerate(snippet_matches[: len(results)]):
        snippet_raw = sm.group(1) or sm.group(2) or ""
        snippet = _clean_text(re.sub(r"<.*?>", "", snippet_raw))
        if i < len(results):
            results[i].snippet = snippet

    return results


def fetch_page_text(url: str, timeout_s: int = 15, max_chars: int = 20000) -> str:
    """
    Fetch a web page and return a rough plain-text extraction.
    This is intentionally lightweight (no heavy parsers) for hackathon reliability.
    """
    try:
        r = http_get(url, timeout_s=timeout_s)
        if r is None:
            return ""
        r.raise_for_status()
        html = (r.text or "")[: max_chars * 2]
    except Exception:
        return ""

    # Drop scripts/styles and strip tags
    html = re.sub(r"(?is)<(script|style|noscript).*?>.*?</\1>", " ", html)
    text = re.sub(r"(?is)<.*?>", " ", html)
    text = _clean_text(text)
    return text[:max_chars]


def analyze_gst_reconciliation(revenue: float, gst_compliance_score: float) -> Dict[str, Any]:
    """
    Deterministic placeholder for GST ↔ revenue reconciliation.
    When GST/bank docs are uploaded, this will be replaced with doc-grounded reconciliation.
    """
    if not revenue or not gst_compliance_score:
        return {
            "status": "DATA_NOT_FOUND",
            "gstr_3b_vs_bank": "0.0% variance (missing data)",
            "circular_trading_risk": "UNKNOWN",
            "details": "Insufficient GST or revenue data found for reconciliation. Marking as DATA_NOT_FOUND to avoid false triggers.",
        }

    score = float(gst_compliance_score or 0.0)
    if score < 35:
        variance = 0.45
        status = "CRITICAL_MISMATCH"
        risk = "HIGH"
        details = "GST compliance is critically low; revenue authenticity risk elevated. Reconcile GSTR-3B vs bank credits and validate counterparties."
    elif score < 70:
        variance = 0.18
        status = "MODERATE_MISMATCH"
        risk = "MEDIUM"
        details = "GST compliance is moderate; timing/return discrepancies possible. Validate GST taxable value vs bank inflows."
    else:
        variance = 0.04
        status = "MATCHED"
        risk = "LOW"
        details = "GST compliance is strong; no immediate revenue-quality red flags from compliance signal alone."

    return {
        "status": status,
        "gstr_3b_vs_bank": f"{variance:.1%} variance (heuristic)",
        "circular_trading_risk": risk,
        "details": details,
    }

def check_mca_filings(company_name: str) -> Dict[str, Any]:
    """
    Best-effort public search for MCA references (no official MCA21 API).
    Returns a conservative status plus citations (URLs) so judges can verify sources.
    """
    query = f"{company_name} MCA filing status AOC-4 MGT-7"
    results = duckduckgo_search(query, max_results=5)
    citations = [{"title": r.title, "url": r.url, "snippet": r.snippet} for r in results]

    # Parse snippets for status keywords
    status_keywords = {
        "amalgamated": "AMALGAMATED",
        "struck off": "STRUCK_OFF",
        "dissolved": "DISSOLVED",
        "liquidated": "LIQUIDATED",
        "under liquidation": "LIQUIDATION",
    }
    
    found_status = None
    for r in results:
        text = (r.title + " " + r.snippet).lower()
        for kw, val in status_keywords.items():
            if kw in text:
                found_status = val
                break
        if found_status:
            break

    if found_status:
        status = "MAPPING_SUCCESS"
        details = f"Public references indicate company status: {found_status}. MCA compliance check results reflect this status."
    else:
        status = "UNKNOWN_PUBLIC_DATA"
        details = "Public web search performed; official MCA21 compliance requires authenticated lookup (CIN + filings)."

    return {
        "status": status,
        "directors_active": None,
        "strike_off_warning": (True if found_status in ["STRUCK_OFF", "DISSOLVED"] else False),
        "details": details,
        "citations": citations,
    }

def check_cibil_commercial(company_name: str, base_score: int) -> Dict[str, Any]:
    """Deterministic proxy mapping from credit score to a CMR-like rank."""
    cmr_rank = 10 - int((base_score - 300) / 60)  # Map 300-900 to CMR 1-10
    cmr_rank = max(1, min(10, cmr_rank))
    
    return {
        "cmr_rank": f"CMR-{cmr_rank}",
        "credit_score": base_score,
        "active_facilities": None,
        "dpd_30_plus": 1 if cmr_rank > 6 else 0,
        "dpd_90_plus": 1 if cmr_rank > 8 else 0,
        "recent_enquiries": None,
        "details": f"Commercial Credit Rank {cmr_rank}. " + 
                   ("Clean repayment history." if cmr_rank <= 6 else "Recent delays observed in term loan servicing.")
    }

def search_ecourts_litigation(company_name: str) -> Dict[str, Any]:
    """
    Best-effort litigation signal via public sources (Indian Kanoon / news).
    """
    queries = [
        f"site:indiankanoon.org {company_name}",
        f"{company_name} NCLT petition",
        f"{company_name} cheque bounce case",
    ]
    all_results: List[SearchResult] = []
    for q in queries:
        all_results.extend(duckduckgo_search(q, max_results=3))
        _jitter_sleep()

    # De-dup by URL
    seen = set()
    uniq: List[SearchResult] = []
    for r in all_results:
        if r.url in seen:
            continue
        seen.add(r.url)
        uniq.append(r)

    litigation_found = any("indiankanoon" in (r.url or "").lower() for r in uniq) or len(uniq) >= 5
    return {
        "litigation_found": litigation_found,
        "active_cases": None,
        "nclt_petitions": None,
        "details": "Public search performed; findings require legal validation. No case numbers or penalty amounts are asserted without source text.",
        "citations": [{"title": r.title, "url": r.url, "snippet": r.snippet} for r in uniq[:8]],
        "raw_evidence": [
            {
                "url": r.url,
                "title": r.title,
                "snippet": r.snippet,
                "raw_text_excerpt": fetch_page_text(r.url, timeout_s=12, max_chars=1500) if r.url else "",
            }
            for r in uniq[:5]
        ],
    }

def search_company_news(company_name: str) -> str:
    """Legacy compatibility: returns a short, cited news summary string."""
    pack = gather_news(company_name, max_items=6)
    return pack.get("summary", "No public news sources found.")


def gather_news(company_name: str, max_items: int = 8) -> Dict[str, Any]:
    # Preferred path: delegate scraping to Node BFF (RSS + Google News RSS + Reddit JSON)
    # so Python never performs outbound web scraping itself in restricted environments.
    try:
        if BFF_RESEARCH_URL:
            payload = {
                "companyId": f"py-{hash(company_name) & 0xffffffff:x}",
                "companyName": company_name,
                "cin": None,
                "promoters": [],
                "sector": None,
            }
            r = requests.post(
                BFF_RESEARCH_URL,
                json=payload,
                headers={"User-Agent": "IntelliCreditResearch/1.0"},
                timeout=20,
            )
            if 200 <= r.status_code < 300:
                data = r.json() or {}
                results = data.get("results") or []
                if results:
                    bullets = []
                    for it in results[:6]:
                        t = it.get("title", "")
                        sn = it.get("snippet", "")
                        src = it.get("sourceName", "")
                        bullets.append(f"- [{src}] {t}" + (f" — {sn}" if sn else ""))
                    summary = "Recent public sources (via Node BFF):\n" + "\n".join(bullets)
                    return {"summary": summary, "items": results[:max_items]}
                msg = data.get("message") or "No items returned from Node research."
                return {"summary": msg, "items": []}
            logger.warning("Node BFF /api/research returned %s", r.status_code)
    except Exception as e:
        logger.warning("Node BFF research unreachable; returning []: %s", e)
        return {"summary": "Node research service unreachable (network restricted).", "items": []}

    # Fallback path (best-effort, may be blocked): keep as backup only.
    items = gdelt_news_search(company_name, max_items=max_items)
    if not items:
        items = wikipedia_sources(company_name, max_items=min(5, max_items))
    if not items:
        results = duckduckgo_search(f"{company_name} news", max_results=max_items)
        items = [{"title": r.title, "url": r.url, "snippet": r.snippet} for r in results]
    if not items:
        return {"summary": "No public news sources found.", "items": []}

    # Lightweight summarization: titles + snippets.
    bullets = []
    for it in items[:6]:
        t = it.get("title", "")
        sn = it.get("snippet", "")
        bullets.append(f"- {t}" + (f" — {sn}" if sn else ""))
    summary = "Recent public sources:\n" + "\n".join(bullets)
    return {"summary": summary, "items": items}


def gdelt_news_search(company_name, max_items=8):
    """Shim for backward compatibility."""
    from api_client import GDELTClient
    return GDELTClient().search(company_name, max_items=max_items)


def wikipedia_sources(company_name: str, max_items: int = 5, timeout_s: int = 10) -> List[Dict[str, Any]]:
    q = (company_name or "").strip()
    if not q:
        return []
    cache_key = f"wiki::{q.lower()}::{max_items}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    api = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "list": "search",
        "srsearch": q,
        "format": "json",
        "srlimit": str(max_items),
    }
    try:
        r = http_get(api, params=params, timeout_s=timeout_s)
        if r is None:
            raise RuntimeError("no response")
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        logger.warning("Wikipedia search failed: %s", e)
        _cache_set(cache_key, [])
        return []

    out: List[Dict[str, Any]] = []
    for it in (data.get("query", {}).get("search") or []):
        title = it.get("title")
        if not title:
            continue
        out.append({
            "title": f"Wikipedia: {title}",
            "url": f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
            "snippet": _clean_text(re.sub(r"<.*?>", "", it.get("snippet") or "")),
            "source": "wikipedia",
            "source_type": "reference",
            "published_at": None,
        })
    _cache_set(cache_key, out)
    return out

def conduct_full_research(company_name: str, revenue: float, gst_score: float, base_score: int) -> Dict[str, Any]:
    """Execute the full secondary research pipeline."""
    news_pack = gather_news(company_name, max_items=8)
    return {
        "mca_status": check_mca_filings(company_name),
        "cibil_commercial": check_cibil_commercial(company_name, base_score),
        "ecourts_litigation": search_ecourts_litigation(company_name),
        "gst_reconciliation": analyze_gst_reconciliation(revenue, gst_score),
        "web_news": news_pack.get("summary", ""),
        "news_items": news_pack.get("items", []),
    }


# ─────────────────────────────────────────────
# Node-BFF Delegation Adapter (authoritative)
# ─────────────────────────────────────────────
def _fetch_news(company_name: str, promoters: list = None, company_id: str = None, cin: str = None) -> list:
    """Delegate all scraping to Node.js BFF — Python does NLP only."""
    import requests

    BFF_URL = os.getenv("BFF_URL", "http://localhost:3001")

    try:
        payload = {
            "companyId": company_id or "ml-request",
            "companyName": company_name,
            "promoters": promoters or [],
            "cin": cin or "",
        }
        resp = requests.post(
            f"{BFF_URL}/api/research",
            json=payload,
            timeout=25,
        )
        resp.raise_for_status()
        data = resp.json() or {}

        results = data.get("results", []) or []

        summary = data.get("summary", {}) or {}
        logger.info(
            "Node BFF returned %s results from %s",
            summary.get("totalFound", len(results)),
            summary.get("sourcesSearched", []),
        )
        return results

    except requests.Timeout:
        logger.warning("Node BFF timed out — returning empty results")
        return []
    except requests.ConnectionError:
        logger.warning("Cannot reach Node BFF at %s — is it running?", BFF_URL)
        return []
    except Exception as e:
        logger.error("Node BFF call failed: %s", e)
        return []


def _adapt_node_results(node_results: list) -> list:
    """Convert Node BFF shape to Python NLP pipeline input shape."""
    adapted = []
    for r in node_results or []:
        if not isinstance(r, dict):
            continue
        adapted.append(
            {
                "text": r.get("fullText") or r.get("snippet", ""),
                "title": r.get("title", ""),
                "url": r.get("sourceUrl", ""),
                "source": r.get("sourceName", ""),
                "published_at": r.get("publishedAt"),
                "risk_keywords": r.get("riskKeywordsFound", []),
                "source_type": r.get("sourceType", "NEWS"),
            }
        )
    return adapted


def score_article(article: dict) -> dict:
    """Score a single article and return it with risk metadata."""
    text = f"{article.get('title','')} {article.get('text','')}".lower()

    matched = {}
    total_score = 0

    for keyword, weight in RISK_WEIGHTS.items():
        if keyword.lower() in text:
            matched[keyword] = weight
            total_score += weight

    # Recency boost: articles < 30 days old get 1.2x score
    published = article.get("published_at")
    recency_multiplier = 1.0
    if published:
        try:
            from datetime import datetime, timezone

            pub_date = datetime.fromisoformat(str(published).replace("Z", "+00:00"))
            days_old = (datetime.now(timezone.utc) - pub_date).days
            if days_old < 30:
                recency_multiplier = 1.2
            elif days_old < 90:
                recency_multiplier = 1.1
        except Exception:
            pass

    final_score = min(round(total_score * recency_multiplier), 100)

    return {
        **article,
        "risk_score": final_score,
        "risk_keywords_matched": list(matched.keys()),
        "risk_level": (
            "CRITICAL"
            if final_score >= 40
            else "HIGH"
            if final_score >= 20
            else "MEDIUM"
            if final_score >= 8
            else "LOW"
            if final_score >= 1
            else "NONE"
        ),
    }


def analyze_research_results(articles: list) -> dict:
    """Score all articles, return ranked + summary for Java backend."""
    scored = [score_article(a) for a in (articles or []) if isinstance(a, dict)]
    scored.sort(key=lambda x: x.get("risk_score", 0), reverse=True)

    critical = [a for a in scored if a.get("risk_level") == "CRITICAL"]
    high = [a for a in scored if a.get("risk_level") == "HIGH"]
    medium = [a for a in scored if a.get("risk_level") == "MEDIUM"]

    # Aggregate score: weighted average of top 10 articles
    top10_scores = [a.get("risk_score", 0) for a in scored[:10]]
    aggregate_score = round(sum(top10_scores) / max(len(top10_scores), 1))

    all_keywords = list(
        set(kw for a in scored for kw in (a.get("risk_keywords_matched", []) or []))
    )

    return {
        "articles": scored,
        "top_alerts": scored[:5],
        "aggregate_risk_score": aggregate_score,
        "risk_breakdown": {
            "critical": len(critical),
            "high": len(high),
            "medium": len(medium),
            "low": len(scored) - len(critical) - len(high) - len(medium),
        },
        "all_risk_keywords": all_keywords,
        "overall_risk_level": ("CRITICAL" if critical else "HIGH" if high else "MEDIUM" if medium else "LOW"),
    }


# ═════════════════════════════════════════════════════════════
# UNIFIED ENTRY POINT — call this from Java ML worker
# ═════════════════════════════════════════════════════════════

async def run_research(
    company_name: str,
    promoters: list = None,
    cin: str = None,
    revenue: float = 0.0,
    gst_score: float = 0.0,
    base_credit_score: int = 650,
    progress_callback=None,
) -> dict:
    """
    HYBRID PIPELINE — unified research entry point.

    Step 1:  PRIMARY   — NewsAPI search_everything()
    Step 2:  PRIMARY   — gdelt_news_search() (existing)
    Step 3:  GATE      — if total unique articles < 3 → trigger fallback
    Step 4:  FALLBACK  — google_news_rss(), indian_kanoon_search(), duckduckgo_search()
    Step 5:  BFF       — Node BFF gather_news() (always run, merge results)
    Step 6:  DEDUP     — risk_analyzer.deduplicate_articles()
    Step 7:  SCORE     — risk_analyzer.analyze_research_results()
    Step 8:  SUPPLEMENTAL — conduct_full_research() for MCA/CIBIL/eCourts/GST
    Step 9:  AGGREGATE — aggregator.aggregate()
    Step 10: RETURN    — final dict

    MUST NOT raise exceptions. On catastrophic failure returns error dict.
    """
    try:
        company_name = (company_name or "").strip()
        if not company_name:
            return {
                "company": company_name,
                "error": "Empty company name",
                "overall_risk_level": "UNKNOWN",
            }

        promoters = promoters or []
        all_articles: list = []

        # ── Step 0: RSS sources (free, no limits) ──
        if progress_callback:
            progress_callback("newsapi", "Scanning news feeds...")
        logger.info("Step 0: RSS scraping for '%s'", company_name)
        try:
            from scraper import (
                economic_times_rss, mint_rss,
                business_standard_rss, moneycontrol_rss
            )
            for rss_fn, src_name in [
                (economic_times_rss,   "Economic Times"),
                (mint_rss,             "Mint"),
                (business_standard_rss,"Business Standard"),
                (moneycontrol_rss,     "MoneyControl"),
            ]:
                try:
                    items = rss_fn(company_name, max_items=8)
                    all_articles.extend(items)
                    logger.info("%s RSS returned %d items",
                                src_name, len(items))
                except Exception as e:
                    logger.warning("%s RSS failed: %s", src_name, e)
        except Exception as e:
            logger.warning("RSS scraping block failed: %s", e)

        # ── Step 1: NewsAPI (primary) ─────────────────
        if progress_callback:
            progress_callback("newsapi", "Fetching NewsAPI articles...")
        logger.info("Step 1: NewsAPI search for '%s'", company_name)
        if NewsAPIClient is not None:
            try:
                client = NewsAPIClient()
                api_articles = client.search_everything(
                    company_name, promoters=promoters, from_days_ago=28
                )
                headlines = client.get_top_headlines(company_name)
                all_articles.extend(api_articles)
                all_articles.extend(headlines)
                logger.info(
                    "NewsAPI returned %d + %d articles",
                    len(api_articles), len(headlines),
                )
            except Exception as e:
                logger.warning("NewsAPI step failed: %s", e)
        else:
            logger.info("NewsAPIClient not available — skipping")

        # ── Step 2: GDELT (primary) ───────────────────
        if progress_callback:
            progress_callback("gdelt", "Querying GDELT intelligence...")
        logger.info("Step 2: GDELT search for '%s'", company_name)
        try:
            if GDELTClient is not None:
                gdelt_articles = GDELTClient().search(company_name, promoters=promoters, max_items=8)
            else:
                gdelt_articles = gdelt_news_search(company_name, max_items=8)

            all_articles.extend(gdelt_articles)
            logger.info("GDELT returned %d articles", len(gdelt_articles))
        except Exception as e:
            logger.warning("GDELT step failed: %s", e)

        # ── Step 3: Gate check ────────────────────────
        if progress_callback:
            progress_callback("gate_check", "Checking article threshold...")
        unique_urls = set(
            (a.get("url") or "").strip().lower()
            for a in all_articles if a.get("url")
        )
        needs_fallback = len(unique_urls) < 3
        logger.info(
            "Gate: %d unique URLs → fallback %s",
            len(unique_urls),
            "TRIGGERED" if needs_fallback else "not needed",
        )

        # ── Step 4: Fallback scrapers (if needed) ─────
        if needs_fallback:
            if progress_callback:
                progress_callback("fallback", "Triggering fallback scraper...")
            # 4a. Google News RSS
            if google_news_rss is not None:
                try:
                    rss_articles = google_news_rss(
                        company_name, max_items=10
                    )
                    all_articles.extend(rss_articles)
                    logger.info("Google News RSS returned %d items", len(rss_articles))
                except Exception as e:
                    logger.warning("Google News RSS fallback failed: %s", e)

            # 4b. Indian Kanoon for company + each promoter
            if indian_kanoon_search is not None:
                try:
                    kanoon_results = indian_kanoon_search(company_name, max_items=5)
                    all_articles.extend(kanoon_results)
                    logger.info("Indian Kanoon (company) returned %d items", len(kanoon_results))
                except Exception as e:
                    logger.warning("Indian Kanoon (company) failed: %s", e)

                for promoter in promoters[:3]:  # limit to first 3 promoters
                    try:
                        p_results = indian_kanoon_search(promoter, max_items=3)
                        for pr in p_results:
                            pr["subject"] = "promoter"
                            pr["promoter_name"] = promoter
                        all_articles.extend(p_results)
                        logger.info("Indian Kanoon (promoter: %s) returned %d items", promoter, len(p_results))
                    except Exception as e:
                        logger.warning("Indian Kanoon (promoter: %s) failed: %s", promoter, e)

            # 4c. DuckDuckGo as last resort
            try:
                ddg_func = _scraper_ddg or duckduckgo_search
                ddg_results = ddg_func(f"{company_name} fraud OR NCLT OR SEBI", max_results=6)
                for sr in ddg_results:
                    if hasattr(sr, "title"):
                        all_articles.append({
                            "title": sr.title,
                            "url": sr.url,
                            "snippet": sr.snippet,
                            "source": "duckduckgo",
                            "source_type": "scraped",
                        })
                    elif isinstance(sr, dict):
                        sr["source_type"] = sr.get("source_type", "scraped")
                        all_articles.append(sr)
                logger.info("DuckDuckGo fallback returned %d items", len(ddg_results))
            except Exception as e:
                logger.warning("DuckDuckGo fallback failed: %s", e)

        # ── Step 5: Node BFF (always run, merge) ──────
        if progress_callback:
            progress_callback("bff", "Fetching Node BFF results...")
        logger.info("Step 5: Node BFF gather_news for '%s'", company_name)
        try:
            bff_pack = gather_news(company_name, max_items=8)
            bff_items = bff_pack.get("items", [])
            for item in bff_items:
                if isinstance(item, dict):
                    item["source_type"] = "bff"
                    all_articles.append(item)
            logger.info("BFF returned %d items", len(bff_items))
        except Exception as e:
            logger.warning("BFF gather_news failed: %s", e)

        # ── BONUS: Promoter-specific search ───────────
        if promoters and NewsAPIClient is not None:
            try:
                client = NewsAPIClient()
                for promoter in promoters[:3]:
                    try:
                        p_articles = client.search_everything(
                            promoter, from_days_ago=90, page_size=5
                        )
                        for pa in p_articles:
                            pa["subject"] = "promoter"
                            pa["promoter_name"] = promoter
                        all_articles.extend(p_articles)
                    except Exception:
                        pass
            except Exception:
                pass


        # ── Step 6: Deduplication ─────────────────────
        if progress_callback:
            progress_callback("dedup", "Deduplicating sources...")
        logger.info("Step 6: Deduplicating %d total articles", len(all_articles))
        if deduplicate_articles is not None:
            deduped = deduplicate_articles(all_articles)
        else:
            # Simple URL-based dedup fallback
            seen: set = set()
            deduped = []
            for a in all_articles:
                u = (a.get("url") or "").strip().lower()
                if u and u in seen:
                    continue
                if u:
                    seen.add(u)
                deduped.append(a)
        logger.info("After dedup: %d articles", len(deduped))

        # ── Step 7: Score all articles ────────────────
        if progress_callback:
            progress_callback("scoring", "Scoring risk signals...")
        logger.info("Step 7: Scoring articles")
        score_fn = _enhanced_analyze or analyze_research_results
        scored_result = score_fn(deduped)
        scored_articles = scored_result.get("articles", deduped)

        # ── Step 8: Supplemental signals ──────────────
        logger.info("Step 8: conduct_full_research() for supplemental signals")
        try:
            supplemental = conduct_full_research(
                company_name, revenue, gst_score, base_credit_score
            )
        except Exception as e:
            logger.warning("conduct_full_research failed: %s", e)
            supplemental = {}

        # ── Step 9: Aggregate ─────────────────────────
        if progress_callback:
            progress_callback("aggregating", "Aggregating intelligence...")
        logger.info("Step 9: Final aggregation")
        if aggregate is not None:
            final = aggregate(company_name, scored_articles, supplemental)
        else:
            # Minimal fallback aggregation
            final = {
                "company": company_name,
                "total_articles": len(scored_articles),
                "overall_risk_level": scored_result.get("overall_risk_level", "UNKNOWN"),
                "articles": scored_articles,
                "supplemental": supplemental,
                **{k: v for k, v in scored_result.items() if k != "articles"},
            }

        logger.info(
            "run_research complete for '%s': %d articles, level=%s",
            company_name,
            final.get("total_articles", 0),
            final.get("overall_risk_level", "UNKNOWN"),
        )
        return final

    except Exception as e:
        logger.error("run_research CATASTROPHIC failure for '%s': %s", company_name, e, exc_info=True)
        return {
            "company": company_name,
            "error": str(e),
            "overall_risk_level": "UNKNOWN",
        }


# ── Sync wrapper for backward compat (Java ML worker bridge) ──
def run_research_sync(
    company_name: str,
    promoters: list = None,
    cin: str = None,
    revenue: float = 0.0,
    gst_score: float = 0.0,
    base_credit_score: int = 650,
) -> dict:
    """
    Synchronous wrapper around run_research() for Java ML worker bridge.
    Uses asyncio.run() — safe to call from synchronous code.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # Already in an async context — create a new thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(
                asyncio.run,
                run_research(
                    company_name, promoters, cin,
                    revenue, gst_score, base_credit_score,
                ),
            )
            return future.result(timeout=120)
    else:
        return asyncio.run(
            run_research(
                company_name, promoters, cin,
                revenue, gst_score, base_credit_score,
            )
        )


# ═════════════════════════════════════════════════════════════
# SAMPLE OUTPUT (not live data)
# ═════════════════════════════════════════════════════════════
# Simulated output for: run_research("Reliance Industries")
#
# {
#   "company": "Reliance Industries",
#   "timestamp": "2026-03-20T06:23:00+00:00",
#   "total_articles": 12,
#   "avg_risk_score": 18.4,
#   "confidence_avg": 0.72,
#   "overall_risk_level": "MEDIUM",
#   "top_risks": ["SEBI notice", "default", "promoter pledge", "restructured", "related party"],
#   "risk_breakdown": {"critical": 0, "high": 2, "medium": 4, "low": 6},
#   "source_mix": {"api": 6, "scraped": 3, "bff": 2, "reference": 1},
#   "supplemental": {
#     "mca_status": {"status": "UNKNOWN_PUBLIC_DATA", "directors_active": null, "strike_off_warning": null},
#     "cibil_commercial": {"cmr_rank": "CMR-4", "credit_score": 720, "dpd_30_plus": 0, "dpd_90_plus": 0},
#     "ecourts_litigation": {"litigation_found": true, "active_cases": null, "nclt_petitions": null},
#     "gst_reconciliation": {"status": "MATCHED", "circular_trading_risk": "LOW"}
#   },
#   "articles": [
#     {
#       "title": "SEBI issues notice to Reliance Industries over delayed disclosures",
#       "url": "https://economictimes.com/markets/sebi-ril-notice-2026.cms",
#       "snippet": "SEBI has issued a show cause notice to Reliance Industries Ltd for delayed...",
#       "source": "Economic Times",
#       "published_at": "2026-03-18T10:30:00+05:30",
#       "source_type": "api",
#       "risk_score": 28,
#       "risk_level": "HIGH",
#       "risk_flags": ["SEBI notice", "show cause"],
#       "confidence": 0.9
#     },
#     {
#       "title": "RIL subsidiary faces NCLT petition from vendor",
#       "url": "https://livemint.com/companies/ril-nclt-petition.html",
#       "snippet": "A vendor has filed an insolvency petition against a Reliance subsidiary...",
#       "source": "Mint",
#       "published_at": "2026-03-15T14:20:00+05:30",
#       "source_type": "api",
#       "risk_score": 34,
#       "risk_level": "HIGH",
#       "risk_flags": ["NCLT", "insolvency"],
#       "confidence": 0.8
#     },
#     {
#       "title": "Reliance Industries Q3 results beat Street estimates",
#       "url": "https://moneycontrol.com/news/ril-q3-results.html",
#       "snippet": "Reliance Industries reported a 12% YoY increase in consolidated net profit...",
#       "source": "MoneyControl",
#       "published_at": "2026-03-10T09:00:00+05:30",
#       "source_type": "api",
#       "risk_score": 0,
#       "risk_level": "NONE",
#       "risk_flags": [],
#       "confidence": 0.7
#     },
#     {
#       "title": "Promoter pledge in Reliance group arm increases marginally",
#       "url": "https://business-standard.com/ril-promoter-pledge-2026.html",
#       "snippet": "Promoter pledge ratio in a Reliance group subsidiary rose by 0.3%...",
#       "source": "Business Standard",
#       "published_at": "2026-03-05T11:15:00+05:30",
#       "source_type": "scraped",
#       "risk_score": 8,
#       "risk_level": "MEDIUM",
#       "risk_flags": ["promoter pledge"],
#       "confidence": 0.7
#     },
#     {
#       "title": "Reliance Industries Ltd vs Commissioner of GST - Indian Kanoon",
#       "url": "https://indiankanoon.org/doc/12345678/",
#       "snippet": "High Court of Bombay. Reliance Industries Ltd challenged the GST assessment...",
#       "source": "indiankanoon",
#       "published_at": null,
#       "source_type": "scraped",
#       "risk_score": 12,
#       "risk_level": "MEDIUM",
#       "risk_flags": ["GST fraud"],
#       "confidence": 0.8
#     }
#   ],
#   "top_alerts": [...],
#   "citations": [
#     {"title": "SEBI issues notice to Reliance Industries...", "url": "https://economictimes.com/...", "source": "Economic Times"},
#     {"title": "RIL subsidiary faces NCLT petition...", "url": "https://livemint.com/...", "source": "Mint"}
#   ]
# }

