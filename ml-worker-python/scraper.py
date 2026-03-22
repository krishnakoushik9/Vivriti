"""
IntelliCredit — Scraper Module
================================
Fallback web scraping sources triggered when API results < 3 articles
OR the primary NewsAPI / GDELT pipeline fails entirely.

Sources:
  1. Google News RSS  (Indian locale, no API key)
  2. Indian Kanoon    (court judgments via DuckDuckGo site: search)
  3. DuckDuckGo HTML  (moved from research_agent.py for modularity)
  4. fetch_page_text  (lightweight HTML→text util, also moved here)

Every external call is wrapped in try/except — this module NEVER crashes.
"""

import logging
import os
import random
import re
import subprocess
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import quote, urlparse, parse_qs, unquote

import requests

logger = logging.getLogger("intellicredit.scraper")

# ─────────────────────────────────────────────
# Shared anti-bot / network stack (mirrors research_agent.py)
# ─────────────────────────────────────────────
USER_AGENTS = [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
]

DELAY_MIN_S = float(os.getenv("CRAWL_DELAY_MIN_S", "2.0"))
DELAY_MAX_S = float(os.getenv("CRAWL_DELAY_MAX_S", "5.0"))
PROXY_URL = os.getenv("RESIDENTIAL_PROXY_URL", "").strip()


def _jitter_sleep() -> None:
    """Polite crawl delay with random jitter."""
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


def _http_get(url: str, *, params: Optional[Dict[str, str]] = None, timeout_s: int = 15) -> Optional[requests.Response]:
    """Best-effort HTTP GET with jitter, UA rotation, and optional proxy."""
    _jitter_sleep()
    try:
        return requests.get(
            url,
            params=params,
            headers=_headers(),
            timeout=(min(5, timeout_s), timeout_s),
            allow_redirects=True,
            proxies=_proxies(),
        )
    except Exception as e:
        logger.warning("HTTP GET failed for %s: %s", url, e)
        return None


def _clean_text(s: str) -> str:
    """Collapse whitespace and strip."""
    s = re.sub(r"\s+", " ", s or "").strip()
    return s


# ─────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────
@dataclass
class SearchResult:
    """Minimal search result — backward compatible with research_agent.SearchResult."""
    title: str
    url: str
    snippet: str = ""


# ═════════════════════════════════════════════
#  1. GOOGLE NEWS RSS
# ═════════════════════════════════════════════
_INDIAN_RISK_KEYWORDS = "fraud OR NCLT OR default OR SEBI OR ED OR IBC"

def google_news_rss(company_name: str, max_items: int = 8) -> list:
    """
    Fetch Google News RSS feed with Indian locale.

    URL pattern:
      https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en

    Returns list of normalized dicts:
      {title, url, snippet, source, published_at, source_type='scraped'}

    Uses xml.etree.ElementTree (stdlib) — no extra deps.
    Timeout: 10s. On any error: return [].
    """
    company_name = (company_name or "").strip()
    if not company_name:
        return []

    query_str = quote(f'"{company_name}"')
    rss_url = (
        f"https://news.google.com/rss/search?q={query_str}"
        f"&hl=en-IN&gl=IN&ceid=IN:en"
    )

    try:
        resp = _http_get(rss_url, timeout_s=10)
        if resp is None or resp.status_code != 200:
            logger.warning("Google News RSS: non-200 (%s). Falling back to curl.", (resp.status_code if resp else "None"))
            xml_text = None
        else:
            xml_text = resp.text or ""
    except Exception as e:
        logger.warning("Google News RSS fetch failed: %s", e)
        xml_text = None

    if xml_text is None:
        try:
            ua = random.choice(USER_AGENTS)
            curl_cmd = ["curl", "-sS", "-L", "-A", ua, rss_url]
            if PROXY_URL:
                curl_cmd = ["curl", "-sS", "-L", "-A", ua, "-x", PROXY_URL, rss_url]
            p = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=12)
            if p.returncode == 0:
                xml_text = p.stdout
            else:
                logger.warning("Google News RSS curl fallback failed with exit code %d", p.returncode)
                return []
        except Exception as e:
            logger.warning("Google News RSS curl fallback failed: %s", e)
            return []

    if not xml_text:
        return []

    # Parse with stdlib xml.etree.ElementTree
    try:
        import xml.etree.ElementTree as ET  # noqa: N813
        root = ET.fromstring(xml_text)
    except Exception as e:
        logger.warning("Google News RSS XML parse failed: %s", e)
        # Try feedparser as fallback
        try:
            import feedparser  # type: ignore
            feed = feedparser.parse(xml_text)
            results = []
            for entry in (feed.entries or [])[:max_items]:
                results.append({
                    "title": _clean_text(entry.get("title", "")),
                    "url": (entry.get("link") or "").strip(),
                    "snippet": _clean_text(entry.get("summary", "")),
                    "source": "google_news_rss",
                    "published_at": entry.get("published") or None,
                    "source_type": "scraped",
                })
            return results
        except ImportError:
            logger.warning("Neither xml parse nor feedparser succeeded")
            return []
        except Exception as fp_err:
            logger.warning("feedparser fallback also failed: %s", fp_err)
            return []

    results: list = []
    # RSS 2.0: <rss><channel><item>…</item></channel></rss>
    channel = root.find("channel")
    if channel is None:
        return []

    for item in channel.findall("item"):
        if len(results) >= max_items:
            break
        title_el = item.find("title")
        link_el = item.find("link")
        desc_el = item.find("description")
        pub_el = item.find("pubDate")

        title = _clean_text(title_el.text if title_el is not None else "")
        link = (link_el.text or "").strip() if link_el is not None else ""
        snippet = _clean_text(desc_el.text if desc_el is not None else "")
        pub_date = (pub_el.text or "").strip() if pub_el is not None else None

        # Strip Google redirect prefix if present
        if not link:
            continue

        # Extract source from title (Google News appends " - SourceName")
        source_name = "google_news_rss"
        if " - " in title:
            parts = title.rsplit(" - ", 1)
            if len(parts) == 2 and len(parts[1]) < 60:
                source_name = parts[1].strip()

        results.append({
            "title": title,
            "url": link,
            "snippet": snippet,
            "source": source_name,
            "published_at": pub_date,
            "source_type": "scraped",
        })

    JUNK_DOMAINS = [
        "wikipedia.org", "wikimedia.org",
        "wikidata.org", "en.m.wikipedia",
    ]
    results = [
        r for r in results
        if not any(
            junk in (r.get("url") or "").lower()
            for junk in JUNK_DOMAINS
        )
    ]

    logger.info("Google News RSS returned %d items for '%s'", len(results), company_name)
    return results


def economic_times_rss(
    company_name: str, max_items: int = 8
) -> list:
    """Economic Times RSS — confirmed working."""
    feeds = [
        "https://economictimes.indiatimes.com/rssfeedstopstories.cms",
        "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
        "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms",
    ]
    name_lower = company_name.lower()
    results = []
    for feed_url in feeds:
        try:
            resp = _http_get(feed_url, timeout_s=8)
            if not resp or resp.status_code != 200:
                continue
            import xml.etree.ElementTree as ET
            root = ET.fromstring(resp.text)
            channel = root.find("channel")
            if not channel:
                continue
            for item in channel.findall("item"):
                title_el = item.find("title")
                link_el  = item.find("link")
                desc_el  = item.find("description")
                pub_el   = item.find("pubDate")
                title = _clean_text(
                    title_el.text if title_el is not None else "")
                link  = (link_el.text or "").strip() \
                    if link_el is not None else ""
                desc  = _clean_text(
                    desc_el.text if desc_el is not None else "")
                if not title or not link:
                    continue
                if name_lower in title.lower() or \
                   name_lower in desc.lower():
                    results.append({
                        "title":       title,
                        "url":         link,
                        "snippet":     desc[:300],
                        "source":      "Economic Times",
                        "published_at": (pub_el.text or "").strip()
                            if pub_el is not None else None,
                        "source_type": "scraped",
                    })
                if len(results) >= max_items:
                    break
        except Exception as e:
            logger.warning("ET RSS feed %s failed: %s", feed_url, e)
        if len(results) >= max_items:
            break
    logger.info("Economic Times RSS returned %d items for '%s'",
                len(results), company_name)
    return results


def mint_rss(
    company_name: str, max_items: int = 8
) -> list:
    """Mint/LiveMint RSS — confirmed working."""
    feeds = [
        "https://www.livemint.com/rss/companies",
        "https://www.livemint.com/rss/markets",
        "https://www.livemint.com/rss/news",
    ]
    name_lower = company_name.lower()
    results = []
    for feed_url in feeds:
        try:
            resp = _http_get(feed_url, timeout_s=8)
            if not resp or resp.status_code != 200:
                continue
            import xml.etree.ElementTree as ET
            root = ET.fromstring(resp.text)
            channel = root.find("channel")
            if not channel:
                continue
            for item in channel.findall("item"):
                title_el = item.find("title")
                link_el  = item.find("link")
                desc_el  = item.find("description")
                pub_el   = item.find("pubDate")
                title = _clean_text(
                    title_el.text if title_el is not None else "")
                link  = (link_el.text or "").strip() \
                    if link_el is not None else ""
                desc  = _clean_text(
                    desc_el.text if desc_el is not None else "")
                if not title or not link:
                    continue
                if name_lower in title.lower() or \
                   name_lower in desc.lower():
                    results.append({
                        "title":       title,
                        "url":         link,
                        "snippet":     desc[:300],
                        "source":      "Mint",
                        "published_at": (pub_el.text or "").strip()
                            if pub_el is not None else None,
                        "source_type": "scraped",
                    })
                if len(results) >= max_items:
                    break
        except Exception as e:
            logger.warning("Mint RSS feed %s failed: %s", feed_url, e)
        if len(results) >= max_items:
            break
    logger.info("Mint RSS returned %d items for '%s'",
                len(results), company_name)
    return results


def business_standard_rss(
    company_name: str, max_items: int = 8
) -> list:
    """Business Standard RSS."""
    feeds = [
        "https://www.business-standard.com/rss/markets-106.rss",
        "https://www.business-standard.com/rss/companies-101.rss",
        "https://www.business-standard.com/rss/finance-103.rss",
    ]
    name_lower = company_name.lower()
    results = []
    for feed_url in feeds:
        try:
            resp = _http_get(feed_url, timeout_s=8)
            if not resp or resp.status_code != 200:
                continue
            import xml.etree.ElementTree as ET
            root = ET.fromstring(resp.text)
            channel = root.find("channel")
            if not channel:
                continue
            for item in channel.findall("item"):
                title_el = item.find("title")
                link_el  = item.find("link")
                desc_el  = item.find("description")
                pub_el   = item.find("pubDate")
                title = _clean_text(
                    title_el.text if title_el is not None else "")
                link  = (link_el.text or "").strip() \
                    if link_el is not None else ""
                desc  = _clean_text(
                    desc_el.text if desc_el is not None else "")
                if not title or not link:
                    continue
                if name_lower in title.lower() or \
                   name_lower in desc.lower():
                    results.append({
                        "title":       title,
                        "url":         link,
                        "snippet":     desc[:300],
                        "source":      "Business Standard",
                        "published_at": (pub_el.text or "").strip()
                            if pub_el is not None else None,
                        "source_type": "scraped",
                    })
                if len(results) >= max_items:
                    break
        except Exception as e:
            logger.warning(
                "BS RSS feed %s failed: %s", feed_url, e)
        if len(results) >= max_items:
            break
    logger.info(
        "Business Standard RSS returned %d items for '%s'",
        len(results), company_name)
    return results


def moneycontrol_rss(
    company_name: str, max_items: int = 8
) -> list:
    """MoneyControl RSS."""
    feeds = [
        "https://www.moneycontrol.com/rss/marketsnews.xml",
        "https://www.moneycontrol.com/rss/corporatenews.xml",
        "https://www.moneycontrol.com/rss/latestnews.xml",
    ]
    name_lower = company_name.lower()
    results = []
    for feed_url in feeds:
        try:
            resp = _http_get(feed_url, timeout_s=8)
            if not resp or resp.status_code != 200:
                continue
            import xml.etree.ElementTree as ET
            root = ET.fromstring(resp.text)
            channel = root.find("channel")
            if not channel:
                continue
            for item in channel.findall("item"):
                title_el = item.find("title")
                link_el  = item.find("link")
                desc_el  = item.find("description")
                pub_el   = item.find("pubDate")
                title = _clean_text(
                    title_el.text if title_el is not None else "")
                link  = (link_el.text or "").strip() \
                    if link_el is not None else ""
                desc  = _clean_text(
                    desc_el.text if desc_el is not None else "")
                if not title or not link:
                    continue
                if name_lower in title.lower() or \
                   name_lower in desc.lower():
                    results.append({
                        "title":       title,
                        "url":         link,
                        "snippet":     desc[:300],
                        "source":      "MoneyControl",
                        "published_at": (pub_el.text or "").strip()
                            if pub_el is not None else None,
                        "source_type": "scraped",
                    })
                if len(results) >= max_items:
                    break
        except Exception as e:
            logger.warning(
                "MC RSS feed %s failed: %s", feed_url, e)
        if len(results) >= max_items:
            break
    logger.info(
        "MoneyControl RSS returned %d items for '%s'",
        len(results), company_name)
    return results


# ═════════════════════════════════════════════
#  2. INDIAN KANOON SEARCH
# ═════════════════════════════════════════════
def indian_kanoon_search(entity_name: str, max_items: int = 5) -> list:
    """
    Search for court judgments on Indian Kanoon via DuckDuckGo site: search.

    Query: site:indiankanoon.org {entity_name}
    For any result URL containing 'indiankanoon.org', fetch the page and extract:
      - Case title from <h2> or page <title>
      - First 800 chars of judgment text
      - Court name if present

    Returns: [{title, url, snippet, source, source_type, court}]

    IMPORTANT: All fetch calls are wrapped in try/except — never crashes.
    """
    entity_name = (entity_name or "").strip()
    if not entity_name:
        return []

    query = f"site:indiankanoon.org {entity_name}"
    ddg_results = duckduckgo_search(query, max_results=max_items * 2, timeout_s=12)

    results: list = []
    for sr in ddg_results:
        if len(results) >= max_items:
            break

        url = sr.url or ""
        if "indiankanoon.org" not in url.lower():
            continue

        # Fetch the Indian Kanoon page for richer extraction
        case_title = sr.title
        court = ""
        snippet_text = sr.snippet

        try:
            page_text = fetch_page_text(url, timeout_s=12, max_chars=5000)
            if page_text:
                # Try to extract court name — usually near the top
                court_match = re.search(
                    r"(Supreme Court|High Court|District Court|Tribunal|NCLT|NCLAT|"
                    r"Appellate Tribunal|SAT|DRT|ITAT|CESTAT|NGT)",
                    page_text[:800],
                    re.IGNORECASE,
                )
                if court_match:
                    court = court_match.group(0)

                # Better snippet from first 800 chars
                if len(page_text) > 100:
                    snippet_text = page_text[:800].strip()
        except Exception as e:
            logger.debug("Indian Kanoon page fetch failed for %s: %s", url, e)

        results.append({
            "title": _clean_text(case_title),
            "url": url,
            "snippet": _clean_text(snippet_text[:800]) if snippet_text else "",
            "source": "indiankanoon",
            "source_type": "scraped",
            "court": court,
        })

    logger.info("Indian Kanoon search returned %d items for '%s'", len(results), entity_name)
    return results


# ═════════════════════════════════════════════
#  3. DUCKDUCKGO SEARCH (moved from research_agent.py)
# ═════════════════════════════════════════════
def duckduckgo_search(query: str, max_results: int = 8, timeout_s: int = 15) -> List[SearchResult]:
    """
    Minimal DuckDuckGo HTML scrape (no API key).
    Returns list of SearchResult(title, url, snippet).
    Best-effort; degrades gracefully with curl fallback.
    """
    q = query.strip()
    if not q:
        return []

    url = "https://duckduckgo.com/html/"
    html: Optional[str] = None

    try:
        resp = _http_get(url, params={"q": q}, timeout_s=timeout_s)
        if resp is None:
            raise RuntimeError("no response")
        resp.raise_for_status()
        # Some environments get DDG bot interstitials (202). Fall back to curl.
        if resp.status_code == 202 or (
            "DuckDuckGo Privacy" in (resp.text[:500] or "")
            and "result__a" not in resp.text
        ):
            html = None
        else:
            html = resp.text
    except Exception as e:
        logger.warning("DuckDuckGo search via requests failed: %s", e)
        html = None

    # curl fallback
    if html is None:
        try:
            ua = random.choice(USER_AGENTS)
            encoded_q = requests.utils.quote(q)
            curl_cmd = [
                "curl", "-sS", "-L", "-A", ua,
                url + "?" + f"q={encoded_q}",
            ]
            if PROXY_URL:
                curl_cmd = [
                    "curl", "-sS", "-L", "-A", ua, "-x", PROXY_URL,
                    url + "?" + f"q={encoded_q}",
                ]
            p = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=timeout_s)
            if p.returncode == 0:
                html = p.stdout
        except Exception as e:
            logger.warning("DuckDuckGo search via curl failed: %s", e)
            return []

    if not html:
        return []

    # Parse result blocks: <a class="result__a" href="...">Title</a>
    results: List[SearchResult] = []
    for m in re.finditer(
        r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
        html,
        re.IGNORECASE | re.DOTALL,
    ):
        link = _clean_text(re.sub(r"<.*?>", "", m.group(1)))
        # Extract original URL from DDG redirect
        if "uddg=" in link:
            try:
                qs = parse_qs(urlparse(link).query)
                if "uddg" in qs and qs["uddg"]:
                    link = unquote(qs["uddg"][0])
            except Exception:
                pass
        title = _clean_text(re.sub(r"<.*?>", "", m.group(2)))
        if not link or not title:
            continue
        results.append(SearchResult(title=title, url=link))
        if len(results) >= max_results:
            break

    # Extract snippets (optional)
    snippet_matches = list(re.finditer(
        r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>'
        r'|<div[^>]+class="result__snippet"[^>]*>(.*?)</div>',
        html,
        re.IGNORECASE | re.DOTALL,
    ))
    for i, sm in enumerate(snippet_matches[:len(results)]):
        snippet_raw = sm.group(1) or sm.group(2) or ""
        snippet = _clean_text(re.sub(r"<.*?>", "", snippet_raw))
        if i < len(results):
            results[i].snippet = snippet

    return results


# ═════════════════════════════════════════════
#  4. FETCH PAGE TEXT (moved from research_agent.py)
# ═════════════════════════════════════════════
def fetch_page_text(url: str, timeout_s: int = 15, max_chars: int = 20000) -> str:
    """
    Fetch a web page and return a rough plain-text extraction.
    Intentionally lightweight (no heavy parsers) for hackathon reliability.
    """
    try:
        r = _http_get(url, timeout_s=timeout_s)
        if r is None:
            return ""
        r.raise_for_status()
        html = (r.text or "")[:max_chars * 2]
    except Exception:
        return ""

    # Drop scripts/styles and strip tags
    html = re.sub(r"(?is)<(script|style|noscript).*?>.*?</\1>", " ", html)
    text = re.sub(r"(?is)<.*?>", " ", html)
    text = _clean_text(text)
    return text[:max_chars]
