package com.vivriti.intellicredit.service;

import com.vivriti.intellicredit.entity.LoanApplication;
import com.vivriti.intellicredit.repository.LoanApplicationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.*;

/**
 * Databricks Ingestion Service (MySQL Proxy for Demo)
 * Simulates pulling structured corporate financial data from a Databricks Delta Lake.
 * In this demo, we query a MySQL table 'company_financials' as a proxy for the Delta Lake.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DatabricksIngestionService {

    private final LoanApplicationRepository repository;
    private final AuditService auditService;
    private final JdbcTemplate jdbcTemplate;

    /**
     * Simulates pulling data from Databricks Delta Lake and persisting to MySQL.
     */
    public LoanApplication ingestApplication(String applicationId) {
        log.info("[DATABRICKS] Initiating ingestion for applicationId: {}", applicationId);

        Map<String, Object> rawData = fetchFromDeltaLake(applicationId);

        LoanApplication app;
        Optional<LoanApplication> existing = repository.findByApplicationId(applicationId);

        if (existing.isPresent()) {
            app = existing.get();
        } else {
            app = new LoanApplication();
            app.setApplicationId(applicationId);
        }

        app.setCompanyName((String) rawData.get("companyName"));
        app.setSector((String) rawData.get("sector"));
        app.setAnnualRevenue((BigDecimal) rawData.get("annualRevenue"));
        app.setTotalDebt((BigDecimal) rawData.get("totalDebt"));
        app.setEquity((BigDecimal) rawData.get("equity"));
        app.setDebtToEquityRatio((BigDecimal) rawData.get("debtToEquityRatio"));
        app.setRevenueGrowthPercent((BigDecimal) rawData.get("revenueGrowthPercent"));
        app.setInterestCoverageRatio((BigDecimal) rawData.get("interestCoverageRatio"));
        app.setCurrentRatio((BigDecimal) rawData.get("currentRatio"));
        app.setEbitdaMargin((BigDecimal) rawData.get("ebitdaMargin"));
        app.setGstComplianceScore((BigDecimal) rawData.get("gstComplianceScore"));
        app.setCreditScore((Integer) rawData.get("creditScore"));
        app.setStatus(LoanApplication.ApplicationStatus.INGESTING);
        app.setDocumentsUploaded(false);

        LoanApplication saved = repository.save(app);

        auditService.logEvent(
                applicationId,
                "DATABRICKS_INGESTION_COMPLETE",
                "DATABRICKS_SERVICE",
                rawData.toString(),
                "SUCCESS: Financial data ingested from " + rawData.get("databricksSource"),
                "SUCCESS",
                "RBI-DL-7.1",
                "ISO27001-A.8.2");

        log.info("[DATABRICKS] Successfully ingested data for: {}", app.getCompanyName());
        return saved;
    }

    /**
     * Fetches a single company's financial data from the MySQL Delta Lake proxy.
     */
    private Map<String, Object> fetchFromDeltaLake(String applicationId) {
        String sql = "SELECT * FROM company_financials WHERE application_id = ?";
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, applicationId);

        if (rows.isEmpty()) {
            log.warn("[DATABRICKS] No data found for {}, falling back to first available row", applicationId);
            rows = jdbcTemplate.queryForList("SELECT * FROM company_financials LIMIT 1");
        }

        if (rows.isEmpty()) {
            throw new RuntimeException("No data available in company_financials table.");
        }

        Map<String, Object> row = rows.get(0);
        Map<String, Object> mapped = new LinkedHashMap<>();
        mapped.put("companyName", row.get("company_name"));
        mapped.put("sector", row.get("sector"));
        mapped.put("annualRevenue", row.get("annual_revenue"));
        mapped.put("totalDebt", row.get("total_debt"));
        mapped.put("equity", row.get("equity"));
        mapped.put("debtToEquityRatio", row.get("debt_to_equity_ratio"));
        mapped.put("revenueGrowthPercent", row.get("revenue_growth_percent"));
        mapped.put("interestCoverageRatio", row.get("interest_coverage_ratio"));
        mapped.put("currentRatio", row.get("current_ratio"));
        mapped.put("ebitdaMargin", row.get("ebitda_margin"));
        mapped.put("gstComplianceScore", row.get("gst_compliance_score"));
        mapped.put("creditScore", row.get("credit_score"));
        mapped.put("databricksSource", row.get("databricks_source"));
        mapped.put("applicationId", row.get("application_id"));

        log.info("[DATABRICKS] Fetched financial data for applicationId={} from MySQL (Delta Lake proxy)", applicationId);
        return mapped;
    }

    /**
     * Returns all applications in the Databricks Delta Lake proxy.
     */
    public List<Map<String, Object>> listAvailableApplications() {
        String sql = "SELECT * FROM company_financials";
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql);
        List<Map<String, Object>> result = new ArrayList<>();

        for (Map<String, Object> row : rows) {
            Map<String, Object> mapped = new LinkedHashMap<>();
            mapped.put("companyName", row.get("company_name"));
            mapped.put("sector", row.get("sector"));
            mapped.put("annualRevenue", row.get("annual_revenue"));
            mapped.put("totalDebt", row.get("total_debt"));
            mapped.put("equity", row.get("equity"));
            mapped.put("debtToEquityRatio", row.get("debt_to_equity_ratio"));
            mapped.put("revenueGrowthPercent", row.get("revenue_growth_percent"));
            mapped.put("interestCoverageRatio", row.get("interest_coverage_ratio"));
            mapped.put("currentRatio", row.get("current_ratio"));
            mapped.put("ebitdaMargin", row.get("ebitda_margin"));
            mapped.put("gstComplianceScore", row.get("gst_compliance_score"));
            mapped.put("creditScore", row.get("credit_score"));
            mapped.put("databricksSource", row.get("databricks_source"));
            mapped.put("applicationId", row.get("application_id"));
            result.add(mapped);
        }
        return result;
    }
}
