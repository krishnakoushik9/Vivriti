package com.vivriti.intellicredit.controller;

import com.vivriti.intellicredit.entity.LoanApplication;
import com.vivriti.intellicredit.entity.AuditLog;
import com.vivriti.intellicredit.repository.LoanApplicationRepository;
import com.vivriti.intellicredit.service.AuditService;
import com.vivriti.intellicredit.service.DatabricksIngestionService;
import com.vivriti.intellicredit.service.OrchestrationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = { "http://localhost:3000", "http://localhost:3001" })
public class LoanApplicationController {

    private final LoanApplicationRepository repository;
    private final DatabricksIngestionService databricksService;
    private final OrchestrationService orchestrationService;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    /**
     * GET /api/v1/applications
     * Returns all pending applications (Dashboard view)
     */
    @GetMapping("/applications")
    public ResponseEntity<List<LoanApplication>> getAllApplications() {
        return ResponseEntity.ok(repository.findAllByOrderByCreatedAtDesc());
    }

    /**
     * POST /api/v1/applications
     * Creates a new (real-world) application shell so users can upload PDFs against the right company.
     * This does not require Databricks ingestion; doc extraction can later override underwriting features.
     */
    @PostMapping("/applications")
    public ResponseEntity<LoanApplication> createApplication(@RequestBody Map<String, Object> body) {
        try {
            String companyName = String.valueOf(body.getOrDefault("companyName", "")).trim();
            String sector = String.valueOf(body.getOrDefault("sector", "General")).trim();
            if (companyName.isBlank()) {
                return ResponseEntity.badRequest().build();
            }

            // Generate a unique app id (REAL-xxxxxx)
            String appId;
            int tries = 0;
            do {
                appId = "REAL-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
                tries++;
            } while (repository.existsByApplicationId(appId) && tries < 5);

            LoanApplication app = LoanApplication.builder()
                    .applicationId(appId)
                    .companyName(companyName)
                    .sector(sector.isBlank() ? "General" : sector)
                    .status(LoanApplication.ApplicationStatus.PENDING)
                    // Reasonable defaults for demo; doc upload can override core underwriting features in orchestration payload.
                    .creditScore(((Number) body.getOrDefault("creditScore", 650)).intValue())
                    .gstComplianceScore(java.math.BigDecimal.valueOf(((Number) body.getOrDefault("gstComplianceScore", 70)).doubleValue()))
                    .createdAt(LocalDateTime.now())
                    .updatedAt(LocalDateTime.now())
                    .build();

            LoanApplication saved = repository.save(app);
            auditService.logEvent(
                    saved.getApplicationId(),
                    "APPLICATION_CREATED",
                    "UI",
                    objectMapper.writeValueAsString(body),
                    "Created application shell for real-world document uploads",
                    "SUCCESS",
                    "RBI-DL-5.1",
                    "ISO27001-A.12.4"
            );
            return ResponseEntity.ok(saved);
        } catch (Exception e) {
            log.error("Failed to create application: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * GET /api/v1/applications/{applicationId}
     * Returns single application detail
     */
    @GetMapping("/applications/{applicationId}")
    public ResponseEntity<LoanApplication> getApplication(@PathVariable String applicationId) {
        return repository.findByApplicationId(applicationId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * POST /api/v1/applications/ingest/{applicationId}
     * Triggers Databricks ingestion for a specific application
     */
    @PostMapping("/applications/ingest/{applicationId}")
    public ResponseEntity<LoanApplication> ingestApplication(@PathVariable String applicationId) {
        try {
            LoanApplication app = databricksService.ingestApplication(applicationId);
            return ResponseEntity.ok(app);
        } catch (Exception e) {
            log.error("Ingestion failed for: {}", applicationId, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * POST /api/v1/applications/ingest-all
     * Ingests all 3 mock applications (initializes dashboard)
     */
    @PostMapping("/applications/ingest-all")
    public ResponseEntity<List<LoanApplication>> ingestAll() {
        List<LoanApplication> apps = new ArrayList<>();
        List<Map<String, Object>> catalog = databricksService.listAvailableApplications();

        for (Map<String, Object> entry : catalog) {
            String id = (String) entry.get("applicationId");
            try {
                apps.add(databricksService.ingestApplication(id));
            } catch (Exception e) {
                log.error("Failed to ingest {}: {}", id, e.getMessage());
            }
        }
        return ResponseEntity.ok(apps);
    }

    /**
     * POST /api/v1/applications/{applicationId}/analyze
     * Triggers the full credit analysis pipeline
     */
    @PostMapping("/applications/{applicationId}/analyze")
    public ResponseEntity<Map<String, String>> triggerAnalysis(
            @PathVariable String applicationId,
            @RequestBody Map<String, String> body) {
        String creditOfficerNotes = body.getOrDefault("creditOfficerNotes", "");

        // Fire and forget - async orchestration
        orchestrationService.orchestrateCreditAnalysis(applicationId, creditOfficerNotes);

        Map<String, String> response = new HashMap<>();
        response.put("status", "PROCESSING");
        response.put("message", "Credit analysis pipeline triggered. Monitor via WebSocket.");
        response.put("applicationId", applicationId);
        return ResponseEntity.accepted().body(response);
    }

    /**
     * GET /api/v1/applications/{applicationId}/audit
     * Returns immutable audit trail for an application
     */
    @GetMapping("/applications/{applicationId}/audit")
    public ResponseEntity<List<AuditLog>> getAuditTrail(@PathVariable String applicationId) {
        return ResponseEntity.ok(auditService.getAuditTrail(applicationId));
    }

    /**
     * POST /api/v1/applications/{applicationId}/documents
     * Persists parsed document extraction results (from Python worker) into the application record.
     */
    @PostMapping("/applications/{applicationId}/documents")
    public ResponseEntity<LoanApplication> attachDocumentExtraction(
            @PathVariable String applicationId,
            @RequestBody Map<String, Object> body) {
        try {
            LoanApplication app = repository.findByApplicationId(applicationId)
                    .orElseThrow(() -> new RuntimeException("Application not found: " + applicationId));

            // Store as an array of document extraction payloads (append-only)
            String existing = app.getDocumentExtractionJson();
            List<Object> docs;
            if (existing != null && !existing.isBlank()) {
                try {
                    Object parsed = objectMapper.readValue(existing, Object.class);
                    if (parsed instanceof List) {
                        //noinspection unchecked
                        docs = (List<Object>) parsed;
                    } else {
                        docs = new ArrayList<>();
                        docs.add(parsed);
                    }
                } catch (Exception ignored) {
                    docs = new ArrayList<>();
                }
            } else {
                docs = new ArrayList<>();
            }
            docs.add(body);
            app.setDocumentExtractionJson(objectMapper.writeValueAsString(docs));
            app.setDocumentsUploaded(true);

            String fileName = (String) body.getOrDefault("file_name", null);
            String docType = (String) body.getOrDefault("document_type", null);
            Object confObj = body.get("classification_confidence");
            Double confidence = confObj instanceof Number ? ((Number) confObj).doubleValue() : null;

            app.setLastUploadedDocumentName(fileName);
            app.setLastUploadedDocumentType(docType);
            app.setLastUploadedDocumentConfidence(confidence);

            // Human validation if classifier confidence is low or parsing failed upstream
            boolean success = Boolean.TRUE.equals(body.get("success"));
            boolean requiresHuman = !success || (confidence != null && confidence < 0.30);
            app.setHumanValidationRequired(requiresHuman);

            LoanApplication saved = repository.save(app);

            auditService.logEvent(
                    applicationId,
                    "DOCUMENT_EXTRACTION_ATTACHED",
                    "DOCUMENT_PIPELINE",
                    "source=python-worker",
                    "docType=" + docType + "|confidence=" + confidence,
                    "SUCCESS",
                    "RBI-DL-7.2",
                    "ISO27001-A.8.2");

            return ResponseEntity.ok(saved);
        } catch (Exception e) {
            log.error("Failed to attach document extraction for {}: {}", applicationId, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * GET /api/v1/databricks/catalog
     * Lists available companies in the mock Databricks catalog
     */
    @GetMapping("/databricks/catalog")
    public ResponseEntity<List<Map<String, Object>>> getDatabricksCatalog() {
        return ResponseEntity.ok(databricksService.listAvailableApplications());
    }

    /**
     * GET /api/v1/health/detailed
     * Detailed health check
     */
    @GetMapping("/health/detailed")
    public ResponseEntity<Map<String, Object>> detailedHealth() {
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("service", "IntelliCredit Core Backend");
        health.put("version", "1.0.0");
        health.put("status", "UP");
        health.put("timestamp", System.currentTimeMillis());
        health.put("totalApplications", repository.count());
        health.put("rbiCompliant", true);
        health.put("iso27001", true);
        return ResponseEntity.ok(health);
    }
}
