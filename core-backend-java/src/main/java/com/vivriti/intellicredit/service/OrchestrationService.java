package com.vivriti.intellicredit.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vivriti.intellicredit.entity.LoanApplication;
import com.vivriti.intellicredit.repository.LoanApplicationRepository;
import com.vivriti.intellicredit.security.JwtTokenUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Orchestration Service - Central coordinator between services
 * Manages the async processing pipeline:
 * Java → (Event Queue) → Python ML Worker → Java Pricing Matrix → Node BFF →
 * Frontend
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OrchestrationService {

    private final LoanApplicationRepository repository;

    private final PricingMatrixService pricingMatrixService;
    private final AuditService auditService;
    private final JwtTokenUtil jwtTokenUtil;
    private final ObjectMapper objectMapper;

    @Value("${services.python-worker.url}")
    private String pythonWorkerUrl;

    @Value("${services.bff-node.url}")
    private String bffNodeUrl;

    private final WebClient webClient = WebClient.builder().build();

    /**
     * Main orchestration entry point
     * Triggered when credit officer clicks "Generate Credit Intelligence & CAM"
     */
    @Async
    public CompletableFuture<LoanApplication> orchestrateCreditAnalysis(
            String applicationId,
            String creditOfficerNotes) {
        log.info("[ORCHESTRATOR] Starting credit analysis pipeline for: {}", applicationId);

        try {
            // Step 1: Update status to PROCESSING
            LoanApplication app = repository.findByApplicationId(applicationId)
                    .orElseThrow(() -> new RuntimeException("Application not found: " + applicationId));

            app.setCreditOfficerNotes(creditOfficerNotes);
            app.setStatus(LoanApplication.ApplicationStatus.PROCESSING);
            repository.save(app);

            auditService.logEvent(applicationId, "ORCHESTRATION_STARTED", "ORCHESTRATOR",
                    "creditOfficerNotes=" + (creditOfficerNotes != null
                            ? creditOfficerNotes.substring(0, Math.min(100, creditOfficerNotes.length()))
                            : "null"),
                    "Pipeline initiated", "SUCCESS", "RBI-DL-5.1", "ISO27001-A.12.4");

            // Step 2: Notify BFF (Node.js) - progress update: Step 1 complete
            notifyBff(applicationId, "INGESTING", "Databricks data ingested successfully", 25);

            // Step 3: Send to Python ML Worker
            app.setStatus(LoanApplication.ApplicationStatus.SCORING);
            repository.save(app);
            notifyBff(applicationId, "RUNNING_MODELS", "Running Hybrid ML Risk Models (RF + IsoForest + NLP)", 50);

            Map<String, Object> mlPayload = buildMlPayload(app, creditOfficerNotes);
            Map<String, Object> mlResult = callPythonWorker(mlPayload);

            // Step 4: Update with ML output
            notifyBff(applicationId, "CRAWLING_INTELLIGENCE", "Crawling web intelligence & news feeds", 75);

            double mlScore = ((Number) mlResult.getOrDefault("ml_risk_score", 50.0)).doubleValue();
            boolean anomaly = (boolean) mlResult.getOrDefault("anomaly_detected", false);
            boolean circularTrading = (boolean) mlResult.getOrDefault("circular_trading_risk", false);
            String camDocument = (String) mlResult.getOrDefault("cam_document", "CAM generation pending...");
            String anomalyDetails = (String) mlResult.getOrDefault("anomaly_details", "");
            double sentiment = ((Number) mlResult.getOrDefault("sentiment_score", 0.0)).doubleValue();
            String newsIntel = (String) mlResult.getOrDefault("news_intelligence", "");
            Object shapExplanationObj = mlResult.get("shap_explanation");
            Object researchDataObj = mlResult.get("research_data");

            // Update app with ML results
            app = repository.findByApplicationId(applicationId).get();
            app.setAnomalyDetails(anomalyDetails);
            app.setSentimentScore(java.math.BigDecimal.valueOf(sentiment));
            app.setNewsIntelligenceSummary(newsIntel);
            app.setCamDocument(camDocument);
            if (shapExplanationObj != null) {
                app.setShapExplanationJson(objectMapper.writeValueAsString(shapExplanationObj));
            }
            if (researchDataObj != null) {
                app.setResearchDataJson(objectMapper.writeValueAsString(researchDataObj));
            }
            repository.save(app);

            auditService.logEvent(applicationId, "ML_SCORE_RECEIVED", "ML_WORKER_PYTHON",
                    objectMapper.writeValueAsString(mlPayload),
                    objectMapper.writeValueAsString(mlResult), "SUCCESS", "RBI-DL-6.2", "ISO27001-A.18.2");

            // Step 5: Apply Deterministic Pricing Matrix
            notifyBff(applicationId, "SYNTHESIZING_CAM", "Synthesizing final CAM document", 90);
            LoanApplication finalApp = pricingMatrixService.applyPricingMatrix(
                    applicationId, mlScore, anomaly, circularTrading);
            finalApp.setCamDocument(camDocument);
            repository.save(finalApp);

            // Step 6: Final notification
            notifyBff(applicationId, "COMPLETED", "Credit Intelligence & CAM ready for review", 100);

            log.info("[ORCHESTRATOR] Pipeline complete for: {} | Decision: {}",
                    applicationId, finalApp.getFinalDecision());

            return CompletableFuture.completedFuture(finalApp);

        } catch (Exception e) {
            log.error("[ORCHESTRATOR] Pipeline failed for: {}", applicationId, e);
            auditService.logEvent(applicationId, "ORCHESTRATION_FAILED", "ORCHESTRATOR",
                    "applicationId=" + applicationId, e.getMessage(), "FAILURE", null, null);

            // Update status to reflect error
            repository.findByApplicationId(applicationId).ifPresent(app -> {
                app.setStatus(LoanApplication.ApplicationStatus.REJECTED);
                repository.save(app);
            });

            notifyBff(applicationId, "ERROR", "Processing failed: " + e.getMessage(), -1);
            return CompletableFuture.failedFuture(e);
        }
    }

    private Map<String, Object> buildMlPayload(LoanApplication app, String creditOfficerNotes) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("application_id", app.getApplicationId());
        payload.put("company_name", app.getCompanyName());
        payload.put("sector", app.getSector());
        // ML worker requires non-null numerics (FastAPI/Pydantic) — provide safe defaults
        payload.put("debt_to_equity", app.getDebtToEquityRatio() != null ? app.getDebtToEquityRatio() : 0.0);
        payload.put("revenue_growth", app.getRevenueGrowthPercent() != null ? app.getRevenueGrowthPercent() : 0.0);
        payload.put("interest_coverage", app.getInterestCoverageRatio() != null ? app.getInterestCoverageRatio() : 0.0);
        payload.put("current_ratio", app.getCurrentRatio() != null ? app.getCurrentRatio() : 0.0);
        payload.put("ebitda_margin", app.getEbitdaMargin() != null ? app.getEbitdaMargin() : 0.0);
        payload.put("gst_compliance_score", app.getGstComplianceScore() != null ? app.getGstComplianceScore() : 0.0);
        payload.put("credit_score", app.getCreditScore() != null ? app.getCreditScore() : 650);
        payload.put("annual_revenue", app.getAnnualRevenue() != null ? app.getAnnualRevenue() : 0.0);
        payload.put("total_debt", app.getTotalDebt() != null ? app.getTotalDebt() : 0.0);
        payload.put("credit_officer_notes", creditOfficerNotes);

        // Attach uploaded document extraction payloads so the ML worker can do doc-grounded checks
        if (app.getDocumentExtractionJson() != null && !app.getDocumentExtractionJson().isBlank()) {
            try {
                Object docObj = objectMapper.readValue(app.getDocumentExtractionJson(), Object.class);
                payload.put("document_extractions", docObj);

                // Doc-driven feature overrides (best-effort):
                Map<String, Object> overrides = deriveFeatureOverridesFromDocs(docObj);
                if (!overrides.isEmpty()) {
                    payload.putAll(overrides);
                    payload.put("doc_driven_features", true);
                } else {
                    payload.put("doc_driven_features", false);
                }
            } catch (Exception e) {
                log.warn("[ORCHESTRATOR] Failed to parse documentExtractionJson: {}", e.getMessage());
            }
        }
        return payload;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> deriveFeatureOverridesFromDocs(Object docObj) {
        Map<String, Object> overrides = new HashMap<>();
        List<Map<String, Object>> docs;

        if (docObj instanceof List) {
            docs = ((List<Object>) docObj).stream()
                    .filter(o -> o instanceof Map)
                    .map(o -> (Map<String, Object>) o)
                    .toList();
        } else if (docObj instanceof Map) {
            docs = List.of((Map<String, Object>) docObj);
        } else {
            return overrides;
        }

        Map<String, Object> balanceSheet = firstStructuredData(docs, "balance_sheet");
        Map<String, Object> incomeStatement = firstStructuredData(docs, "income_statement");
        Map<String, Object> gstReturn = firstStructuredData(docs, "gst_return");

        // Annual revenue: prefer Income Statement total_revenue → revenue_from_operations → GST taxable_value
        Double totalRevenue = getDouble(incomeStatement, "total_revenue");
        if (totalRevenue == null) totalRevenue = getDouble(incomeStatement, "revenue_from_operations");
        if (totalRevenue == null) totalRevenue = getDouble(gstReturn, "taxable_value");
        if (totalRevenue != null && totalRevenue > 0) overrides.put("annual_revenue", totalRevenue);

        // Total debt: prefer Balance Sheet borrowings → total_liabilities (as a fallback proxy)
        Double borrowings = getDouble(balanceSheet, "borrowings");
        if (borrowings == null) borrowings = getDouble(balanceSheet, "total_liabilities");
        if (borrowings != null && borrowings > 0) overrides.put("total_debt", borrowings);

        // Ratios / margins
        Double currentRatio = getDouble(balanceSheet, "current_ratio");
        if (currentRatio != null && currentRatio > 0) overrides.put("current_ratio", currentRatio);

        Double icr = getDouble(incomeStatement, "interest_coverage_ratio");
        if (icr != null && icr > 0) overrides.put("interest_coverage", icr);

        Double ebitdaMargin = getDouble(incomeStatement, "ebitda_margin");
        if (ebitdaMargin != null) overrides.put("ebitda_margin", ebitdaMargin);

        // Debt-to-equity: if equity present and borrowings present
        Double equity = getDouble(balanceSheet, "shareholders_equity");
        if (equity != null && equity > 0 && borrowings != null && borrowings > 0) {
            overrides.put("debt_to_equity", borrowings / equity);
        }

        return overrides;
    }

    private Map<String, Object> firstStructuredData(List<Map<String, Object>> docs, String docType) {
        for (Map<String, Object> d : docs) {
            if (docType.equals(d.get("document_type")) && d.get("structured_data") instanceof Map) {
                //noinspection unchecked
                return (Map<String, Object>) d.get("structured_data");
            }
        }
        return Map.of();
    }

    private Double getDouble(Map<String, Object> m, String key) {
        if (m == null) return null;
        Object v = m.get(key);
        if (v instanceof Number) return ((Number) v).doubleValue();
        if (v instanceof String s) {
            try {
                return Double.parseDouble(s.replace(",", "").trim());
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> callPythonWorker(Map<String, Object> payload) {
        try {
            String serviceToken = jwtTokenUtil.generateServiceToken("java-core-backend");
            Map<String, Object> result = webClient.post()
                    .uri(pythonWorkerUrl + "/analyze")
                    .header("Authorization", "Bearer " + serviceToken)
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .bodyValue(payload)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .timeout(java.time.Duration.ofSeconds(120))
                    .block();
            return result != null ? result : getFallbackResult();
        } catch (Exception e) {
            log.error("[ORCHESTRATOR] Python worker call failed, using fallback: {}", e.getMessage());
            return getFallbackResult();
        }
    }

    private Map<String, Object> getFallbackResult() {
        Map<String, Object> fallback = new HashMap<>();
        fallback.put("ml_risk_score", 50.0);
        fallback.put("anomaly_detected", false);
        fallback.put("circular_trading_risk", false);
        fallback.put("cam_document",
                "# CAM Generation Error\n\nML Worker call failed. The service may be reachable, but the request was rejected or timed out. Check backend logs for the exact HTTP status (e.g., 422).");
        fallback.put("sentiment_score", 0.0);
        fallback.put("news_intelligence", "News intelligence unavailable - ML Worker call failed.");
        fallback.put("anomaly_details", "");
        return fallback;
    }

    private void notifyBff(String applicationId, String stage, String message, int progress) {
        try {
            Map<String, Object> event = new HashMap<>();
            event.put("applicationId", applicationId);
            event.put("stage", stage);
            event.put("message", message);
            event.put("progress", progress);
            event.put("timestamp", System.currentTimeMillis());

            String serviceToken = jwtTokenUtil.generateServiceToken("java-core-backend");
            webClient.post()
                    .uri(bffNodeUrl + "/internal/progress")
                    .header("Authorization", "Bearer " + serviceToken)
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .bodyValue(event)
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(java.time.Duration.ofSeconds(5))
                    .onErrorResume(e -> {
                        log.warn("[BFF NOTIFY] Failed to notify BFF (may be offline): {}", e.getMessage());
                        return Mono.empty();
                    })
                    .subscribe();
        } catch (Exception e) {
            log.warn("[BFF NOTIFY] Notification failed: {}", e.getMessage());
        }
    }
}
