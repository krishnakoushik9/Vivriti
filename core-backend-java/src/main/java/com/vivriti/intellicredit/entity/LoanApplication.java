package com.vivriti.intellicredit.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "loan_applications")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LoanApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String applicationId;

    @Column(nullable = false)
    private String companyName;

    @Column(nullable = false)
    private String sector;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ApplicationStatus status;

    // Financials extracted via Databricks mock ingestion
    @Column(precision = 15, scale = 2)
    private BigDecimal annualRevenue;

    @Column(precision = 15, scale = 2)
    private BigDecimal totalDebt;

    @Column(precision = 15, scale = 2)
    private BigDecimal equity;

    @Column(precision = 5, scale = 2)
    private BigDecimal debtToEquityRatio;

    @Column(precision = 5, scale = 2)
    private BigDecimal revenueGrowthPercent;

    @Column(precision = 5, scale = 2)
    private BigDecimal interestCoverageRatio;

    @Column(precision = 5, scale = 2)
    private BigDecimal currentRatio;

    @Column(precision = 5, scale = 2)
    private BigDecimal ebitdaMargin;

    // GST Compliance Score (0-100)
    @Column(precision = 5, scale = 2)
    private BigDecimal gstComplianceScore;

    // CIBIL / Credit Score
    private Integer creditScore;

    // Primary Due Diligence (Credit Officer Notes)
    @Column(columnDefinition = "TEXT")
    private String creditOfficerNotes;

    // ML Output
    @Column(precision = 5, scale = 2)
    private BigDecimal mlRiskScore;

    private Boolean anomalyDetected;
    private Boolean circularTradingRisk;

    @Column(columnDefinition = "TEXT")
    private String anomalyDetails;

    // NLP Sentiment
    @Column(precision = 5, scale = 2)
    private BigDecimal sentimentScore; // -1.0 to 1.0

    @Column(columnDefinition = "TEXT")
    private String newsIntelligenceSummary;

    // Final Decision (Pricing Matrix Output)
    @Enumerated(EnumType.STRING)
    private DecisionType finalDecision;

    @Column(precision = 15, scale = 2)
    private BigDecimal recommendedCreditLimit;

    @Column(precision = 5, scale = 2)
    private BigDecimal recommendedInterestRate;

    // Policy trace (deterministic decisioning)
    private String policyRuleApplied;

    @Column(columnDefinition = "TEXT")
    private String decisionRationale;

    // CAM Document
    @Column(columnDefinition = "TEXT")
    private String camDocument;

    // Explainability + research evidence (raw JSON persisted from Python worker)
    @Column(columnDefinition = "TEXT")
    private String shapExplanationJson;

    @Column(columnDefinition = "TEXT")
    private String researchDataJson;

    // Document Processing
    private Boolean documentsUploaded;
    private Double ocrConfidenceScore;
    private Boolean humanValidationRequired;

    // Raw document extraction payload(s) from Python document_ai
    @Column(columnDefinition = "TEXT")
    private String documentExtractionJson;

    private String lastUploadedDocumentName;
    private String lastUploadedDocumentType;
    private Double lastUploadedDocumentConfidence;

    // Timestamps
    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public enum ApplicationStatus {
        PENDING, INGESTING, PROCESSING, SCORING, GENERATING_CAM, COMPLETED, REJECTED, PENDING_HUMAN_REVIEW
    }

    public enum DecisionType {
        APPROVE, CONDITIONAL_APPROVE, REJECT, PENDING_REVIEW
    }
}
