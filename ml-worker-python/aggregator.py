"""
IntelliCredit — Aggregator
=============================
Combines all research sources into a single ML-ready JSON payload.

Merges:
  - Scored & deduplicated articles (NewsAPI, GDELT, scrapers, BFF)
  - Supplemental signals (MCA, CIBIL, eCourts, GST reconciliation)

Output conforms to the pipeline schema consumed by Java ML worker.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("intellicredit.aggregator")


def aggregate(
    company_name: str,
    all_articles: list,
    supplemental: dict = None,
) -> dict:
    """
    Combine all sources into final ML-ready JSON.

    Parameters
    ----------
    company_name : str
        Target company being assessed.
    all_articles : list
        Fully scored + deduplicated article list.
        Each article MUST have: title, url, snippet, source, published_at,
        source_type, risk_score, risk_level, risk_flags, confidence.
    supplemental : dict, optional
        Output of conduct_full_research() containing MCA, CIBIL, eCourts,
        GST sub-reports.

    Returns
    -------
    dict
        Complete aggregated research output.
    """
    supplemental = supplemental or {}
    articles = all_articles or []

    # ── Risk score stats ──────────────────────────
    risk_scores = [a.get("risk_score", 0) for a in articles]
    avg_risk = round(sum(risk_scores) / max(len(risk_scores), 1), 1) if risk_scores else 0.0

    confidences = [a.get("confidence", 0.4) for a in articles]
    confidence_avg = round(
        sum(confidences) / max(len(confidences), 1), 2
    ) if confidences else 0.0

    # ── Risk breakdown ────────────────────────────
    critical = [a for a in articles if a.get("risk_level") == "CRITICAL"]
    high = [a for a in articles if a.get("risk_level") == "HIGH"]
    medium = [a for a in articles if a.get("risk_level") == "MEDIUM"]
    low_count = len(articles) - len(critical) - len(high) - len(medium)

    risk_breakdown = {
        "critical": len(critical),
        "high": len(high),
        "medium": len(medium),
        "low": low_count,
    }

    # ── Overall risk level ────────────────────────
    if len(critical) > 0:
        overall = "CRITICAL"
    elif len(high) > 0:
        overall = "HIGH"
    elif len(medium) > 0:
        overall = "MEDIUM"
    elif len(articles) > 0:
        overall = "LOW"
    else:
        overall = "NONE"

    # ── Top risk keywords (unique, top 5 by weight) ─
    keyword_counts: Dict[str, int] = {}
    for a in articles:
        for kw in (a.get("risk_flags") or a.get("risk_keywords_matched") or []):
            keyword_counts[kw] = keyword_counts.get(kw, 0) + 1
    top_risks = sorted(keyword_counts.keys(), key=lambda k: keyword_counts[k], reverse=True)[:5]

    # ── Source mix ────────────────────────────────
    source_mix = {"api": 0, "scraped": 0, "bff": 0, "reference": 0}
    for a in articles:
        st = a.get("source_type", "api")
        if st in source_mix:
            source_mix[st] += 1
        else:
            source_mix["api"] += 1  # default bucket

    # ── Top alerts (top 5 by risk_score) ──────────
    sorted_by_risk = sorted(articles, key=lambda a: a.get("risk_score", 0), reverse=True)
    top_alerts = sorted_by_risk[:5]

    # ── Citations (deduplicated audit trail) ──────
    seen_cite_urls: set = set()
    citations: list = []
    for a in sorted_by_risk:
        url = (a.get("url") or "").strip()
        if url and url not in seen_cite_urls:
            seen_cite_urls.add(url)
            citations.append({
                "title": a.get("title", ""),
                "url": url,
                "source": a.get("source", ""),
            })

    # ── Supplemental data (pass-through) ──────────
    supplemental_out = {
        "mca_status": supplemental.get("mca_status", {}),
        "cibil_commercial": supplemental.get("cibil_commercial", {}),
        "ecourts_litigation": supplemental.get("ecourts_litigation", {}),
        "gst_reconciliation": supplemental.get("gst_reconciliation", {}),
    }

    # ── Assemble final payload ────────────────────
    result = {
        "company": company_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_articles": len(articles),
        "avg_risk_score": avg_risk,
        "confidence_avg": confidence_avg,
        "overall_risk_level": overall,
        "top_risks": top_risks,
        "risk_breakdown": risk_breakdown,
        "source_mix": source_mix,
        "supplemental": supplemental_out,
        "articles": [
            {
                "title": a.get("title", ""),
                "url": a.get("url", ""),
                "snippet": a.get("snippet", a.get("text", ""))[:500],
                "source": a.get("source", ""),
                "published_at": a.get("published_at", ""),
                "source_type": a.get("source_type", "api"),
                "risk_score": a.get("risk_score", 0),
                "risk_level": a.get("risk_level", "NONE"),
                "risk_flags": a.get("risk_flags", a.get("risk_keywords_matched", [])),
                "confidence": a.get("confidence", 0.4),
            }
            for a in sorted_by_risk
        ],
        "top_alerts": [
            {
                "title": a.get("title", ""),
                "url": a.get("url", ""),
                "snippet": a.get("snippet", a.get("text", ""))[:300],
                "source": a.get("source", ""),
                "risk_score": a.get("risk_score", 0),
                "risk_level": a.get("risk_level", "NONE"),
                "risk_flags": a.get("risk_flags", a.get("risk_keywords_matched", [])),
            }
            for a in top_alerts
        ],
        "citations": citations,
    }

    logger.info(
        "Aggregation complete for '%s': %d articles, avg_risk=%.1f, level=%s",
        company_name, len(articles), avg_risk, overall,
    )
    return result
