from fastapi.testclient import TestClient
import sys
import json
import logging
import asyncio
import os

# Import app from main
from main import app, model_store

client = TestClient(app)

# We need to manually call the lifespan to initialize the models
async def setup_models():
    # Simulate what lifespan does
    from main import RandomForestCreditScorer, IsolationForestAnomalyDetector, NLPSentimentAnalyzer, WebIntelligenceService
    
    scorer = RandomForestCreditScorer()
    scorer.train()
    
    anomaly_detector = IsolationForestAnomalyDetector()
    nlp_analyzer = NLPSentimentAnalyzer()
    web_intel = WebIntelligenceService()

    model_store["scorer"] = scorer
    model_store["anomaly"] = anomaly_detector
    model_store["nlp"] = nlp_analyzer
    model_store["web_intel"] = web_intel

asyncio.run(setup_models())

def run_test(name, payload):
    print(f"\n--- Running Test: {name} ---")
    response = client.post("/analyze", json=payload)
    if response.status_code == 200:
        data = response.json()
        print(f"Status Code: {response.status_code}")
        print(f"ML Score: {data.get('ml_risk_score')}")
        print(f"Prob Default: {data.get('probability_default')}")
        print(f"Risk Category: {data.get('risk_category')}")
        print(f"Insufficient Data: {data.get('insufficient_data')}")
        print(f"Anomaly Detected: {data.get('anomaly_detected')}")
        
        shap = data.get('shap_explanation', {})
        print(f"SHAP Narrative available: {bool(shap.get('narrative'))}")
        
        print("SHAP top factors:")
        for factor in shap.get('top_factors', []):
            fname = factor.get('display_name')
            impact = factor.get('impact')
            print(f"  - {fname}: {impact}")
    else:
        print(f"Failed: {response.status_code}")
        print(response.text)

# 1. Valid Low Risk
run_test("Valid Low Risk", {
    "application_id": "VAL-LOW-1",
    "company_name": "Steady Corp",
    "debt_to_equity": 0.3,
    "revenue_growth": 15.0,
    "interest_coverage": 10.0,
    "current_ratio": 2.5,
    "ebitda_margin": 20.0,
    "gst_compliance_score": 98.0,
    "credit_score": 820,
    "annual_revenue": 100000000.0,
    "total_debt": 5000000.0,
    "litigation_count": 0
})

# 2. High Risk
run_test("High Risk Input", {
    "application_id": "VAL-HIGH-1",
    "company_name": "Stressed Ltd",
    "debt_to_equity": 15.0,
    "revenue_growth": -20.0,
    "interest_coverage": 0.5,
    "current_ratio": 0.4,
    "ebitda_margin": -5.0,
    "gst_compliance_score": 30.0,
    "credit_score": 450,
    "annual_revenue": 10000000.0,
    "total_debt": 50000000.0,
    "litigation_count": 3
})

# 3. Missing Revenue
run_test("Zero Revenue (Failure Handling)", {
    "application_id": "FAIL-ZERO-1",
    "company_name": "Empty Shell",
    "debt_to_equity": 1.0,
    "revenue_growth": 0.0,
    "interest_coverage": 1.0,
    "current_ratio": 1.0,
    "ebitda_margin": 0.0,
    "gst_compliance_score": 50.0,
    "credit_score": 600,
    "annual_revenue": 0.0,
    "total_debt": 1000000.0
})

# 4. Extreme Values
run_test("Extreme Values", {
    "application_id": "EXTREME-1",
    "company_name": "Hyper Debt",
    "debt_to_equity": 1000.0,
    "revenue_growth": 500.0,
    "interest_coverage": 0.01,
    "current_ratio": 0.01,
    "ebitda_margin": 100.0,
    "gst_compliance_score": 10.0,
    "credit_score": 300,
    "annual_revenue": 1000.0,
    "total_debt": 9999999999.0
})
