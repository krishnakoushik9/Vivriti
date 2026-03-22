"""
IntelliCredit — NewsAPI Client
==============================
Async-capable NewsAPI client with daily rate-limit tracking (free tier = 100 req/day).
All responses normalized to the pipeline article schema.
"""

import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Any, List, Optional

import requests

logger = logging.getLogger("intellicredit.api_client")

# ──────────────────────────────────────────────────────────────
# Indian-context risk keyword suffix appended to every query
# ──────────────────────────────────────────────────────────────
_INDIAN_RISK_SUFFIX = (
    'fraud OR NCLT OR "wilful defaulter" OR SEBI OR ED OR IBC '
    'OR default OR hawala OR benami OR CBI OR "GST fraud"'
)

_MAX_QUERY_LEN = 500  # NewsAPI query string cap


class NewsAPIClient:
    """Thin wrapper around NewsAPI /v2 endpoints with rate-limit awareness."""

    _CACHE: Dict[str, Any] = {}
    _CACHE_TTL = timedelta(hours=2)

    def __init__(self):
        self.api_key: str = os.getenv(
            "NEWS_API_KEY", "31f2579f1d56422390c930f4e0b95f09"
        )
        self.base: str = "https://newsapi.org/v2"
        # Rate-limit state: NewsAPI free tier = 100 req/day
        self._requests_today: int = 0
        self._last_reset: date = date.today()

    def _get_cache(self, key: str) -> Optional[list]:
        if key in self._CACHE:
            ts, data = self._CACHE[key]
            if datetime.now() - ts < self._CACHE_TTL:
                return data
            else:
                del self._CACHE[key]
        return None

    def _set_cache(self, key: str, data: list) -> None:
        self._CACHE[key] = (datetime.now(), data)

    # ── internal helpers ──────────────────────────────────────

    def _maybe_reset_counter(self) -> None:
        """Reset the daily counter at midnight."""
        today = date.today()
        if today > self._last_reset:
            self._requests_today = 0
            self._last_reset = today

    def _check_rate_limit(self) -> bool:
        """Return True if we can still make requests. Warns at threshold."""
        self._maybe_reset_counter()
        if self._requests_today >= 100:
            logger.warning(
                "NewsAPI daily limit REACHED: %d/100 — skipping request",
                self._requests_today,
            )
            return False
        if self._requests_today >= 80:
            logger.warning(
                "NewsAPI daily limit approaching: %d/100",
                self._requests_today,
            )
        return True

    def _increment(self) -> None:
        self._maybe_reset_counter()
        self._requests_today += 1

    # ── query builder ─────────────────────────────────────────

    def _build_query(
        self, company_name: str, promoters: list = None
    ) -> str:
        """
        Build a risk-aware query string for NewsAPI.

        Pattern: 'CompanyName fraud OR litigation OR NCLT OR ...'
        If promoters provided: '(CompanyName OR PromoterName) fraud OR ...'
        Cap total query length at 500 chars (NewsAPI limit).
        """
        company_name = (company_name or "").strip()
        if not company_name:
            return ""

        # Build subject part
        subjects = [f'"{company_name}"']
        if promoters:
            for p in promoters:
                p = (p or "").strip()
                if p:
                    subjects.append(f'"{p}"')

        if len(subjects) == 1:
            subject_part = subjects[0]
        else:
            subject_part = "(" + " OR ".join(subjects) + ")"

        query = f"{subject_part} {_INDIAN_RISK_SUFFIX}"

        # Truncate to API limit while keeping valid syntax
        if len(query) > _MAX_QUERY_LEN:
            query = query[:_MAX_QUERY_LEN].rsplit(" OR ", 1)[0]

        return query

    # ── normalize helper ──────────────────────────────────────

    @staticmethod
    def _normalize(raw_article: dict) -> dict:
        """Convert NewsAPI article shape → pipeline article dict."""
        source_obj = raw_article.get("source") or {}
        return {
            "title": (raw_article.get("title") or "").strip(),
            "url": (raw_article.get("url") or "").strip(),
            "snippet": (
                raw_article.get("description")
                or raw_article.get("content")
                or ""
            ).strip(),
            "source": (source_obj.get("name") or "").strip(),
            "published_at": (raw_article.get("publishedAt") or "").strip(),
            "source_type": "api",
        }

    # ── public search methods ─────────────────────────────────

    def search_everything(
        self,
        company_name: str,
        promoters: list = None,
        from_days_ago: int = 90,
        language: str = "en",
        page_size: int = 20,
    ) -> list:
        """
        Hit /v2/everything with a risk-aware query.

        Returns list of normalized dicts with keys:
            {title, url, snippet, source, published_at, source_type="api"}
        On 429 (rate limit): log warning, return [].
        On 426 (upgrade required for old articles): retry with 30-day window.
        On any error: log + return [].
        """
        query = self._build_query(company_name, promoters)
        if not query:
            return []

        cache_key = f"everything::{query}::{from_days_ago}::{language}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            logger.info("Using cached NewsAPI results for '%s'", company_name)
            return cached

        if not self._check_rate_limit():
            return []

        from_date = (
            datetime.now(timezone.utc) - timedelta(days=from_days_ago)
        ).strftime("%Y-%m-%d")

        params = {
            "q": query,
            "from": from_date,
            "language": language,
            "pageSize": min(page_size, 100),
            "sortBy": "relevancy",
            "apiKey": self.api_key,
        }

        try:
            resp = requests.get(
                f"{self.base}/everything",
                params=params,
                timeout=(5, 15),
            )
            self._increment()

            if resp.status_code == 429:
                logger.warning("NewsAPI rate-limited (429). Returning [].")
                return []

            if resp.status_code == 426:
                # Upgrade required — NewsAPI free tier limits date range.
                # Fall back to last 28 days (safe limit for free tier).
                logger.warning(
                    "NewsAPI 426 (upgrade required for date range). "
                    "Retrying with 28-day window."
                )
                params["from"] = (
                    datetime.now(timezone.utc) - timedelta(days=28)
                ).strftime("%Y-%m-%d")
                try:
                    resp = requests.get(
                        f"{self.base}/everything",
                        params=params,
                        timeout=(5, 15),
                    )
                    self._increment()
                    if resp.status_code == 426:
                        # Some free accounts are restricted to last 7 days.
                        logger.warning("NewsAPI 426 still persists. Retrying with 7-day window.")
                        params["from"] = (
                            datetime.now(timezone.utc) - timedelta(days=7)
                        ).strftime("%Y-%m-%d")
                        resp = requests.get(
                            f"{self.base}/everything",
                            params=params,
                            timeout=(5, 15),
                        )
                        self._increment()

                    if resp.status_code != 200:
                        logger.warning(
                            "NewsAPI retry also failed: HTTP %s",
                            resp.status_code,
                        )
                        return []
                except Exception as retry_err:
                    logger.warning("NewsAPI retry request failed: %s", retry_err)
                    return []

            resp.raise_for_status()
            data = resp.json() or {}

        except Exception as e:
            logger.warning("NewsAPI /everything request failed: %s", e)
            return []

        raw_articles = data.get("articles") or []
        results = []
        for raw in raw_articles:
            normalized = self._normalize(raw)
            if normalized["title"] and normalized["url"]:
                results.append(normalized)

        logger.info(
            "NewsAPI /everything returned %d articles for '%s'",
            len(results),
            company_name,
        )
        self._set_cache(cache_key, results)
        return results

    def get_top_headlines(self, company_name: str) -> list:
        """
        Hit /v2/top-headlines with q=company_name, country=in (India).

        Use as a quick recency signal — if the company appears in
        breaking news it is high priority.
        Returns same normalized dict format.
        """
        company_name = (company_name or "").strip()
        if not company_name:
            return []

        cache_key = f"headlines::{company_name}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        if not self._check_rate_limit():
            return []

        params = {
            "q": company_name,
            "country": "in",
            "apiKey": self.api_key,
        }

        try:
            resp = requests.get(
                f"{self.base}/top-headlines",
                params=params,
                timeout=(5, 15),
            )
            self._increment()

            if resp.status_code == 429:
                logger.warning("NewsAPI top-headlines rate-limited (429).")
                return []

            resp.raise_for_status()
            data = resp.json() or {}

        except Exception as e:
            logger.warning("NewsAPI /top-headlines request failed: %s", e)
            return []

        raw_articles = data.get("articles") or []
        results = []
        for raw in raw_articles:
            normalized = self._normalize(raw)
            if normalized["title"] and normalized["url"]:
                results.append(normalized)

        logger.info(
            "NewsAPI /top-headlines returned %d articles for '%s'",
            len(results),
            company_name,
        )
        self._set_cache(cache_key, results)
        return results


class GDELTClient:
    """
    Query GDELT 2.1 DOC API for recent articles about a company.
    No API key required. All responses normalized to pipeline schema.
    """

    BASE_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
    _CACHE: Dict[str, Any] = {}
    _CACHE_TTL = timedelta(hours=4)

    def __init__(self):
        # We can reuse the risk suffix from the module level
        self.risk_suffix = _INDIAN_RISK_SUFFIX

    def _get_cache(self, key: str) -> Optional[list]:
        if key in self._CACHE:
            ts, data = self._CACHE[key]
            if datetime.now() - ts < self._CACHE_TTL:
                return data
            else:
                del self._CACHE[key]
        return None

    def _set_cache(self, key: str, data: list) -> None:
        self._CACHE[key] = (datetime.now(), data)

    def _build_query(self, company_name: str, promoters: list = None) -> str:
        """
        Build a risk-aware query string for GDELT.
        Pattern: '"CompanyName" (fraud OR litigation OR ...)'
        """
        company_name = (company_name or "").strip()
        if not company_name:
            return ""

        subjects = [f'"{company_name}"']
        if promoters:
            for p in promoters:
                p = (p or "").strip()
                if p:
                    subjects.append(f'"{p}"')

        if len(subjects) == 1:
            subject_part = subjects[0]
        else:
            subject_part = "(" + " OR ".join(subjects) + ")"

        # GDELT usually likes keywords in parens if using OR
        # e.g. "Reliance" (fraud OR NCLT OR ...)
        return f"{subject_part} ({self.risk_suffix})"

    def _normalize(self, a: dict) -> dict:
        """Convert GDELT article shape → pipeline article dict."""
        # Use seendate or sourceCountry as snippet if summary is missing
        snippet = a.get("seendate") or a.get("sourceCountry") or ""
        return {
            "title": (a.get("title") or "").strip(),
            "url": (a.get("url") or "").strip(),
            "snippet": snippet.strip(),
            "source": a.get("sourceCollection") or a.get("sourceCountry") or None,
            "published_at": a.get("seendate") or None,
            "source_type": "api",
        }

    def search(
        self, company_name: str, promoters: list = None, max_items: int = 8
    ) -> list:
        """
        Execute search against GDELT DOC API.
        """
        query = self._build_query(company_name, promoters)
        if not query:
            return []

        cache_key = f"gdelt::{query}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            logger.info("Using cached GDELT results for '%s'", company_name)
            return cached

        params = {
            "query": query,
            "mode": "ArtList",
            "format": "json",
            "maxrecords": str(max(1, min(25, max_items))),
            "sort": "HybridRel",
            "formatdatetime": "1",
        }

        # Common headers to avoid basic bot detection
        headers = {"User-Agent": "IntelliCreditResearch/1.1"}

        try:
            resp = requests.get(
                self.BASE_URL,
                params=params,
                headers=headers,
                timeout=4,
            )

            if resp.status_code == 429:
                logger.warning("GDELT rate-limited (429).")
                return []

            resp.raise_for_status()
            data = resp.json() or {}

        except Exception as e:
            logger.warning("GDELT search request failed: %s", e)
            return []

        raw_articles = data.get("articles") or []
        results = []
        for raw in raw_articles:
            normalized = self._normalize(raw)
            if normalized["title"] and normalized["url"]:
                results.append(normalized)

        logger.info(
            "GDELT returned %d articles for '%s'",
            len(results),
            company_name,
        )
        self._set_cache(cache_key, results)
        return results

