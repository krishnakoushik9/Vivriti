# IntelliCredit: Hybrid Credit Decision Intelligence Engine
## IIT Hyderabad Hackathon - Vivriti Capital Challenge

IntelliCredit is a high-performance, microservices-based credit appraisal and risk monitoring system designed to provide real-time, deterministic, and AI-augmented credit decisions for the fintech sector.

---

## 🏗 System Architecture

The project is built on a **Hybrid Decoupled Architecture**, ensuring that high-stakes financial logic remains deterministic while leveraging modern AI for unstructured data extraction and web-scale intelligence.

### 1. Core Components
*   **Java Spring Boot (Orchestration & Policy Engine):** The "Source of Truth." It manages application states, executes deterministic credit policies, and calculates pricing matrices using industrial-grade logic.
*   **Python ML Worker (Intelligence Layer):** Handles the "heavy lifting" of data science. It hosts 4 specialized models (Random Forest for scoring, Isolation Forest for anomaly detection, Gemini-Vision for OCR, and an NLP Research Agent).
*   **Node.js BFF (Real-Time & Scrapers):** Acts as a high-concurrency bridge, managing WebSockets for live research updates and executing targeted web scrapers (RSS, GDELT, Indian Kanoon).
*   **Next.js Dashboard (Frontend):** A professional, high-contrast dashboard designed for credit officers to review automated memos, live risk signals, and financial spreads.

---

## 🧐 Why using LLMs for Core Fintech is a Bad Decision

While the industry is rushing toward Generative AI, IntelliCredit takes a "Safety-First" approach by limiting LLM usage. Relying solely on LLMs for credit decisions is dangerous because:

1.  **Hallucinations in Numbers:** LLMs are probabilistic, not mathematical. A credit engine cannot afford a "prediction" that a debt-to-equity ratio is 1.5 when it is actually 5.1.
2.  **Lack of Auditability:** Financial regulators require clear, step-by-step justification for credit rejection. LLM "black boxes" provide prose, not logic paths.
3.  **Non-Deterministic Outcomes:** Inputting the same financial data twice might yield two different credit scores in a pure LLM setup, which is unacceptable for institutional lending.
4.  **Token Window Fragility:** Financial documents (100+ page audits) often exceed LLM context windows, leading to "lost in the middle" errors where critical debt disclosures are missed.

---

## 🏆 Why Our Architecture is the Best

Instead of replacing the credit officer with an LLM, we **augment** the officer with a **Hybrid Pipeline**:

### 1. Deterministic Financial Spreading
We use **Python-based PDF parsing and Java logic** to extract and calculate financial ratios. If the Balance Sheet doesn't balance, the system flags it immediately rather than "guessing" the missing values.

### 2. Multi-Model Risk Scoring
We don't use one "vibe-based" score. We use:
*   **Random Forest Classifier:** Trained on historical default data for objective scoring.
*   **Isolation Forest:** Specifically to detect fraudulent patterns and outliers that traditional systems miss.

### 3. The "Guardian" Research Agent
Our NLP agent doesn't calculate scores; it **searches and synthesizes**. It crawls news, court records (Indian Kanoon), and SEBI filings to find "Soft Risks" (e.g., a promoter's name appearing in a litigation record) that aren't in the numerical data.

### 4. Asynchronous Pipeline
The architecture uses a **Background Task** pattern. While the officer reviews the basic application, the Python worker and Node.js scrapers are parallel-processing 50+ data sources, delivering a comprehensive Credit Appraisal Memo (CAM) in seconds instead of days.

---

## 🚀 Key Features
*   **Automated CAM Generation:** Generates professional PDF/Docx memos with embedded charts (Matplotlib) and financial spreads.
*   **Web Intelligence Section:** Real-time risk signal monitoring with confidence scoring.
*   **Vision-LLM OCR:** Uses Gemini Vision only for initial data structure mapping, which is then verified by deterministic parsers.
*   **Modular Scrapers:** Deep integration with Indian-specific legal and financial data sources.

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

---
*Developed for the Vivriti Capital Challenge - Bridging the gap between AI innovation and Financial stability.*
