# IntelliCredit: Hybrid Credit Decision Intelligence Engine
## IIT Hyderabad Hackathon - Vivriti Capital Challenge

IntelliCredit is a high-performance, microservices-based credit appraisal and risk monitoring system designed to provide real-time, deterministic, and AI-augmented credit decisions for the fintech sector.

---

## 🏗 System Architecture

The project is built on a **Hybrid Decoupled Architecture**, ensuring that high-stakes financial logic remains deterministic while leveraging modern AI for unstructured data extraction and web-scale intelligence.

### 1. Core Components
*   **Java Spring Boot (Orchestration & Policy Engine):** The "Source of Truth." It manages application states, executes deterministic credit policies, and calculates pricing matrices using industrial-grade logic.
*   **Python ML Worker (Intelligence Layer):** Hosts 4 specialized models (Random Forest for scoring, Isolation Forest for anomaly detection, Gemini-Vision for OCR, and an NLP Research Agent).
*   **Node.js BFF (Real-Time & Scrapers):** Managing WebSockets for live research updates and executing targeted web scrapers (RSS, GDELT, Indian Kanoon).
*   **Next.js Dashboard (Frontend):** A high-contrast dashboard for credit officers to review automated memos, live risk signals, and financial spreads.

---

## 🔍 Technical Deep Dive: File-Level Architecture

### 🛡️ Core Backend (Java Spring Boot)
The orchestration layer ensures financial compliance and deterministic calculations.
*   `OrchestrationService.java`: The central controller that coordinates between the Python ML worker and the database. It handles the state machine of a credit application.
*   `PricingMatrixService.java`: Implements a multi-dimensional matrix (Risk Grade vs. Tenor) to calculate the final ROI and credit limit.
*   `DatabricksIngestionService.java`: Syncs processed financial data to lakehouses for long-term auditability.
*   `application.yml`: Defines the strict thresholds for "Hard Rejects" (e.g., DPD > 30, Score < 450).

### 🧠 ML Worker (Python & AI)
The intelligence layer that processes unstructured data.
*   `main.py`: The FastAPI gateway for the ML worker, managing async background tasks for PDF processing and research.
*   `document_ai.py`: The "Pillar 1" of the system. It uses **PyMuPDF** and **Camelot** for deterministic table extraction, falling back to **Gemini Vision** (`ocr_llm.py`) for complex, multi-column bank statements.
*   `research_agent.py`: A sophisticated 10-step hybrid pipeline. It merges NewsAPI, GDELT, and scraped data from Economic Times/Mint.
*   `risk_analyzer.py`: Contains the logic for scoring "Soft Risks." It uses keyword density and sentiment analysis to flag litigation (SEBI, NCLT) and promoter defaults.
*   `explainability.py`: Generates SHAP-like insights for the Random Forest model, telling the credit officer *why* a score was given (e.g., "High leverage offset by strong GST compliance").
*   `cam_pdf_generator.py`: Converts the final structured analysis into a professional, banking-ready PDF report using **ReportLab**.

### ⚡ Real-time Layer (Node.js BFF)
*   `server.js`: Manages Socket.io namespaces for `research-progress`. As the Python worker finds new news articles, the Node BFF pushes them to the UI in real-time.
*   `routes/mca.js`: Provides an optimized lookup for the local 54MB MCA database (`portaldownloadtelangana.csv`), allowing instant CIN-to-Entity mapping.

---

## 📊 Data Pipeline: Raw PDF to Credit Decision

1.  **Ingestion:** User uploads a Financial Statement (P&L/BS).
2.  **Structural Extraction:** `document_ai.py` attempts text-based parsing. If the PDF is "scanned," it triggers the `Vision-LLM` (Gemini-1.5-Flash) to map table coordinates.
3.  **Financial Spreading:** Raw numbers are sent to the Java `OrchestrationService` which calculates 12+ ratios (EBITDA Margin, Current Ratio, DSCR).
4.  **Parallel Research:** While ratios are calculated, `research_agent.py` triggers concurrent scrapers for:
    *   **Legal:** Indian Kanoon (Litigation check).
    *   **Financial News:** Economic Times, MoneyControl (Sentiment).
    *   **Corporate:** GDELT (Global risk signals).
5.  **ML Scoring:**
    *   **RF Model:** Predicts probability of default.
    *   **Isolation Forest:** Flags the application as "Anomalous" if its metrics deviate significantly from industry peers.
6.  **CAM Synthesis:** All data (Deterministic + Probabilistic) is merged into a **Credit Appraisal Memo**.

---

## 🧐 Why using LLMs for Core Fintech is a Bad Decision

1.  **Hallucinations in Numbers:** LLMs are probabilistic. A credit engine cannot afford a "prediction" that a debt ratio is 1.5 when it is 5.1.
2.  **Lack of Auditability:** Financial regulators require clear logic paths. LLM "black boxes" provide prose, not logic.
3.  **Non-Deterministic Outcomes:** Inputting the same data twice might yield different scores, which is unacceptable for institutional lending.
4.  **Token Window Fragility:** 100+ page audit reports often exceed LLM context windows, leading to missing disclosures.

---

## 🏆 Why Our Architecture is the Best

We **augment** the officer with a **Hybrid Pipeline**:
*   **Deterministic Spreading:** Python/Java logic for financial ratios. If the Balance Sheet doesn't balance, we flag it—we don't "guess" values.
*   **Multi-Model Scoring:** Using Random Forest (Default prediction) and Isolation Forest (Anomaly detection).
*   **The "Guardian" Research Agent:** Crawls news and court records to find "Soft Risks" (e.g., NCLT petitions) that aren't in the numerical data.
*   **Asynchronous Processing:** Parallel-processing 50+ data sources to deliver a CAM in seconds.

---

## 🛠 Setup & Installation

1.  **Environment:** Requires Docker and Docker-Compose.
2.  **Run System:**
    ```bash
    ./run_system.sh
    ```
3.  **Access Points:**
    *   Frontend: `http://localhost:3000`
    *   Java API: `http://localhost:8090`
    *   Python ML Worker: `http://localhost:8001`
    *   MCA Lookup: `http://localhost:3001/api/mca`

---
*Developed for the Vivriti Capital Challenge - Bridging the gap between AI innovation and Financial stability.*

