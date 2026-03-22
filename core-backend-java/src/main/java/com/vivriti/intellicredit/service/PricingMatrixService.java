package com.vivriti.intellicredit.service;

import com.vivriti.intellicredit.entity.LoanApplication;
import com.vivriti.intellicredit.repository.LoanApplicationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Deterministic Pricing Matrix Engine
 * Executes rule-based credit policy decisions post-ML scoring.
 * 
 * DYNAMIC PRICING (RBI DL Guidelines 6(a) Compliant):
 * - Limit: 10% of Annual Revenue (Cap ₹500 Cr)
 * - Multiplier: 100% for Excellent score, 60% for Good, 30% for others.
 * - Anomaly Penalty: 50% limit reduction + 3% rate premium.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PricingMatrixService {

    private final LoanApplicationRepository repository;
    private final AuditService auditService;

    // Policy Constants
    private static final double SCORE_THRESHOLD_EXCELLENT = 85.0;
    private static final double SCORE_THRESHOLD_GOOD = 70.0;
    private static final double SCORE_THRESHOLD_REJECT = 50.0;
    private static final BigDecimal MAX_CAP = new BigDecimal("5000000000.00"); // ₹500 Cr

    public LoanApplication applyPricingMatrix(
            String applicationId,
            double mlScore,
            boolean anomalyDetected,
            boolean circularTradingRisk) {
        LoanApplication app = repository.findByApplicationId(applicationId)
                .orElseThrow(() -> new RuntimeException("Application not found: " + applicationId));

        app.setMlRiskScore(BigDecimal.valueOf(mlScore));
        app.setAnomalyDetected(anomalyDetected);
        app.setCircularTradingRisk(circularTradingRisk);

        String policyRuleApplied;
        String decisionRationale;
        BigDecimal finalLimit = BigDecimal.ZERO;
        BigDecimal finalRate = BigDecimal.ZERO;

        // Fetch annual revenue from application
        BigDecimal annualRevenue = app.getAnnualRevenue() != null ? app.getAnnualRevenue() : BigDecimal.ZERO;

        // 1. Core Rejection Logic
        if (circularTradingRisk || mlScore < SCORE_THRESHOLD_REJECT) {
            app.setFinalDecision(LoanApplication.DecisionType.REJECT);
            finalLimit = BigDecimal.ZERO;
            finalRate = BigDecimal.ZERO;
            policyRuleApplied = "RULE-REJECT: HIGH_RISK";
            decisionRationale = circularTradingRisk
                    ? "FORCED REJECT: Circular Trading Risk detected"
                    : String.format("FORCED REJECT: ML Score %.1f < %.1f", mlScore, SCORE_THRESHOLD_REJECT);
            app.setStatus(LoanApplication.ApplicationStatus.REJECTED);

        } else {
            // 2. Dynamic Calculation
            BigDecimal baseLimit = annualRevenue.multiply(new BigDecimal("0.10"));
            double multiplier = 0.3;
            double rate = 15.0;

            if (mlScore >= SCORE_THRESHOLD_EXCELLENT) {
                multiplier = 1.0;
                rate = 10.5;
                policyRuleApplied = "RULE-DYNAMIC: TIER-1 EXCELLENT";
            } else if (mlScore >= SCORE_THRESHOLD_GOOD) {
                multiplier = 0.6;
                rate = 12.5;
                policyRuleApplied = "RULE-DYNAMIC: TIER-2 GOOD";
            } else {
                policyRuleApplied = "RULE-DYNAMIC: TIER-3 MARGINAL";
            }

            // Anomaly Penalty
            if (anomalyDetected) {
                multiplier *= 0.5;
                rate += 3.0;
                policyRuleApplied += "_WITH_ANOMALY";
            }

            finalLimit = baseLimit.multiply(BigDecimal.valueOf(multiplier));
            finalRate = BigDecimal.valueOf(rate);

            // Cap at ₹500 Cr
            if (finalLimit.compareTo(MAX_CAP) > 0) {
                finalLimit = MAX_CAP;
            }

            app.setFinalDecision(anomalyDetected ? LoanApplication.DecisionType.CONDITIONAL_APPROVE : LoanApplication.DecisionType.APPROVE);
            app.setStatus(LoanApplication.ApplicationStatus.COMPLETED);
            
            String amountStr = finalLimit.compareTo(new BigDecimal("10000000")) >= 0 
                ? String.format("₹%.1f Cr", finalLimit.divide(new BigDecimal("10000000"), 2, RoundingMode.HALF_UP).doubleValue())
                : String.format("₹%.1f L", finalLimit.divide(new BigDecimal("100000"), 2, RoundingMode.HALF_UP).doubleValue());

            decisionRationale = String.format(
                    "DYNAMIC %s: Score %.1f, Revenue Capacity Apply. Limit %s @ %.1f%%",
                    app.getFinalDecision(), mlScore, amountStr, rate);
        }

        app.setRecommendedCreditLimit(finalLimit);
        app.setRecommendedInterestRate(finalRate);
        app.setPolicyRuleApplied(policyRuleApplied);
        app.setDecisionRationale(decisionRationale);

        LoanApplication saved = repository.save(app);

        // Immutable audit log entry for the decision
        auditService.logEvent(
                applicationId,
                "PRICING_MATRIX_DECISION",
                "DETERMINISTIC_POLICY_ENGINE",
                String.format("mlScore=%.2f, anomalyDetected=%b, circularTrading=%b", mlScore, anomalyDetected,
                        circularTradingRisk),
                String.format("Rule=%s | Decision=%s | Limit=%s | Rate=%s | Rationale=%s",
                        policyRuleApplied,
                        app.getFinalDecision(),
                        app.getRecommendedCreditLimit(),
                        app.getRecommendedInterestRate(),
                        decisionRationale),
                "SUCCESS",
                "RBI-DL-6(a)",
                "ISO27001-A.18.1");

        log.info("[PRICING MATRIX] Application: {} | Rule: {} | Decision: {} | Score: {}",
                applicationId, policyRuleApplied, app.getFinalDecision(), mlScore);

        return saved;
    }
}
