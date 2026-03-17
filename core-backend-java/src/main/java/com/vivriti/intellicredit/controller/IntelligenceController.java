package com.vivriti.intellicredit.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vivriti.intellicredit.entity.QualitativeNote;
import com.vivriti.intellicredit.entity.RiskSignal;
import com.vivriti.intellicredit.repository.LoanApplicationRepository;
import com.vivriti.intellicredit.repository.QualitativeNoteRepository;
import com.vivriti.intellicredit.repository.RiskSignalRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = { "http://localhost:3000", "http://localhost:3001" })
public class IntelligenceController {

    private final RiskSignalRepository riskSignalRepository;
    private final QualitativeNoteRepository qualitativeNoteRepository;
    private final LoanApplicationRepository loanApplicationRepository;
    private final ObjectMapper objectMapper;

    // Minimal weight map for scoring when upstream doesn't provide riskScore yet.
    private static final Map<String, Integer> KEYWORD_WEIGHTS = Map.ofEntries(
            Map.entry("fraud", 25),
            Map.entry("arrested", 25),
            Map.entry("absconding", 25),
            Map.entry("fir", 20),
            Map.entry("ed raid", 20),
            Map.entry("enforcement directorate", 20),
            Map.entry("cbi", 18),
            Map.entry("money laundering", 20),
            Map.entry("hawala", 18),
            Map.entry("benami", 15),
            Map.entry("nclt", 15),
            Map.entry("insolvency", 15),
            Map.entry("liquidation", 15),
            Map.entry("cirp", 15),
            Map.entry("ibc", 12),
            Map.entry("winding up", 12),
            Map.entry("resolution professional", 12),
            Map.entry("sebi notice", 10),
            Map.entry("sebi order", 10),
            Map.entry("rbi penalty", 10),
            Map.entry("show cause", 8),
            Map.entry("debarred", 10),
            Map.entry("suspended", 8),
            Map.entry("sarfaesi", 8),
            Map.entry("drt", 8),
            Map.entry("npa", 5),
            Map.entry("default", 5),
            Map.entry("write-off", 5),
            Map.entry("restructured", 4),
            Map.entry("moratorium", 4),
            Map.entry("ots", 3),
            Map.entry("promoter pledge", 3),
            Map.entry("plant shutdown", 6),
            Map.entry("factory sealed", 6),
            Map.entry("labour strike", 4)
    );

    @PostMapping("/intelligence/ingest")
    public ResponseEntity<Map<String, Object>> ingest(@RequestBody Map<String, Object> body) {
        try {
            String applicationId = String.valueOf(body.getOrDefault("applicationId", "")).trim();
            if (applicationId.isBlank()) {
                // Allow Node payload variant
                applicationId = String.valueOf(body.getOrDefault("companyId", "")).trim();
            }
            if (applicationId.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "applicationId_required"));

            Object rawResults = body.get("results");
            if (!(rawResults instanceof List<?> list)) {
                return ResponseEntity.badRequest().body(Map.of("error", "results_required"));
            }

            int saved = 0;
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                @SuppressWarnings("unchecked")
                Map<String, Object> r = (Map<String, Object>) m;

                String title = String.valueOf(r.getOrDefault("title", "")).trim();
                String url = String.valueOf(r.getOrDefault("sourceUrl", r.getOrDefault("url", ""))).trim();
                String sourceName = String.valueOf(r.getOrDefault("sourceName", "Unknown")).trim();
                String sourceType = String.valueOf(r.getOrDefault("sourceType", "NEWS")).trim();

                if (title.isBlank() || url.isBlank()) continue;

                Integer riskScore = asInt(r.get("risk_score"));
                String riskLevelStr = String.valueOf(r.getOrDefault("risk_level", "")).trim();

                List<String> kws = toStringList(r.getOrDefault("riskKeywordsFound", r.getOrDefault("risk_keywords", List.of())));
                if (riskScore == null) riskScore = computeRiskScore(title, kws, String.valueOf(r.getOrDefault("snippet", "")));
                RiskSignal.RiskLevel riskLevel = parseRiskLevel(riskLevelStr, riskScore);

                String riskKeywordsJson = objectMapper.writeValueAsString(kws);

                LocalDateTime publishedAt = parseDateTime(r.get("publishedAt"));
                if (publishedAt == null) publishedAt = parseDateTime(r.get("published_at"));
                LocalDateTime scrapedAt = parseDateTime(r.get("scrapedAt"));

                riskSignalRepository.save(RiskSignal.builder()
                        .applicationId(applicationId)
                        .title(title)
                        .url(url)
                        .sourceName(sourceName.isBlank() ? "Unknown" : sourceName)
                        .sourceType(sourceType.isBlank() ? "NEWS" : sourceType)
                        .riskScore(Math.max(0, Math.min(100, riskScore)))
                        .riskLevel(riskLevel)
                        .riskKeywordsJson(riskKeywordsJson)
                        .publishedAt(publishedAt)
                        .scrapedAt(scrapedAt)
                        .build());
                saved++;
            }

            return ResponseEntity.ok(Map.of("saved", saved));
        } catch (Exception e) {
            log.error("[INTELLIGENCE] ingest failed: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body(Map.of("error", "ingest_failed", "message", e.getMessage()));
        }
    }

    @GetMapping("/applications/{applicationId}/risk-signals")
    public ResponseEntity<Map<String, Object>> getRiskSignals(
            @PathVariable String applicationId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Page<RiskSignal> p = riskSignalRepository.findByApplicationIdOrderByRiskScoreDesc(applicationId, PageRequest.of(Math.max(0, page), Math.max(1, size)));
        List<Map<String, Object>> items = p.getContent().stream().map(this::toDto).toList();
        return ResponseEntity.ok(Map.of(
                "content", items,
                "page", p.getNumber(),
                "size", p.getSize(),
                "totalElements", p.getTotalElements(),
                "totalPages", p.getTotalPages()
        ));
    }

    @GetMapping("/applications/{applicationId}/risk-summary")
    public ResponseEntity<Map<String, Object>> getRiskSummary(@PathVariable String applicationId) {
        return ResponseEntity.ok(computeSummary(applicationId));
    }

    @PostMapping("/applications/{applicationId}/qualitative-notes")
    public ResponseEntity<Map<String, Object>> addQualitativeNote(
            @PathVariable String applicationId,
            @RequestBody Map<String, Object> body
    ) {
        String note = String.valueOf(body.getOrDefault("note", "")).trim();
        String category = String.valueOf(body.getOrDefault("category", "OTHER")).trim();
        Integer impact = asInt(body.get("impact"));
        if (impact == null) impact = 0;
        impact = Math.max(-20, Math.min(20, impact));
        if (note.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "note_required"));
        }

        qualitativeNoteRepository.save(QualitativeNote.builder()
                .applicationId(applicationId)
                .note(note)
                .category(category.isBlank() ? "OTHER" : category)
                .impact(impact)
                .build());

        return ResponseEntity.ok(computeSummary(applicationId));
    }

    private Map<String, Object> computeSummary(String applicationId) {
        // Ensure application exists (for UX; don't fail if missing signals)
        loanApplicationRepository.findByApplicationId(applicationId).orElse(null);

        List<RiskSignal> top10 = riskSignalRepository.findTop10ByApplicationIdOrderByRiskScoreDesc(applicationId);
        List<RiskSignal> all = riskSignalRepository.findByApplicationId(applicationId);

        int aggregateBase = top10.isEmpty()
                ? 0
                : (int) Math.round(top10.stream().mapToInt(RiskSignal::getRiskScore).average().orElse(0));

        Map<String, Integer> breakdown = new LinkedHashMap<>();
        breakdown.put("critical", (int) all.stream().filter(s -> s.getRiskLevel() == RiskSignal.RiskLevel.CRITICAL).count());
        breakdown.put("high", (int) all.stream().filter(s -> s.getRiskLevel() == RiskSignal.RiskLevel.HIGH).count());
        breakdown.put("medium", (int) all.stream().filter(s -> s.getRiskLevel() == RiskSignal.RiskLevel.MEDIUM).count());
        breakdown.put("low", (int) all.stream().filter(s -> s.getRiskLevel() == RiskSignal.RiskLevel.LOW || s.getRiskLevel() == RiskSignal.RiskLevel.NONE).count());

        List<Map<String, Object>> topAlerts = all.stream()
                .sorted(Comparator.comparingInt(RiskSignal::getRiskScore).reversed())
                .limit(3)
                .map(this::toDto)
                .toList();

        LocalDateTime lastResearchedAt = all.stream()
                .map(s -> s.getScrapedAt() != null ? s.getScrapedAt() : s.getCreatedAt())
                .filter(Objects::nonNull)
                .max(LocalDateTime::compareTo)
                .orElse(null);

        List<String> sourcesSearched = all.stream()
                .map(RiskSignal::getSourceName)
                .filter(Objects::nonNull)
                .distinct()
                .sorted()
                .toList();

        int impactSum = qualitativeNoteRepository.findByApplicationIdOrderByCreatedAtDesc(applicationId).stream()
                .mapToInt(QualitativeNote::getImpact)
                .sum();

        int aggregateScore = clamp(aggregateBase + impactSum, 0, 100);

        String overallRiskLevel = computeOverallRiskLevel(breakdown, aggregateScore);

        return new LinkedHashMap<>(Map.of(
                "aggregateScore", aggregateScore,
                "overallRiskLevel", overallRiskLevel,
                "breakdown", breakdown,
                "topAlerts", topAlerts,
                "lastResearchedAt", lastResearchedAt != null ? lastResearchedAt.toString() : null,
                "sourcesSearched", sourcesSearched
        ));
    }

    private String computeOverallRiskLevel(Map<String, Integer> breakdown, int aggregateScore) {
        int critical = breakdown.getOrDefault("critical", 0);
        int high = breakdown.getOrDefault("high", 0);
        int medium = breakdown.getOrDefault("medium", 0);
        if (critical > 0 || aggregateScore >= 60) return "CRITICAL";
        if (high > 0 || aggregateScore >= 40) return "HIGH";
        if (medium > 0 || aggregateScore >= 20) return "MEDIUM";
        return "LOW";
    }

    private Map<String, Object> toDto(RiskSignal s) {
        List<String> kws = List.of();
        try {
            if (s.getRiskKeywordsJson() != null) {
                kws = objectMapper.readValue(s.getRiskKeywordsJson(), new TypeReference<List<String>>() {});
            }
        } catch (Exception ignored) {}

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", s.getId());
        out.put("applicationId", s.getApplicationId());
        out.put("title", s.getTitle());
        out.put("url", s.getUrl());
        out.put("sourceName", s.getSourceName());
        out.put("sourceType", s.getSourceType());
        out.put("riskScore", s.getRiskScore());
        out.put("riskLevel", s.getRiskLevel().name());
        out.put("riskKeywords", kws);
        out.put("publishedAt", s.getPublishedAt() != null ? s.getPublishedAt().toString() : null);
        out.put("scrapedAt", s.getScrapedAt() != null ? s.getScrapedAt().toString() : null);
        out.put("createdAt", s.getCreatedAt() != null ? s.getCreatedAt().toString() : null);
        return out;
    }

    private static Integer asInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    private static int computeRiskScore(String title, List<String> keywords, String snippet) {
        int score = 0;
        String text = (title + " " + (snippet == null ? "" : snippet)).toLowerCase();
        for (String kw : (keywords == null ? List.<String>of() : keywords)) {
            Integer w = KEYWORD_WEIGHTS.get(String.valueOf(kw).toLowerCase());
            if (w != null) score += w;
        }
        // Also allow weights from raw text if keywords list is empty
        if ((keywords == null || keywords.isEmpty())) {
            for (Map.Entry<String, Integer> e : KEYWORD_WEIGHTS.entrySet()) {
                if (text.contains(e.getKey())) score += e.getValue();
            }
        }
        return clamp(score, 0, 100);
    }

    private static RiskSignal.RiskLevel parseRiskLevel(String riskLevelStr, int riskScore) {
        try {
            if (riskLevelStr != null && !riskLevelStr.isBlank()) {
                return RiskSignal.RiskLevel.valueOf(riskLevelStr.trim().toUpperCase());
            }
        } catch (Exception ignored) {}
        if (riskScore >= 40) return RiskSignal.RiskLevel.CRITICAL;
        if (riskScore >= 20) return RiskSignal.RiskLevel.HIGH;
        if (riskScore >= 8) return RiskSignal.RiskLevel.MEDIUM;
        if (riskScore >= 1) return RiskSignal.RiskLevel.LOW;
        return RiskSignal.RiskLevel.NONE;
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private static List<String> toStringList(Object v) {
        if (v == null) return List.of();
        if (v instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object o : list) if (o != null) out.add(String.valueOf(o));
            return out;
        }
        return List.of(String.valueOf(v));
    }

    private static LocalDateTime parseDateTime(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        if (s.isBlank() || "null".equalsIgnoreCase(s)) return null;
        try {
            // ISO with offset
            return OffsetDateTime.parse(s).toLocalDateTime();
        } catch (Exception ignored) {}
        try {
            // ISO without offset
            return LocalDateTime.parse(s);
        } catch (Exception ignored) {}
        return null;
    }
}

