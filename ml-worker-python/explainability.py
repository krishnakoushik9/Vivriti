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
    "loan_amnt": "Loan Amount",
    "annual_inc": "Annual Income",
    "dti": "Debt-to-Income Ratio (DTI)",
    "delinq_2yrs": "Delinquencies (Last 2 Years)",
    "revol_util": "Revolving Credit Utilization (%)",
    "int_rate": "Interest Rate (%)",
    "installment": "Monthly Installment",
    "grade_encoded": "Credit Grade (Risk Level)",
}

# Risk interpretations for each feature direction
FEATURE_INTERPRETATIONS = {
    "loan_amnt": {
        "high": "High loan amount relative to income increases repayment burden",
        "low": "Moderate loan amount is well-supported by borrower financials",
    },
    "annual_inc": {
        "high": "Strong annual income provides a healthy cushion for debt servicing",
        "low": "Low annual income limits the capacity to manage large debt obligations",
    },
    "dti": {
        "high": "High Debt-to-Income ratio indicates the borrower is over-leveraged",
        "low": "Low DTI ratio suggests significant disposable income for debt repayment",
    },
    "delinq_2yrs": {
        "high": "Recent delinquencies indicate a pattern of credit mismanagement or distress",
        "low": "Clean delinquency record demonstrates reliable repayment behavior",
    },
    "revol_util": {
        "high": "High credit card utilization signals potential liquidity stress",
        "low": "Low utilization indicates prudent use of revolving credit lines",
    },
    "int_rate": {
        "high": "Higher interest rate reflects elevated market-perceived risk",
        "low": "Competitive interest rate indicates a lower risk profile",
    },
    "installment": {
        "high": "High monthly installments may strain borrower's monthly cash flow",
        "low": "Manageable installments reduce the likelihood of payment defaults",
    },
    "grade_encoded": {
        "high": "Lower internal credit grade signals higher structural risk",
        "low": "Premium credit grade reflects strong overall creditworthiness",
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
            "direction": "risk_driver" if val > 0 else "credit_driver",
            "impact": "increases_default_risk" if val > 0 else "improves_creditworthiness",
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
        "top_positive_risk_drivers": [
            {"feature": k, **v} for k, v in sorted_factors if v["shap_value"] > 0
        ][:3],
        "top_credit_drivers": [
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
        if shap_val < 0:
            # Negative SHAP reduces default probability -> Strength
            explanation = interp.get("low" if "dti" in fname or "delinq" in fname or "util" in fname else "high", 
                                   f"{display} contributes positively to creditworthiness")
            positive_factors.append(f"**{display}** ({fval:.2f}): {explanation}")
        else:
            # Positive SHAP increases default probability -> Risk
            explanation = interp.get("high" if "dti" in fname or "delinq" in fname or "util" in fname else "low", 
                                   f"{display} raises concerns about default risk")
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
