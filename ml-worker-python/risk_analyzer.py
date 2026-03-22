"""
IntelliCredit — Risk Analyzer
================================
Enhanced NLP-lite scoring engine extracted from research_agent.py.

Features:
  - Extended RISK_WEIGHTS with Indian-context terms
  - Context window scoring (co-occurrence bonus)
  - Source credibility weighting
  - Confidence scoring per article
  - Jaccard-based deduplication (no external NLP libs)
  - Backward-compatible analyze_research_results()
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger("intellicredit.risk_analyzer")

# ─────────────────────────────────────────────
# Risk scoring weights (NLP-lite)
# Extended with Indian-context terms
# ─────────────────────────────────────────────
RISK_WEIGHTS: Dict[str, int] = {
    # ── Critical — immediate red flags ───────────
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
    "wilful defaulter": 20,
    "scam": 25,
    "fraudulent": 25,
    "inflation of accounts": 25,
    "misreporting": 20,
    "rejected a plea": 20,
    "legal rejection": 20,
    "scandal": 20,
    "wrongly auditing": 20,

    # ── High — serious financial distress ────────
    "NCLT": 15,
    "insolvency": 15,
    "liquidation": 15,
    "CIRP": 15,
    "IBC": 12,
    "winding up": 12,
    "resolution professional": 12,
    "GST fraud": 18,
    "shell company": 16,
    "SFIO": 18,
    "account frozen": 15,
    "promoter diversion": 14,
    "attachment order": 14,

    # ── Medium — regulatory action ───────────────
    "SEBI notice": 10,
    "SEBI order": 10,
    "RBI penalty": 10,
    "show cause": 8,
    "debarred": 10,
    "suspended": 8,
    "SARFAESI": 8,
    "DRT": 8,
    "forensic audit": 10,
    "credit rating downgrade": 8,
    "bank guarantee invoked": 12,

    # ── Low — financial stress indicators ────────
    "NPA": 5,
    "default": 5,
    "write-off": 5,
    "restructured": 4,
    "moratorium": 4,
    "OTS": 3,
    "promoter pledge": 3,
    "related party": 6,

    # ── Operational ──────────────────────────────
    "plant shutdown": 6,
    "factory sealed": 6,
    "labour strike": 4,
}

# High-risk keywords (weight >= 12) used for context-window co-occurrence bonus
_HIGH_RISK_KEYWORDS: Set[str] = {
    kw for kw, w in RISK_WEIGHTS.items() if w >= 12
}

# ─────────────────────────────────────────────
# Source credibility multipliers
# ─────────────────────────────────────────────
SOURCE_CREDIBILITY: Dict[str, float] = {
    "Economic Times": 1.2,
    "Business Standard": 1.2,
    "Mint": 1.15,
    "Reuters": 1.25,
    "Bloomberg": 1.25,
    "The Hindu Business Line": 1.1,
    "MoneyControl": 1.1,
    "Moneycontrol": 1.1,
    "NDTV Profit": 1.1,
    "LiveMint": 1.15,
    "indiankanoon": 1.3,   # court data = highest credibility
    "Indian Kanoon": 1.3,
    "wikipedia": 1.2,
    "en.wikipedia.org": 1.2,
    "Reference": 1.2,
    "default": 1.0,
}


def _get_credibility(source: str) -> float:
    """Look up source credibility factor. Falls back to 1.0."""
    if not source:
        return SOURCE_CREDIBILITY["default"]
    source_lower = source.lower()
    for name, factor in SOURCE_CREDIBILITY.items():
        if name == "default":
            continue
        if name.lower() in source_lower or source_lower in name.lower():
            return factor
    return SOURCE_CREDIBILITY["default"]


# ═════════════════════════════════════════════
#  SCORING
# ═════════════════════════════════════════════

def _context_window_bonus(text: str) -> int:
    """
    Co-occurrence bonus: if two HIGH-risk keywords appear within 50 chars
    of each other, add +10 bonus per such pair (capped at +30).
    """
    text_lower = text.lower()
    positions: List[tuple] = []  # (keyword, start_pos)

    for kw in _HIGH_RISK_KEYWORDS:
        kw_lower = kw.lower()
        start = 0
        while True:
            idx = text_lower.find(kw_lower, start)
            if idx == -1:
                break
            positions.append((kw, idx))
            start = idx + len(kw_lower)

    if len(positions) < 2:
        return 0

    # Sort by position in text
    positions.sort(key=lambda x: x[1])

    bonus = 0
    seen_pairs: set = set()
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            kw_a, pos_a = positions[i]
            kw_b, pos_b = positions[j]
            if kw_a == kw_b:
                continue
            if abs(pos_b - pos_a) <= 50:
                pair_key = tuple(sorted([kw_a, kw_b]))
                if pair_key not in seen_pairs:
                    seen_pairs.add(pair_key)
                    bonus += 10
            else:
                # positions are sorted, so further ones will be even farther
                break

    return min(bonus, 30)  # Cap bonus at 30


def score_article(article: dict) -> dict:
    """
    Score a single article and return it with risk metadata.

    Enhanced with:
      1. Context window scoring (co-occurrence bonus)
      2. Source credibility weighting
      3. Confidence score
      4. Recency multiplier (1.2x < 30d, 1.1x < 90d)
    """
    title = article.get("title", "")
    text_body = article.get("text", "") or article.get("snippet", "")
    full_text = f"{title} {text_body}"
    text_lower = full_text.lower()

    # ── Step 1: keyword matching ──────────────────
    matched: Dict[str, int] = {}
    total_score = 0

    for keyword, weight in RISK_WEIGHTS.items():
        if keyword.lower() in text_lower:
            matched[keyword] = weight
            total_score += weight

    # ── Step 2: context window bonus ──────────────
    co_occurrence_bonus = _context_window_bonus(full_text)
    total_score += co_occurrence_bonus

    # ── Step 3: recency multiplier ────────────────
    published = article.get("published_at")
    recency_multiplier = 1.0
    has_date = False
    if published:
        try:
            pub_str = str(published).replace("Z", "+00:00")
            # Handle various ISO formats
            pub_date = datetime.fromisoformat(pub_str)
            if pub_date.tzinfo is None:
                pub_date = pub_date.replace(tzinfo=timezone.utc)
            days_old = (datetime.now(timezone.utc) - pub_date).days
            has_date = True
            if days_old < 30:
                recency_multiplier = 1.2
            elif days_old < 90:
                recency_multiplier = 1.1
        except Exception:
            pass

    # ── Step 4: source credibility ────────────────
    source = article.get("source", "")
    credibility_factor = _get_credibility(source)
    source_is_credible = credibility_factor > 1.0

    # ── Step 5: compute final risk score ──────────
    raw_score = total_score * recency_multiplier * credibility_factor
    final_score = min(round(raw_score), 100)

    # ── Step 6: confidence score ──────────────────
    has_url = bool(article.get("url", "").strip())
    snippet_len = len(text_body.strip())

    confidence = min(
        1.0,
        0.4
        + (0.2 if has_url else 0.0)
        + (0.2 if has_date else 0.0)
        + (0.1 if source_is_credible else 0.0)
        + (0.1 if snippet_len > 100 else 0.0),
    )

    # ── Step 7: risk level classification ─────────
    if final_score >= 40:
        risk_level = "CRITICAL"
    elif final_score >= 20:
        risk_level = "HIGH"
    elif final_score >= 8:
        risk_level = "MEDIUM"
    elif final_score >= 1:
        risk_level = "LOW"
    else:
        risk_level = "NONE"

    return {
        **article,
        "risk_score": final_score,
        "risk_level": risk_level,
        "risk_keywords_matched": list(matched.keys()),
        "risk_flags": list(matched.keys()),
        "confidence": round(confidence, 2),
        "co_occurrence_bonus": co_occurrence_bonus,
        "credibility_factor": round(credibility_factor, 2),
    }


# ═════════════════════════════════════════════
#  DEDUPLICATION
# ═════════════════════════════════════════════

def _jaccard_similarity(text_a: str, text_b: str) -> float:
    """
    Compute Jaccard similarity between two strings (word-set comparison).
    Returns float in [0.0, 1.0].
    """
    words_a = set(re.findall(r"\w+", text_a.lower()))
    words_b = set(re.findall(r"\w+", text_b.lower()))
    if not words_a and not words_b:
        return 1.0
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union)


def deduplicate_articles(articles: list) -> list:
    """
    Remove near-duplicate articles using title similarity.

    Two articles are considered duplicates if:
      - Exact same URL, OR
      - Title Jaccard similarity > 0.7

    Keeps the article with the higher risk_score.
    No external NLP libs required.
    """
    if not articles:
        return []

    # Sort by risk_score descending so we keep the highest-scored version
    sorted_articles = sorted(
        articles,
        key=lambda a: a.get("risk_score", 0),
        reverse=True,
    )

    kept: list = []
    seen_urls: set = set()

    for article in sorted_articles:
        url = (article.get("url") or "").strip().lower()
        title = (article.get("title") or "").strip()

        # Check exact URL duplicate
        if url and url in seen_urls:
            continue

        # Check title similarity against all kept articles
        is_duplicate = False
        for kept_article in kept:
            kept_title = (kept_article.get("title") or "").strip()
            if _jaccard_similarity(title, kept_title) > 0.7:
                is_duplicate = True
                break

        if is_duplicate:
            continue

        if url:
            seen_urls.add(url)
        kept.append(article)

    logger.info(
        "Deduplication: %d → %d articles (removed %d duplicates)",
        len(articles),
        len(kept),
        len(articles) - len(kept),
    )
    return kept


# ═════════════════════════════════════════════
#  ANALYSIS AGGREGATION
# ═════════════════════════════════════════════

def analyze_research_results(articles: list) -> dict:
    """
    Score all articles, return ranked + summary for Java backend.

    Backward compatible with research_agent.analyze_research_results().
    Enhanced with confidence_avg in output.
    """
    scored = [score_article(a) for a in (articles or []) if isinstance(a, dict)]
    scored.sort(key=lambda x: x.get("risk_score", 0), reverse=True)

    critical = [a for a in scored if a.get("risk_level") == "CRITICAL"]
    high = [a for a in scored if a.get("risk_level") == "HIGH"]
    medium = [a for a in scored if a.get("risk_level") == "MEDIUM"]

    # Aggregate score: weighted average of top 10 articles
    top10_scores = [a.get("risk_score", 0) for a in scored[:10]]
    aggregate_score = round(sum(top10_scores) / max(len(top10_scores), 1))

    # Confidence average
    all_confidences = [a.get("confidence", 0.4) for a in scored]
    confidence_avg = round(
        sum(all_confidences) / max(len(all_confidences), 1), 2
    )

    all_keywords = list(
        set(kw for a in scored for kw in (a.get("risk_keywords_matched", []) or []))
    )

    return {
        "articles": scored,
        "top_alerts": scored[:5],
        "aggregate_risk_score": aggregate_score,
        "confidence_avg": confidence_avg,
        "risk_breakdown": {
            "critical": len(critical),
            "high": len(high),
            "medium": len(medium),
            "low": len(scored) - len(critical) - len(high) - len(medium),
        },
        "all_risk_keywords": all_keywords,
        "overall_risk_level": (
            "CRITICAL" if critical
            else "HIGH" if high
            else "MEDIUM" if medium
            else "LOW"
        ),
    }
