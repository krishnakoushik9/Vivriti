CREATE TABLE IF NOT EXISTS company_financials (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  application_id VARCHAR(100) NOT NULL UNIQUE,
  company_name VARCHAR(255),
  sector VARCHAR(100),
  annual_revenue DECIMAL(15,2),
  total_debt DECIMAL(15,2),
  equity DECIMAL(15,2),
  debt_to_equity_ratio DECIMAL(10,4),
  revenue_growth_percent DECIMAL(10,2),
  interest_coverage_ratio DECIMAL(10,2),
  current_ratio DECIMAL(10,2),
  ebitda_margin DECIMAL(10,2),
  gst_compliance_score DECIMAL(10,2),
  credit_score INT,
  databricks_source VARCHAR(255) DEFAULT 'delta_lake://vivriti-prod/cmie_prowess/source_v1',
  ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert mock data for the demo
INSERT IGNORE INTO company_financials 
  (application_id, company_name, sector, annual_revenue, total_debt, equity, 
   debt_to_equity_ratio, revenue_growth_percent, interest_coverage_ratio, 
   current_ratio, ebitda_margin, gst_compliance_score, credit_score, databricks_source)
VALUES
  ('APP-001', 'TechGrow Solutions Pvt Ltd', 'Technology / Fintech', 8500000.00, 2100000.00, 3200000.00, 0.66, 22.5, 4.8, 2.1, 18.3, 91.0, 740, 'delta_lake://vivriti-prod/cmie_prowess/techgrow_2024'),
  ('APP-002', 'Apex Manufacturing Ltd', 'Manufacturing / Auto Components', 15200000.00, 9800000.00, 4100000.00, 2.39, 3.2, 1.8, 0.9, 8.1, 64.5, 590, 'delta_lake://vivriti-prod/cmie_prowess/apex_mfg_2024'),
  ('APP-003', 'Zeta Traders & Co', 'Trading / Commodities', 22000000.00, 18500000.00, 1200000.00, 15.42, 87.3, 0.91, 0.7, 2.1, 31.0, 480, 'delta_lake://vivriti-prod/cmie_prowess/zeta_traders_2024'),
  ('APP-004', 'Blue Chip Logistics Pvt Ltd', 'Logistics & Transport', 45600000.00, 8200000.00, 21000000.00, 0.39, 14.2, 8.5, 2.8, 12.5, 98.0, 810, 'delta_lake://vivriti-prod/cmie_prowess/blue_chip_2024'),
  ('APP-005', 'SolarFlare Energy Systems', 'Renewable Energy', 12800000.00, 15400000.00, 5500000.00, 2.8, 65.8, 2.1, 1.25, 11.2, 88.5, 685, 'delta_lake://vivriti-prod/cmie_prowess/solarflare_2024');
