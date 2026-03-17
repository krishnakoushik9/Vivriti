"""
IntelliCredit Explainability Module
====================================
SHAP-based model explainability for credit risk decisions.
Provides transparent, human-readable explanations for why a score was assigned.
"""

import logging
import numpy as np
from typing import Dict, Any, List, Optional

logger = logging.getLogger("intellicredit.explainability")

# Feature display names for human-readable output
FEATURE_DISPLAY_NAMES = {
    "debt_to_equity": "Debt-to-Equity Ratio",
    "revenue_growth": "Revenue Growth (%)",
    "interest_coverage": "Interest Coverage Ratio",
    "current_ratio": "Current Ratio",
    "ebitda_margin": "EBITDA Margin (%)",
    "gst_compliance_score": "GST Compliance Score",
    "credit_score_normalized": "CIBIL Credit Score",
    "revenue_log": "Revenue Size (log)",
    "debt_ratio": "Debt-to-Revenue Ratio",
    "working_capital_proxy": "Working Capital Health",
}

# Risk interpretations for each feature direction
FEATURE_INTERPRETATIONS = {
    "debt_to_equity": {
        "high": "Excessive leverage indicates over-reliance on debt financing, increasing default risk",
        "low": "Conservative debt structure provides financial stability and repayment capacity",
    },
    "revenue_growth": {
        "high": "Strong revenue trajectory indicates business momentum and market demand",
        "low": "Declining or stagnant revenue signals competitive weakness or market contraction",
    },
    "interest_coverage": {
        "high": "Strong ability to service debt obligations from operating earnings",
        "low": "Weak debt service coverage raises concerns about loan repayment capacity",
    },
    "current_ratio": {
        "high": "Healthy short-term liquidity position to meet working capital needs",
        "low": "Liquidity stress may lead to difficulty in meeting short-term obligations",
    },
    "ebitda_margin": {
        "high": "Strong operational profitability indicates efficient business operations",
        "low": "Thin operating margins leave little buffer for economic downturns",
    },
    "gst_compliance_score": {
        "high": "Excellent GST filing discipline indicates transparent revenue reporting",
        "low": "Low GST compliance raises red flags about revenue authenticity and circular trading",
    },
    "credit_score_normalized": {
        "high": "Strong credit history demonstrates reliable financial behavior",
        "low": "Poor credit history signals past defaults or payment irregularities",
    },
    "debt_ratio": {
        "high": "High debt relative to revenue strains cash flow capacity",
        "low": "Low debt relative to revenue provides strong repayment buffer",
    },
    "working_capital_proxy": {
        "high": "Adequate working capital cycle management",
        "low": "Working capital stress could impact day-to-day operations",
    },
}


def generate_risk_explanation(
    model: Any,
    features: Dict[str, float],
    feature_names: List[str],
    prediction_score: float,
) -> Dict[str, Any]:
    """
    Generate SHAP-based explainability for a credit risk prediction.
    
    Uses TreeExplainer for tree-based models (RandomForest, XGBoost, LightGBM).
    Falls back to feature importance if SHAP is unavailable.
    """
    try:
        import shap
        return _shap_explanation(model, features, feature_names, prediction_score)
    except ImportError:
        logger.warning("SHAP not installed, using feature importance fallback")
        return _feature_importance_explanation(model, features, feature_names, prediction_score)
    except Exception as e:
        import traceback
        logger.error(f"SHAP explanation failed: {e}\n{traceback.format_exc()}")
        return _feature_importance_explanation(model, features, feature_names, prediction_score)


def _shap_explanation(
    model: Any,
    features: Dict[str, float],
    feature_names: List[str],
    prediction_score: float,
) -> Dict[str, Any]:
    """Generate explanation using SHAP TreeExplainer."""
    import shap

    # Prepare input array
    feature_values = np.array([[features.get(f, 0.0) for f in feature_names]])

    # Use TreeExplainer for tree-based models
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(feature_values)

    # For binary classification, use positive class SHAP values if multi-output
    if isinstance(shap_values, list):
        sv = shap_values[1][0] if len(shap_values) > 1 else shap_values[0][0]
    elif len(shap_values.shape) == 3:
        # (n_samples, n_features, n_classes)
        sv = shap_values[0, :, 1]
    elif len(shap_values.shape) == 2:
        # (n_samples, n_features)
        sv = shap_values[0]
    else:
        sv = shap_values

    # Build feature contribution dict
    contributions = {}
    for i, fname in enumerate(feature_names):
        try:
            # Force conversion to scalar float using .item()
            val = float(np.array(sv[i]).item())
        except (TypeError, IndexError, ValueError, AttributeError) as e:
            logger.warning(f"Failed to convert SHAP value for {fname}: {e}")
            val = 0.0
            
        contributions[fname] = {
            "shap_value": round(val, 4),
            "feature_value": round(float(features.get(fname, 0.0)), 4),
            "display_name": FEATURE_DISPLAY_NAMES.get(fname, fname),
            "direction": "positive" if val > 0 else "negative",
            "impact": "increases_creditworthiness" if val > 0 else "decreases_creditworthiness",
        }

    # Sort by absolute SHAP value
    sorted_factors = sorted(contributions.items(), key=lambda x: abs(x[1]["shap_value"]), reverse=True)
    top_factors = sorted_factors[:5]

    # Generate narrative
    narrative = _generate_narrative(top_factors, prediction_score, features)

    return {
        "method": "SHAP_TreeExplainer",
        "shap_values": {k: v["shap_value"] for k, v in contributions.items()},
        "feature_contributions": contributions,
        "top_positive_factors": [
            {"feature": k, **v} for k, v in sorted_factors if v["shap_value"] > 0
        ][:3],
        "top_negative_factors": [
            {"feature": k, **v} for k, v in sorted_factors if v["shap_value"] < 0
        ][:3],
        "top_factors": [{"feature": k, **v} for k, v in top_factors],
        "narrative": narrative,
        "base_value": round(float(np.array(explainer.expected_value).flatten()[1] if np.array(explainer.expected_value).size > 1 else np.array(explainer.expected_value).item()), 4),
    }


def _feature_importance_explanation(
    model: Any,
    features: Dict[str, float],
    feature_names: List[str],
    prediction_score: float,
) -> Dict[str, Any]:
    """Fallback explanation using model feature importances."""
    try:
        importances = model.feature_importances_
    except AttributeError:
        importances = np.ones(len(feature_names)) / len(feature_names)

    contributions = {}
    for i, fname in enumerate(feature_names):
        fval = features.get(fname, 0.0)
        imp = float(importances[i])

        # Determine direction based on feature value relative to typical thresholds
        direction = _infer_direction(fname, fval)

        contributions[fname] = {
            "importance": round(imp, 4),
            "feature_value": round(fval, 4),
            "display_name": FEATURE_DISPLAY_NAMES.get(fname, fname),
            "direction": direction,
        }

    sorted_factors = sorted(contributions.items(), key=lambda x: x[1]["importance"], reverse=True)
    top_factors = sorted_factors[:5]

    narrative = _generate_narrative_from_importance(top_factors, prediction_score, features)

    return {
        "method": "FeatureImportance_Fallback",
        "feature_contributions": contributions,
        "top_factors": [{"feature": k, **v} for k, v in top_factors],
        "narrative": narrative,
    }


def _infer_direction(feature_name: str, value: float) -> str:
    """Infer whether a feature value is good or bad for creditworthiness."""
    # Higher is worse
    bad_when_high = ["debt_to_equity", "debt_ratio"]
    # Higher is better
    good_when_high = [
        "revenue_growth", "interest_coverage", "current_ratio",
        "ebitda_margin", "gst_compliance_score", "credit_score_normalized",
        "working_capital_proxy",
    ]

    if feature_name in bad_when_high:
        return "negative" if value > 2.0 else "positive"
    elif feature_name in good_when_high:
        # Use reasonable thresholds
        thresholds = {
            "interest_coverage": 2.0,
            "current_ratio": 1.0,
            "ebitda_margin": 8.0,
            "gst_compliance_score": 0.7,
            "credit_score_normalized": 0.5,
            "revenue_growth": 5.0,
        }
        threshold = thresholds.get(feature_name, 0.5)
        return "positive" if value > threshold else "negative"
    return "neutral"


def _generate_narrative(
    top_factors: List,
    prediction_score: float,
    features: Dict[str, float],
) -> str:
    """Generate a natural language narrative from SHAP analysis."""
    if prediction_score >= 85:
        risk_level = "LOW"
        opening = "This applicant presents a **strong credit profile**."
    elif prediction_score >= 70:
        risk_level = "MODERATE"
        opening = "This applicant presents a **moderate credit profile** with some risk factors."
    elif prediction_score >= 50:
        risk_level = "ELEVATED"
        opening = "This applicant shows **elevated credit risk** requiring careful review."
    else:
        risk_level = "HIGH"
        opening = "This applicant presents **significant credit risk** with multiple concerning factors."

    # Build factor explanations
    positive_factors = []
    negative_factors = []

    for fname, fdata in top_factors:
        display = fdata.get("display_name", fname)
        shap_val = fdata.get("shap_value", 0)
        fval = fdata.get("feature_value", 0)

        interp = FEATURE_INTERPRETATIONS.get(fname, {})
        if shap_val > 0:
            explanation = interp.get("high", f"{display} contributes positively to creditworthiness")
            positive_factors.append(f"**{display}** ({fval:.2f}): {explanation}")
        else:
            explanation = interp.get("low", f"{display} raises concerns about creditworthiness")
            negative_factors.append(f"**{display}** ({fval:.2f}): {explanation}")

    parts = [opening, ""]

    if positive_factors:
        parts.append("**Strengths:**")
        for pf in positive_factors[:3]:
            parts.append(f"  • {pf}")
        parts.append("")

    if negative_factors:
        parts.append("**Risk Factors:**")
        for nf in negative_factors[:3]:
            parts.append(f"  • {nf}")
        parts.append("")

    parts.append(f"**Overall Risk Classification: {risk_level}** (Score: {prediction_score:.1f}/100)")

    return "\n".join(parts)


def _generate_narrative_from_importance(
    top_factors: List,
    prediction_score: float,
    features: Dict[str, float],
) -> str:
    """Generate narrative from feature importance (fallback)."""
    if prediction_score >= 85:
        opening = "This applicant presents a **strong credit profile**."
    elif prediction_score >= 70:
        opening = "This applicant presents a **moderate credit profile**."
    elif prediction_score >= 50:
        opening = "This applicant shows **elevated credit risk**."
    else:
        opening = "This applicant presents **significant credit risk**."

    parts = [opening, "", "**Key Decision Factors (by importance):**"]

    for fname, fdata in top_factors[:5]:
        display = fdata.get("display_name", fname)
        importance = fdata.get("importance", 0)
        fval = fdata.get("feature_value", 0)
        direction = fdata.get("direction", "neutral")

        icon = "✅" if direction == "positive" else "⚠️" if direction == "negative" else "ℹ️"
        parts.append(f"  {icon} **{display}**: {fval:.2f} (weight: {importance:.1%})")

    parts.append(f"\n**ML Risk Score: {prediction_score:.1f}/100**")
    return "\n".join(parts)
