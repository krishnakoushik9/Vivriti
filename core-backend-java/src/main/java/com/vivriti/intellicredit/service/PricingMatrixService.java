package com.vivriti.intellicredit.service;

import com.vivriti.intellicredit.entity.LoanApplication;
import com.vivriti.intellicredit.repository.LoanApplicationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;

/**
 * Deterministic Pricing Matrix Engine
 * Executes rule-based credit policy decisions post-ML scoring.
 * 
 * POLICY RULES (Hard-Coded, not AI-driven - as per RBI DL Guidelines 6(a)):
 * Rule 1: Score > 85 & No Anomalies → APPROVE ₹50L at 12%
 * Rule 2: Score > 70 & Mild Anomaly → COND.APPROVE ₹25L at 15%
 * Rule 3: Score < 50 OR CircularTrading → REJECT
 * Rule 4: Default catch → Reject with Review
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PricingMatrixService {

    private final LoanApplicationRepository repository;
    private final AuditService auditService;

    // Policy Constants
    private static final BigDecimal TIER_1_LIMIT = new BigDecimal("5000000.00"); // ₹50 Lakhs
    private static final BigDecimal TIER_2_LIMIT = new BigDecimal("2500000.00"); // ₹25 Lakhs
    private static final BigDecimal TIER_1_RATE = new BigDecimal("12.00"); // 12%
    private static final BigDecimal TIER_2_RATE = new BigDecimal("15.00"); // 15%
    private static final double SCORE_THRESHOLD_EXCELLENT = 85.0;
    private static final double SCORE_THRESHOLD_GOOD = 70.0;
    private static final double SCORE_THRESHOLD_REJECT = 50.0;

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

        // POLICY RULE EXECUTION - DETERMINISTIC, NOT AI-DRIVEN
        if (circularTradingRisk || mlScore < SCORE_THRESHOLD_REJECT) {
            // Hard rejection
            app.setFinalDecision(LoanApplication.DecisionType.REJECT);
            app.setRecommendedCreditLimit(BigDecimal.ZERO);
            app.setRecommendedInterestRate(BigDecimal.ZERO);
            policyRuleApplied = "RULE-3: REJECT";
            decisionRationale = circularTradingRisk
                    ? "FORCED REJECT: Circular Trading Risk detected by Isolation Forest"
                    : String.format("FORCED REJECT: ML Score %.1f < threshold %.1f", mlScore, SCORE_THRESHOLD_REJECT);
            app.setStatus(LoanApplication.ApplicationStatus.REJECTED);

        } else if (mlScore >= SCORE_THRESHOLD_EXCELLENT && !anomalyDetected) {
            // Premium approval
            app.setFinalDecision(LoanApplication.DecisionType.APPROVE);
            app.setRecommendedCreditLimit(TIER_1_LIMIT);
            app.setRecommendedInterestRate(TIER_1_RATE);
            policyRuleApplied = "RULE-1: TIER-1 APPROVE";
            decisionRationale = String.format(
                    "APPROVED: ML Score %.1f > %.1f with No Anomalies. Credit Limit ₹50L @ 12%%",
                    mlScore, SCORE_THRESHOLD_EXCELLENT);
            app.setStatus(LoanApplication.ApplicationStatus.COMPLETED);

        } else if (mlScore >= SCORE_THRESHOLD_GOOD && anomalyDetected) {
            // Conditional approval with higher rate
            app.setFinalDecision(LoanApplication.DecisionType.CONDITIONAL_APPROVE);
            app.setRecommendedCreditLimit(TIER_2_LIMIT);
            app.setRecommendedInterestRate(TIER_2_RATE);
            policyRuleApplied = "RULE-2: TIER-2 CONDITIONAL APPROVE";
            decisionRationale = String.format(
                    "CONDITIONAL APPROVE: ML Score %.1f > %.1f but Mild Anomaly detected. Credit Limit ₹25L @ 15%%",
                    mlScore, SCORE_THRESHOLD_GOOD);
            app.setStatus(LoanApplication.ApplicationStatus.COMPLETED);

        } else if (mlScore >= SCORE_THRESHOLD_GOOD) {
            // Good score, no anomaly but between tiers
            app.setFinalDecision(LoanApplication.DecisionType.APPROVE);
            app.setRecommendedCreditLimit(TIER_2_LIMIT);
            app.setRecommendedInterestRate(TIER_2_RATE);
            policyRuleApplied = "RULE-2B: TIER-2 APPROVE";
            decisionRationale = String.format(
                    "APPROVED: ML Score %.1f > %.1f. Credit Limit ₹25L @ 15%%",
                    mlScore, SCORE_THRESHOLD_GOOD);
            app.setStatus(LoanApplication.ApplicationStatus.COMPLETED);

        } else {
            // Default catch - reject
            app.setFinalDecision(LoanApplication.DecisionType.REJECT);
            app.setRecommendedCreditLimit(BigDecimal.ZERO);
            app.setRecommendedInterestRate(BigDecimal.ZERO);
            policyRuleApplied = "RULE-DEFAULT: REJECT";
            decisionRationale = String.format(
                    "REJECT: ML Score %.1f between thresholds with no clear approval path", mlScore);
            app.setStatus(LoanApplication.ApplicationStatus.REJECTED);
        }

        // Persist policy trace on application record (UI-visible)
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
