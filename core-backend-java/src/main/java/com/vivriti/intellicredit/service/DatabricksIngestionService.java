package com.vivriti.intellicredit.service;

import com.vivriti.intellicredit.entity.LoanApplication;
import com.vivriti.intellicredit.repository.LoanApplicationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.*;

/**
 * Mock Databricks Ingestion Service
 * Simulates pulling structured corporate financial data from a Databricks Delta
 * Lake
 * In production: integrates with Databricks REST API / JDBC connector
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DatabricksIngestionService {

    private final LoanApplicationRepository repository;
    private final AuditService auditService;

    // Static mock dataset simulating CMIE Prowess / MCA21 data in Databricks
    private static final Map<String, Map<String, Object>> MOCK_DATABRICKS_CATALOG = new HashMap<>();

    static {
        // Company 1: TechGrow Solutions - Healthy fintech SME
        Map<String, Object> techGrow = new LinkedHashMap<>();
        techGrow.put("companyName", "TechGrow Solutions Pvt Ltd");
        techGrow.put("sector", "Technology / Fintech");
        techGrow.put("annualRevenue", new BigDecimal("8500000.00"));
        techGrow.put("totalDebt", new BigDecimal("2100000.00"));
        techGrow.put("equity", new BigDecimal("3200000.00"));
        techGrow.put("debtToEquityRatio", new BigDecimal("0.66"));
        techGrow.put("revenueGrowthPercent", new BigDecimal("22.5"));
        techGrow.put("interestCoverageRatio", new BigDecimal("4.8"));
        techGrow.put("currentRatio", new BigDecimal("2.1"));
        techGrow.put("ebitdaMargin", new BigDecimal("18.3"));
        techGrow.put("gstComplianceScore", new BigDecimal("91.0"));
        techGrow.put("creditScore", 740);
        techGrow.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/techgrow_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-001", techGrow);

        // Company 2: Apex Manufacturing - Stressed industrial company
        Map<String, Object> apex = new LinkedHashMap<>();
        apex.put("companyName", "Apex Manufacturing Ltd");
        apex.put("sector", "Manufacturing / Auto Components");
        apex.put("annualRevenue", new BigDecimal("15200000.00"));
        apex.put("totalDebt", new BigDecimal("9800000.00"));
        apex.put("equity", new BigDecimal("4100000.00"));
        apex.put("debtToEquityRatio", new BigDecimal("2.39"));
        apex.put("revenueGrowthPercent", new BigDecimal("3.2"));
        apex.put("interestCoverageRatio", new BigDecimal("1.8"));
        apex.put("currentRatio", new BigDecimal("0.9"));
        apex.put("ebitdaMargin", new BigDecimal("8.1"));
        apex.put("gstComplianceScore", new BigDecimal("64.5"));
        apex.put("creditScore", 590);
        apex.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/apex_mfg_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-002", apex);

        // Company 3: Zeta Traders - High-risk trading company with anomaly signals
        Map<String, Object> zeta = new LinkedHashMap<>();
        zeta.put("companyName", "Zeta Traders & Co");
        zeta.put("sector", "Trading / Commodities");
        zeta.put("annualRevenue", new BigDecimal("22000000.00"));
        zeta.put("totalDebt", new BigDecimal("18500000.00"));
        zeta.put("equity", new BigDecimal("1200000.00"));
        zeta.put("debtToEquityRatio", new BigDecimal("15.42"));
        zeta.put("revenueGrowthPercent", new BigDecimal("87.3")); // Suspicious spike
        zeta.put("interestCoverageRatio", new BigDecimal("0.91"));
        zeta.put("currentRatio", new BigDecimal("0.7"));
        zeta.put("ebitdaMargin", new BigDecimal("2.1"));
        zeta.put("gstComplianceScore", new BigDecimal("31.0")); // Very low
        zeta.put("creditScore", 480);
        zeta.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/zeta_traders_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-003", zeta);

        // --- NEW MOCK DATA (10+ MORE COMPANIES) ---

        // Company 4: Blue Chip Logistics - Stable, low-risk
        Map<String, Object> blueChip = new LinkedHashMap<>();
        blueChip.put("companyName", "Blue Chip Logistics Pvt Ltd");
        blueChip.put("sector", "Logistics & Transport");
        blueChip.put("annualRevenue", new BigDecimal("45600000.00"));
        blueChip.put("totalDebt", new BigDecimal("8200000.00"));
        blueChip.put("equity", new BigDecimal("21000000.00"));
        blueChip.put("debtToEquityRatio", new BigDecimal("0.39"));
        blueChip.put("revenueGrowthPercent", new BigDecimal("14.2"));
        blueChip.put("interestCoverageRatio", new BigDecimal("8.5"));
        blueChip.put("currentRatio", new BigDecimal("2.8"));
        blueChip.put("ebitdaMargin", new BigDecimal("12.5"));
        blueChip.put("gstComplianceScore", new BigDecimal("98.0"));
        blueChip.put("creditScore", 810);
        blueChip.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/blue_chip_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-004", blueChip);

        // Company 5: SolarFlare Energy - High growth, moderate risk
        Map<String, Object> solarFlare = new LinkedHashMap<>();
        solarFlare.put("companyName", "SolarFlare Energy Systems");
        solarFlare.put("sector", "Renewable Energy");
        solarFlare.put("annualRevenue", new BigDecimal("12800000.00"));
        solarFlare.put("totalDebt", new BigDecimal("15400000.00"));
        solarFlare.put("equity", new BigDecimal("5500000.00"));
        solarFlare.put("debtToEquityRatio", new BigDecimal("2.8"));
        solarFlare.put("revenueGrowthPercent", new BigDecimal("65.8"));
        solarFlare.put("interestCoverageRatio", new BigDecimal("2.1"));
        solarFlare.put("currentRatio", new BigDecimal("1.25"));
        solarFlare.put("ebitdaMargin", new BigDecimal("11.2"));
        solarFlare.put("gstComplianceScore", new BigDecimal("88.5"));
        solarFlare.put("creditScore", 685);
        solarFlare.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/solarflare_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-005", solarFlare);

        // Company 6: Crimson Textiles - Tradition industry, declining margins
        Map<String, Object> crimson = new LinkedHashMap<>();
        crimson.put("companyName", "Crimson Textiles Exports");
        crimson.put("sector", "Apparel & Textiles");
        crimson.put("annualRevenue", new BigDecimal("28400000.00"));
        crimson.put("totalDebt", new BigDecimal("24500000.00"));
        crimson.put("equity", new BigDecimal("6200000.00"));
        crimson.put("debtToEquityRatio", new BigDecimal("3.95"));
        crimson.put("revenueGrowthPercent", new BigDecimal("-4.5"));
        crimson.put("interestCoverageRatio", new BigDecimal("1.1"));
        crimson.put("currentRatio", new BigDecimal("1.05"));
        crimson.put("ebitdaMargin", new BigDecimal("4.8"));
        crimson.put("gstComplianceScore", new BigDecimal("72.0"));
        crimson.put("creditScore", 540);
        crimson.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/crimson_textiles_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-006", crimson);

        // Company 7: Urban Brick Real Estate - Asset heavy, liquidity issues
        Map<String, Object> urbanBrick = new LinkedHashMap<>();
        urbanBrick.put("companyName", "Urban Brick Real Estate");
        urbanBrick.put("sector", "Real Estate / Construction");
        urbanBrick.put("annualRevenue", new BigDecimal("75000000.00"));
        urbanBrick.put("totalDebt", new BigDecimal("120000000.00"));
        urbanBrick.put("equity", new BigDecimal("45000000.00"));
        urbanBrick.put("debtToEquityRatio", new BigDecimal("2.67"));
        urbanBrick.put("revenueGrowthPercent", new BigDecimal("12.0"));
        urbanBrick.put("interestCoverageRatio", new BigDecimal("0.85")); // Trouble servicing debt
        urbanBrick.put("currentRatio", new BigDecimal("0.6"));
        urbanBrick.put("ebitdaMargin", new BigDecimal("25.0"));
        urbanBrick.put("gstComplianceScore", new BigDecimal("55.0"));
        urbanBrick.put("creditScore", 495);
        urbanBrick.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/urban_brick_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-007", urbanBrick);

        // Company 8: GreenField Agro - Seasonality, low current ratio
        Map<String, Object> agro = new LinkedHashMap<>();
        agro.put("companyName", "GreenField Agro Products");
        agro.put("sector", "Agriculture / Food Processing");
        agro.put("annualRevenue", new BigDecimal("18200000.00"));
        agro.put("totalDebt", new BigDecimal("6500000.00"));
        agro.put("equity", new BigDecimal("11200000.00"));
        agro.put("debtToEquityRatio", new BigDecimal("0.58"));
        agro.put("revenueGrowthPercent", new BigDecimal("8.3"));
        agro.put("interestCoverageRatio", new BigDecimal("3.9"));
        agro.put("currentRatio", new BigDecimal("0.95"));
        agro.put("ebitdaMargin", new BigDecimal("7.4"));
        agro.put("gstComplianceScore", new BigDecimal("92.0"));
        agro.put("creditScore", 710);
        agro.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/greenfield_agro_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-008", agro);

        // Company 9: CyberNode Cloud - Asset light, very high growth
        Map<String, Object> cyberNode = new LinkedHashMap<>();
        cyberNode.put("companyName", "CyberNode Cloud Services");
        cyberNode.put("sector", "IT / Cloud Infrastructure");
        cyberNode.put("annualRevenue", new BigDecimal("5400000.00"));
        cyberNode.put("totalDebt", new BigDecimal("1200000.00"));
        cyberNode.put("equity", new BigDecimal("4500000.00"));
        cyberNode.put("debtToEquityRatio", new BigDecimal("0.27"));
        cyberNode.put("revenueGrowthPercent", new BigDecimal("112.5"));
        cyberNode.put("interestCoverageRatio", new BigDecimal("12.4"));
        cyberNode.put("currentRatio", new BigDecimal("4.2"));
        cyberNode.put("ebitdaMargin", new BigDecimal("32.5"));
        cyberNode.put("gstComplianceScore", new BigDecimal("95.5"));
        cyberNode.put("creditScore", 790);
        cyberNode.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/cybernode_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-009", cyberNode);

        // Company 10: Titan Pharma - Regulated, consistent
        Map<String, Object> titanPharma = new LinkedHashMap<>();
        titanPharma.put("companyName", "Titan Pharmaceutical Ltd");
        titanPharma.put("sector", "Healthcare / Pharma");
        titanPharma.put("annualRevenue", new BigDecimal("38900000.00"));
        titanPharma.put("totalDebt", new BigDecimal("12400000.00"));
        titanPharma.put("equity", new BigDecimal("18500000.00"));
        titanPharma.put("debtToEquityRatio", new BigDecimal("0.67"));
        titanPharma.put("revenueGrowthPercent", new BigDecimal("11.8"));
        titanPharma.put("interestCoverageRatio", new BigDecimal("5.2"));
        titanPharma.put("currentRatio", new BigDecimal("1.85"));
        titanPharma.put("ebitdaMargin", new BigDecimal("14.9"));
        titanPharma.put("gstComplianceScore", new BigDecimal("99.0"));
        titanPharma.put("creditScore", 765);
        titanPharma.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/titan_pharma_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-010", titanPharma);

        // Company 11: OmniRetail Inc - High cash flow, low margins
        Map<String, Object> omni = new LinkedHashMap<>();
        omni.put("companyName", "OmniRetail Global Solutions");
        omni.put("sector", "Retail / E-commerce");
        omni.put("annualRevenue", new BigDecimal("125000000.00"));
        omni.put("totalDebt", new BigDecimal("28000000.00"));
        omni.put("equity", new BigDecimal("35000000.00"));
        omni.put("debtToEquityRatio", new BigDecimal("0.8"));
        omni.put("revenueGrowthPercent", new BigDecimal("18.5"));
        omni.put("interestCoverageRatio", new BigDecimal("6.2"));
        omni.put("currentRatio", new BigDecimal("1.4"));
        omni.put("ebitdaMargin", new BigDecimal("3.8")); // Low retail margins
        omni.put("gstComplianceScore", new BigDecimal("94.0"));
        omni.put("creditScore", 725);
        omni.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/omni_retail_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-011", omni);

        // Company 12: SilverLine Auto - Circular trading signal (High revenue spike,
        // low GST)
        Map<String, Object> silverLine = new LinkedHashMap<>();
        silverLine.put("companyName", "SilverLine Auto Components");
        silverLine.put("sector", "Auto Components / Manufacturing");
        silverLine.put("annualRevenue", new BigDecimal("14200000.00"));
        silverLine.put("totalDebt", new BigDecimal("11500000.00"));
        silverLine.put("equity", new BigDecimal("2500000.00"));
        silverLine.put("debtToEquityRatio", new BigDecimal("4.6"));
        silverLine.put("revenueGrowthPercent", new BigDecimal("125.0")); // Suspicious considering sector
        silverLine.put("interestCoverageRatio", new BigDecimal("1.1"));
        silverLine.put("currentRatio", new BigDecimal("0.85"));
        silverLine.put("ebitdaMargin", new BigDecimal("2.5"));
        silverLine.put("gstComplianceScore", new BigDecimal("28.5")); // Major red flag
        silverLine.put("creditScore", 420);
        silverLine.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/silverline_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-012", silverLine);

        // Company 13: SwiftFin Microsystems - Moderate health
        Map<String, Object> swiftFin = new LinkedHashMap<>();
        swiftFin.put("companyName", "SwiftFin Microsystems");
        swiftFin.put("sector", "Electronics / Semiconductors");
        swiftFin.put("annualRevenue", new BigDecimal("21400000.00"));
        swiftFin.put("totalDebt", new BigDecimal("9800000.00"));
        swiftFin.put("equity", new BigDecimal("11200000.00"));
        swiftFin.put("debtToEquityRatio", new BigDecimal("0.88"));
        swiftFin.put("revenueGrowthPercent", new BigDecimal("32.4"));
        swiftFin.put("interestCoverageRatio", new BigDecimal("4.1"));
        swiftFin.put("currentRatio", new BigDecimal("1.55"));
        swiftFin.put("ebitdaMargin", new BigDecimal("15.2"));
        swiftFin.put("gstComplianceScore", new BigDecimal("89.0"));
        swiftFin.put("creditScore", 695);
        swiftFin.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/swiftfin_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-013", swiftFin);

        // Company 14: GoldenGrain Spirits - High debt, asset heavy
        Map<String, Object> grain = new LinkedHashMap<>();
        grain.put("companyName", "GoldenGrain Spirits & Beverage");
        grain.put("sector", "Consumer Goods / Beverage");
        grain.put("annualRevenue", new BigDecimal("42500000.00"));
        grain.put("totalDebt", new BigDecimal("48000000.00"));
        grain.put("equity", new BigDecimal("12500000.00"));
        grain.put("debtToEquityRatio", new BigDecimal("3.84"));
        grain.put("revenueGrowthPercent", new BigDecimal("5.2"));
        grain.put("interestCoverageRatio", new BigDecimal("1.4"));
        grain.put("currentRatio", new BigDecimal("1.1"));
        grain.put("ebitdaMargin", new BigDecimal("18.5"));
        grain.put("gstComplianceScore", new BigDecimal("82.5"));
        grain.put("creditScore", 565);
        grain.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/goldengrain_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-014", grain);

        // Company 15: NexGen EdTech - High growth, equity supported
        Map<String, Object> nextGen = new LinkedHashMap<>();
        nextGen.put("companyName", "NexGen EdTech Platforms");
        nextGen.put("sector", "Education Technology");
        nextGen.put("annualRevenue", new BigDecimal("12500000.00"));
        nextGen.put("totalDebt", new BigDecimal("2500000.00"));
        nextGen.put("equity", new BigDecimal("35000000.00")); // VC funded
        nextGen.put("debtToEquityRatio", new BigDecimal("0.07"));
        nextGen.put("revenueGrowthPercent", new BigDecimal("88.0"));
        nextGen.put("interestCoverageRatio", new BigDecimal("15.5"));
        nextGen.put("currentRatio", new BigDecimal("5.2"));
        nextGen.put("ebitdaMargin", new BigDecimal("-8.5")); // Burning cash but low debt
        nextGen.put("gstComplianceScore", new BigDecimal("95.0"));
        nextGen.put("creditScore", 735);
        nextGen.put("databricksSource", "delta_lake://vivriti-prod/cmie_prowess/nexgen_2024");
        MOCK_DATABRICKS_CATALOG.put("APP-015", nextGen);
    }

    /**
     * Simulates pulling data from Databricks Delta Lake and persisting to H2
     * In production: Uses Databricks REST API with OAuth2 and Delta Lake JDBC
     */
    public LoanApplication ingestApplication(String applicationId) {
        log.info("[DATABRICKS] Initiating ingestion for applicationId: {}", applicationId);

        Map<String, Object> rawData = MOCK_DATABRICKS_CATALOG.get(applicationId);
        if (rawData == null) {
            throw new RuntimeException("Application not found in Databricks catalog: " + applicationId);
        }

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
     * Returns all mock applications in the Databricks catalog
     */
    public List<Map<String, Object>> listAvailableApplications() {
        List<Map<String, Object>> result = new ArrayList<>();
        MOCK_DATABRICKS_CATALOG.forEach((id, data) -> {
            Map<String, Object> summary = new LinkedHashMap<>(data);
            summary.put("applicationId", id);
            result.add(summary);
        });
        return result;
    }
}
