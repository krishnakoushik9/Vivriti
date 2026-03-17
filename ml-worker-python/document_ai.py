"""
IntelliCredit Document AI — Multi-Format Financial Document Parser
==================================================================
Handles PDF financial reports, bank statements, GST returns, and scanned documents.
Uses PyMuPDF for text extraction, pdfplumber for table extraction.
"""

import os
import re
import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime

logger = logging.getLogger("intellicredit.document_ai")

# ─────────────────────────────────────────────
# Lazy imports — fail gracefully if libs missing
# ─────────────────────────────────────────────
def _import_fitz():
    try:
        import fitz  # PyMuPDF
        return fitz
    except ImportError:
        logger.warning("PyMuPDF not installed. Install with: pip install PyMuPDF")
        return None

def _import_pdfplumber():
    try:
        import pdfplumber
        return pdfplumber
    except ImportError:
        logger.warning("pdfplumber not installed. Install with: pip install pdfplumber")
        return None

def _import_pytesseract():
    try:
        import pytesseract  # type: ignore
        return pytesseract
    except ImportError:
        return None

def _import_pil_image():
    try:
        from PIL import Image  # type: ignore
        return Image
    except ImportError:
        return None

def _tesseract_available() -> bool:
    try:
        import shutil
        return shutil.which("tesseract") is not None
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────
# DOCUMENT CLASSIFICATION
# ─────────────────────────────────────────────────────────────────
DOCUMENT_SIGNATURES = {
    "balance_sheet": [
        "balance sheet", "statement of financial position", "assets",
        "liabilities", "shareholders equity", "equity and liabilities",
        "non-current assets", "current assets", "total assets",
        "reserves and surplus", "share capital",
    ],
    "income_statement": [
        "profit and loss", "income statement", "statement of profit",
        "revenue from operations", "other income", "total revenue",
        "cost of goods sold", "operating profit", "ebitda",
        "profit before tax", "profit after tax", "earnings per share",
    ],
    "bank_statement": [
        "bank statement", "account summary", "opening balance",
        "closing balance", "withdrawals", "deposits", "transaction date",
        "credit", "debit", "running balance", "account number",
    ],
    "gst_return": [
        "gstr-3b", "gstr-2a", "gstr-1", "goods and services tax",
        "gstin", "taxable value", "integrated tax", "central tax",
        "state/ut tax", "input tax credit", "output tax",
        "reverse charge", "tax period",
    ],
    "annual_report": [
        "annual report", "directors report", "auditors report",
        "management discussion", "corporate governance",
        "board of directors", "chairman", "fiscal year",
        "standalone financial", "consolidated financial",
    ],
    "legal_document": [
        "court order", "litigation", "arbitration", "legal notice",
        "nclt", "nclat", "judgment", "decree", "petition",
        "adjudication", "insolvency", "bankruptcy",
    ],
    "credit_rating_report": [
        "credit rating", "rating rationale", "rating agency",
        "crisil", "icra", "care ratings", "india ratings",
        "brickwork", "acuite", "rating outlook", "credit review",
    ],
    "bank_sanction_letter": [
        "sanction letter", "sanctioned limit", "sanction amount",
        "rate of interest", "interest rate", "tenure", "facility",
        "security", "collateral", "charge", "covenant", "repayment",
        "roi", "processing fee",
    ],
    "itr": [
        "income tax return", "itr-v", "acknowledgement number",
        "assessment year", "pan", "gross total income", "total income",
        "tax payable", "refund",
    ],
}

def classify_document(text: str) -> Dict[str, Any]:
    """
    Classify a financial document based on keyword matching.
    Returns document type, confidence score, and matched keywords.
    """
    text_lower = text.lower()
    scores = {}
    matched_keywords = {}

    for doc_type, keywords in DOCUMENT_SIGNATURES.items():
        matches = [kw for kw in keywords if kw in text_lower]
        score = len(matches) / len(keywords) if keywords else 0
        scores[doc_type] = score
        matched_keywords[doc_type] = matches

    best_type = max(scores, key=scores.get)
    confidence = scores[best_type]

    return {
        "document_type": best_type if confidence > 0.15 else "unknown",
        "confidence": round(confidence, 3),
        "matched_keywords": matched_keywords.get(best_type, []),
        "all_scores": {k: round(v, 3) for k, v in sorted(scores.items(), key=lambda x: -x[1])},
    }


# ─────────────────────────────────────────────────────────────────
# TEXT EXTRACTION
# ─────────────────────────────────────────────────────────────────
def extract_text_from_pdf(file_path: str) -> Dict[str, Any]:
    """
    Extract text from a PDF using PyMuPDF (fitz).
    Returns page-wise text and metadata.
    """
    fitz = _import_fitz()
    if fitz is None:
        return _fallback_text_extraction(file_path)

    try:
        doc = fitz.open(file_path)
        pages = []
        full_text = []
        scanned_pages = 0
        ocr_used_pages = 0

        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text")
            used_ocr = False
            ocr_confidence = None

            # OCR fallback for scanned/image-only pages
            if len((text or "").strip()) < 40:
                scanned_pages += 1
                ocr_text, conf = _ocr_page_fitz(page)
                if ocr_text:
                    text = ocr_text
                    used_ocr = True
                    ocr_used_pages += 1
                    ocr_confidence = conf
            pages.append({
                "page_number": page_num + 1,
                "text": text,
                "char_count": len(text),
                "ocr_used": used_ocr,
                "ocr_confidence": ocr_confidence,
            })
            full_text.append(text)

        doc.close()

        combined_text = "\n\n".join(full_text)
        classification = classify_document(combined_text)

        return {
            "success": True,
            "file_name": os.path.basename(file_path),
            "total_pages": len(pages),
            "total_characters": sum(p["char_count"] for p in pages),
            "scanned_pages_detected": scanned_pages,
            "ocr_used_pages": ocr_used_pages,
            "ocr_available": bool(_import_pytesseract()) and bool(_import_pil_image()) and _tesseract_available(),
            "pages": pages,
            "full_text": combined_text,
            "classification": classification,
            "extraction_method": "PyMuPDF+OCR" if ocr_used_pages > 0 else "PyMuPDF",
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"PyMuPDF extraction failed: {e}")
        return {"success": False, "error": str(e), "file_name": os.path.basename(file_path)}


def _fallback_text_extraction(file_path: str) -> Dict[str, Any]:
    """Fallback text extraction using pdfplumber when PyMuPDF is unavailable."""
    pdfplumber = _import_pdfplumber()
    if pdfplumber is None:
        return {"success": False, "error": "No PDF extraction library available"}

    try:
        with pdfplumber.open(file_path) as pdf:
            pages = []
            full_text = []
            for i, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                pages.append({"page_number": i + 1, "text": text, "char_count": len(text)})
                full_text.append(text)

        combined_text = "\n\n".join(full_text)
        return {
            "success": True,
            "file_name": os.path.basename(file_path),
            "total_pages": len(pages),
            "total_characters": sum(p["char_count"] for p in pages),
            "pages": pages,
            "full_text": combined_text,
            "classification": classify_document(combined_text),
            "extraction_method": "pdfplumber",
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def _ocr_page_fitz(page) -> Tuple[str, Optional[float]]:
    """
    OCR a PyMuPDF page. Returns (text, confidence) where confidence is a heuristic 0..1.
    Degrades gracefully when OCR deps/binary are missing.
    """
    pytesseract = _import_pytesseract()
    Image = _import_pil_image()
    if pytesseract is None or Image is None or not _tesseract_available():
        return "", None
    try:
        pix = page.get_pixmap(dpi=200)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        text = pytesseract.image_to_string(img) or ""
        stripped = text.strip()
        if not stripped:
            return "", 0.0
        alnum = sum(1 for c in stripped if c.isalnum())
        conf = min(1.0, max(0.0, alnum / max(1, len(stripped))))
        return stripped, round(conf, 3)
    except Exception as e:
        logger.warning("OCR failed: %s", e)
        return "", None


# ─────────────────────────────────────────────────────────────────
# TABLE EXTRACTION
# ─────────────────────────────────────────────────────────────────
def extract_tables_from_pdf(file_path: str) -> Dict[str, Any]:
    """
    Extract tables from a PDF using pdfplumber.
    Returns a list of tables with headers and rows.
    """
    pdfplumber = _import_pdfplumber()
    if pdfplumber is None:
        return {"success": False, "error": "pdfplumber not installed", "tables": []}

    try:
        tables_found = []
        with pdfplumber.open(file_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                page_tables = page.extract_tables()
                for table_idx, table in enumerate(page_tables or []):
                    if not table or len(table) < 2:
                        continue

                    # First row as headers, rest as data
                    headers = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(table[0])]
                    rows = []
                    for row in table[1:]:
                        row_dict = {}
                        for i, cell in enumerate(row):
                            key = headers[i] if i < len(headers) else f"col_{i}"
                            row_dict[key] = str(cell).strip() if cell else ""
                        rows.append(row_dict)

                    tables_found.append({
                        "page": page_num + 1,
                        "table_index": table_idx,
                        "headers": headers,
                        "rows": rows,
                        "row_count": len(rows),
                    })

        return {
            "success": True,
            "file_name": os.path.basename(file_path),
            "total_tables": len(tables_found),
            "tables": tables_found,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"Table extraction failed: {e}")
        return {"success": False, "error": str(e), "tables": []}


# ─────────────────────────────────────────────────────────────────
# FINANCIAL STATEMENT PARSERS
# ─────────────────────────────────────────────────────────────────
def _extract_amount(text: str, label: str) -> Optional[float]:
    """Extract a monetary amount near a label in the text."""
    patterns = [
        rf"{re.escape(label)}\s*[:\-]?\s*₹?\s*([\d,]+(?:\.\d+)?)\s*(?:crore|cr|lakh|lac|lakhs)?",
        rf"{re.escape(label)}\s*[:\-]?\s*\(?\s*([\d,]+(?:\.\d+)?)\s*\)?",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount_str = match.group(1).replace(",", "")
            try:
                amount = float(amount_str)
                # Check for crore/lakh suffix
                context = text[match.start():match.end() + 20].lower()
                if "crore" in context or "cr" in context:
                    amount *= 10_000_000
                elif "lakh" in context or "lac" in context:
                    amount *= 100_000
                return amount
            except ValueError:
                continue
    return None


def parse_balance_sheet(tables: List[Dict], text: str) -> Dict[str, Any]:
    """
    Parse balance sheet data from extracted tables and text.
    Returns structured financial data.
    """
    result = {
        "total_assets": None,
        "total_liabilities": None,
        "shareholders_equity": None,
        "current_assets": None,
        "non_current_assets": None,
        "current_liabilities": None,
        "non_current_liabilities": None,
        "cash_and_equivalents": None,
        "inventory": None,
        "trade_receivables": None,
        "trade_payables": None,
        "borrowings": None,
        "share_capital": None,
        "reserves_and_surplus": None,
    }

    # Try extracting from text first
    label_map = {
        "total_assets": ["total assets", "total asset"],
        "total_liabilities": ["total liabilities", "total liability"],
        "shareholders_equity": ["shareholders equity", "shareholder equity", "total equity", "equity"],
        "current_assets": ["current assets", "total current assets"],
        "non_current_assets": ["non-current assets", "non current assets", "fixed assets"],
        "current_liabilities": ["current liabilities", "total current liabilities"],
        "non_current_liabilities": ["non-current liabilities", "long-term liabilities"],
        "cash_and_equivalents": ["cash and cash equivalents", "cash and bank", "cash & bank"],
        "inventory": ["inventories", "inventory", "stock-in-trade"],
        "trade_receivables": ["trade receivables", "sundry debtors", "accounts receivable"],
        "trade_payables": ["trade payables", "sundry creditors", "accounts payable"],
        "borrowings": ["total borrowings", "borrowings", "long-term borrowings"],
        "share_capital": ["share capital", "issued capital", "paid-up capital"],
        "reserves_and_surplus": ["reserves and surplus", "retained earnings"],
    }

    for field, labels in label_map.items():
        for label in labels:
            value = _extract_amount(text, label)
            if value is not None:
                result[field] = value
                break

    # Try extracting from tables as backup
    for table in tables:
        for row in table.get("rows", []):
            for key, value in row.items():
                if not key or not value:
                    continue
                key_lower = key.lower().strip()
                for field, labels in label_map.items():
                    if result[field] is None and any(l in key_lower for l in labels):
                        try:
                            result[field] = float(value.replace(",", "").replace("₹", "").strip())
                        except (ValueError, AttributeError):
                            pass

    # Compute derived metrics
    if result["total_assets"] and result["total_liabilities"]:
        result["debt_to_asset_ratio"] = round(result["total_liabilities"] / result["total_assets"], 4)
    if result["current_assets"] and result["current_liabilities"]:
        result["current_ratio"] = round(result["current_assets"] / result["current_liabilities"], 4)

    return result


def parse_income_statement(tables: List[Dict], text: str) -> Dict[str, Any]:
    """
    Parse income statement / P&L data.
    Returns structured revenue, cost, and profitability data.
    """
    result = {
        "revenue_from_operations": None,
        "other_income": None,
        "total_revenue": None,
        "cost_of_goods_sold": None,
        "operating_expenses": None,
        "ebitda": None,
        "depreciation": None,
        "interest_expense": None,
        "profit_before_tax": None,
        "tax_expense": None,
        "profit_after_tax": None,
        "earnings_per_share": None,
    }

    label_map = {
        "revenue_from_operations": ["revenue from operations", "net sales", "sales revenue", "total sales"],
        "other_income": ["other income", "non-operating income"],
        "total_revenue": ["total revenue", "total income", "gross revenue"],
        "cost_of_goods_sold": ["cost of goods sold", "cost of materials consumed", "cogs"],
        "operating_expenses": ["operating expenses", "total expenses", "operating costs"],
        "ebitda": ["ebitda", "operating profit", "operating income"],
        "depreciation": ["depreciation", "depreciation and amortisation", "depreciation & amortization"],
        "interest_expense": ["interest expense", "finance cost", "finance costs", "interest cost"],
        "profit_before_tax": ["profit before tax", "pbt", "income before tax"],
        "tax_expense": ["tax expense", "income tax", "provision for tax"],
        "profit_after_tax": ["profit after tax", "pat", "net profit", "net income"],
        "earnings_per_share": ["earnings per share", "eps", "basic eps"],
    }

    for field, labels in label_map.items():
        for label in labels:
            value = _extract_amount(text, label)
            if value is not None:
                result[field] = value
                break

    # Derive metrics
    if result["total_revenue"] and result["ebitda"]:
        result["ebitda_margin"] = round((result["ebitda"] / result["total_revenue"]) * 100, 2)
    if result["total_revenue"] and result["profit_after_tax"]:
        result["net_profit_margin"] = round((result["profit_after_tax"] / result["total_revenue"]) * 100, 2)
    if result["ebitda"] and result["interest_expense"] and result["interest_expense"] > 0:
        result["interest_coverage_ratio"] = round(result["ebitda"] / result["interest_expense"], 2)

    return result


def parse_bank_statement(tables: List[Dict], text: str) -> Dict[str, Any]:
    """
    Parse bank statement data for cash flow analysis.
    """
    result = {
        "account_number_masked": None,
        "statement_period": None,
        "opening_balance": None,
        "closing_balance": None,
        "total_credits": None,
        "total_debits": None,
        "transaction_count": 0,
        "average_monthly_balance": None,
        "highest_credit": None,
        "highest_debit": None,
        "inward_cheque_bounces": 0,
        "outward_cheque_bounces": 0,
        "transactions": [],
        "monthly_summary": [],
        "top_counterparties": [],
        "emi_like_debits": 0,
        "bounce_like_entries": 0,
    }

    # Extract from text
    result["opening_balance"] = _extract_amount(text, "opening balance")
    result["closing_balance"] = _extract_amount(text, "closing balance")
    result["total_credits"] = _extract_amount(text, "total credits")
    result["total_debits"] = _extract_amount(text, "total debits")

    # Parse transactions from extracted tables
    txns = _extract_bank_transactions(tables)
    result["transactions"] = txns
    result["transaction_count"] = len(txns) if txns else sum(t.get("row_count", 0) for t in tables)

    if txns:
        credits = [t["credit"] for t in txns if t.get("credit") is not None]
        debits = [t["debit"] for t in txns if t.get("debit") is not None]
        balances = [t["balance"] for t in txns if t.get("balance") is not None]
        if credits:
            result["total_credits"] = round(sum(credits), 2)
            result["highest_credit"] = round(max(credits), 2)
        if debits:
            result["total_debits"] = round(sum(debits), 2)
            result["highest_debit"] = round(max(debits), 2)
        if balances:
            result["average_monthly_balance"] = round(sum(balances) / len(balances), 2)

        result["monthly_summary"] = _monthly_cashflow_summary(txns)
        result["top_counterparties"] = _top_counterparties(txns)
        result["emi_like_debits"] = sum(1 for t in txns if _looks_like_emi(t.get("narration", "")))
        result["bounce_like_entries"] = sum(1 for t in txns if _looks_like_bounce(t.get("narration", "")))

    # Derive avg monthly balance from opening and closing
    if result["opening_balance"] and result["closing_balance"]:
        result["average_monthly_balance"] = round(
            (result["opening_balance"] + result["closing_balance"]) / 2, 2
        )

    # Check for bounce indicators in text
    bounce_match = re.search(r"inward.*bounce.*?(\d+)", text, re.IGNORECASE)
    if bounce_match:
        result["inward_cheque_bounces"] = int(bounce_match.group(1))
    bounce_match = re.search(r"outward.*bounce.*?(\d+)", text, re.IGNORECASE)
    if bounce_match:
        result["outward_cheque_bounces"] = int(bounce_match.group(1))

    return result


def _parse_float_amount(s: Any) -> Optional[float]:
    if s is None:
        return None
    s = str(s).strip()
    if not s:
        return None
    s = s.replace("₹", "").replace(",", "").strip()
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1].strip()
    try:
        v = float(s)
        return -v if neg else v
    except Exception:
        return None


def _parse_date(s: Any) -> Optional[str]:
    if not s:
        return None
    s = str(s).strip()
    if not s:
        return None
    try:
        from dateutil import parser as date_parser  # pandas dependency in worker env
        dt = date_parser.parse(s, dayfirst=True, fuzzy=True)
        return dt.date().isoformat()
    except Exception:
        return None


def _extract_bank_transactions(tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    keys = {
        "date": ["date", "txn date", "transaction date", "value date"],
        "narration": ["narration", "description", "particular", "remarks", "details"],
        "debit": ["debit", "withdrawal", "dr", "amount (dr)"],
        "credit": ["credit", "deposit", "cr", "amount (cr)"],
        "balance": ["balance", "running balance"],
    }

    txns: List[Dict[str, Any]] = []
    for t in tables or []:
        for row in t.get("rows", []) or []:
            norm = {str(k).lower().strip(): row.get(k) for k in row.keys()}

            def pick(wants: List[str]) -> Any:
                for k, v in norm.items():
                    if any(w in k for w in wants):
                        return v
                return None

            date_v = pick(keys["date"])
            narr_v = pick(keys["narration"])
            debit_v = pick(keys["debit"])
            credit_v = pick(keys["credit"])
            bal_v = pick(keys["balance"])

            if date_v is None and narr_v is None and debit_v is None and credit_v is None and bal_v is None:
                continue

            txns.append({
                "date": _parse_date(date_v),
                "narration": str(narr_v).strip() if narr_v is not None else "",
                "debit": _parse_float_amount(debit_v),
                "credit": _parse_float_amount(credit_v),
                "balance": _parse_float_amount(bal_v),
            })
    return [t for t in txns if t.get("date") or t.get("narration")]


def _monthly_cashflow_summary(txns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    monthly: Dict[str, Dict[str, Any]] = {}
    for t in txns:
        d = t.get("date")
        if not d:
            continue
        m = d[:7]
        if m not in monthly:
            monthly[m] = {"month": m, "credits": 0.0, "debits": 0.0, "txns": 0}
        monthly[m]["txns"] += 1
        if t.get("credit") is not None:
            monthly[m]["credits"] += float(t["credit"])
        if t.get("debit") is not None:
            monthly[m]["debits"] += float(t["debit"])
    out = list(monthly.values())
    out.sort(key=lambda x: x["month"])
    for m in out:
        m["credits"] = round(m["credits"], 2)
        m["debits"] = round(m["debits"], 2)
        m["net"] = round(m["credits"] - m["debits"], 2)
    return out


def _counterparty_from_narration(narr: str) -> str:
    n = (narr or "").strip()
    if not n:
        return ""
    tokens = re.split(r"\s+", re.sub(r"[^A-Za-z0-9\s]", " ", n))
    stop = {"neft", "imps", "rtgs", "upi", "ach", "ecs", "chq", "cheque", "cash", "transfer", "payment", "cr", "dr"}
    kept = [t for t in tokens if t and t.lower() not in stop]
    return " ".join(kept[:4]).strip()


def _top_counterparties(txns: List[Dict[str, Any]], top_n: int = 5) -> List[Dict[str, Any]]:
    agg: Dict[str, float] = {}
    for t in txns:
        cp = _counterparty_from_narration(t.get("narration", ""))
        if not cp:
            continue
        amt = 0.0
        if t.get("credit") is not None:
            amt = float(t["credit"])
        elif t.get("debit") is not None:
            amt = float(t["debit"])
        agg[cp] = agg.get(cp, 0.0) + abs(amt)
    items = [{"counterparty": k, "volume": round(v, 2)} for k, v in agg.items()]
    items.sort(key=lambda x: x["volume"], reverse=True)
    return items[:top_n]


def _looks_like_emi(narr: str) -> bool:
    n = (narr or "").lower()
    return any(k in n for k in ["emi", "installment", "loan repay", "term loan", "e-emi"])


def _looks_like_bounce(narr: str) -> bool:
    n = (narr or "").lower()
    return any(k in n for k in ["bounce", "returned", "insufficient", "chq return", "dishonour", "dishonor"])


def parse_gst_return(tables: List[Dict], text: str) -> Dict[str, Any]:
    """
    Parse GST return data (GSTR-3B / GSTR-2A).
    """
    result = {
        "gstin": None,
        "return_type": None,
        "tax_period": None,
        "taxable_value": None,
        "integrated_tax": None,
        "central_tax": None,
        "state_tax": None,
        "cess": None,
        "total_tax_liability": None,
        "input_tax_credit_claimed": None,
        "net_tax_payable": None,
    }

    # Extract GSTIN
    gstin_match = re.search(r"\b(\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d][A-Z\d])\b", text)
    if gstin_match:
        result["gstin"] = gstin_match.group(1)

    # Determine return type
    text_lower = text.lower()
    if "gstr-3b" in text_lower:
        result["return_type"] = "GSTR-3B"
    elif "gstr-2a" in text_lower:
        result["return_type"] = "GSTR-2A"
    elif "gstr-1" in text_lower:
        result["return_type"] = "GSTR-1"

    result["taxable_value"] = _extract_amount(text, "taxable value")
    result["integrated_tax"] = _extract_amount(text, "integrated tax")
    result["central_tax"] = _extract_amount(text, "central tax")
    result["state_tax"] = _extract_amount(text, "state tax") or _extract_amount(text, "state/ut tax")
    result["input_tax_credit_claimed"] = _extract_amount(text, "input tax credit")
    result["total_tax_liability"] = _extract_amount(text, "total tax liability")

    # Net tax payable
    if result["total_tax_liability"] and result["input_tax_credit_claimed"]:
        result["net_tax_payable"] = round(
            result["total_tax_liability"] - result["input_tax_credit_claimed"], 2
        )

    return result


def parse_bank_sanction_letter(tables: List[Dict], text: str) -> Dict[str, Any]:
    """
    Parse a bank sanction letter for key terms (limit, rate, tenure, collateral, covenants).
    Best-effort regex extraction with clear nulls when not found.
    """
    t = text or ""
    out: Dict[str, Any] = {
        "sanctioned_limit": _extract_amount(t, "sanctioned limit") or _extract_amount(t, "sanction amount") or _extract_amount(t, "limit"),
        "interest_rate_percent": None,
        "tenure_months": None,
        "facility_type": None,
        "collateral": None,
        "covenants": [],
        "processing_fee": _extract_amount(t, "processing fee"),
    }

    m = re.search(r"(rate of interest|interest rate|roi)\s*[:\-]?\s*([0-9]{1,2}(?:\.[0-9]{1,2})?)\s*%?", t, re.IGNORECASE)
    if m:
        out["interest_rate_percent"] = float(m.group(2))

    m = re.search(r"(tenure|repayment period)\s*[:\-]?\s*([0-9]{1,3})\s*(months|month|years|year)", t, re.IGNORECASE)
    if m:
        val = int(m.group(2))
        unit = m.group(3).lower()
        out["tenure_months"] = val * 12 if "year" in unit else val

    m = re.search(r"(facility|facility type)\s*[:\-]?\s*(.+)", t, re.IGNORECASE)
    if m:
        out["facility_type"] = m.group(2).strip()[:120]

    m = re.search(r"(security|collateral)\s*[:\-]?\s*(.+)", t, re.IGNORECASE)
    if m:
        out["collateral"] = m.group(2).strip()[:400]

    covenants: List[str] = []
    for line in (t.splitlines() or []):
        ll = line.strip()
        if not ll:
            continue
        if any(k in ll.lower() for k in ["covenant", "dscr", "debt service", "current ratio", "drawing power", "stock statement", "insurance"]):
            covenants.append(ll[:200])
    out["covenants"] = covenants[:15]
    return out


def parse_itr(tables: List[Dict], text: str) -> Dict[str, Any]:
    """
    Parse ITR acknowledgement / ITR-V for core fields (PAN, AY, total income, tax paid).
    """
    t = text or ""
    out: Dict[str, Any] = {
        "pan": None,
        "assessment_year": None,
        "acknowledgement_number": None,
        "gross_total_income": None,
        "total_income": None,
        "tax_payable": None,
        "refund": None,
        "filing_date": None,
    }

    m = re.search(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", t)
    if m:
        out["pan"] = m.group(1)

    m = re.search(r"(assessment year|ay)\s*[:\-]?\s*([0-9]{4}\s*-\s*[0-9]{2,4})", t, re.IGNORECASE)
    if m:
        out["assessment_year"] = m.group(2).replace(" ", "")

    m = re.search(r"(acknowledgement\s*(no|number))\s*[:\-]?\s*([0-9]{8,20})", t, re.IGNORECASE)
    if m:
        out["acknowledgement_number"] = m.group(3)

    out["gross_total_income"] = _extract_amount(t, "gross total income")
    out["total_income"] = _extract_amount(t, "total income")
    out["tax_payable"] = _extract_amount(t, "tax payable") or _extract_amount(t, "total tax")
    out["refund"] = _extract_amount(t, "refund")

    m = re.search(r"(date of filing|filed on)\s*[:\-]?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})", t, re.IGNORECASE)
    if m:
        out["filing_date"] = m.group(2)

    return out


# ─────────────────────────────────────────────────────────────────
# UNIFIED DOCUMENT PROCESSING PIPELINE
# ─────────────────────────────────────────────────────────────────
def process_document(file_path: str) -> Dict[str, Any]:
    """
    Full document processing pipeline:
    1. Extract text
    2. Classify document
    3. Extract tables
    4. Parse structured data based on classification
    """
    logger.info(f"Processing document: {file_path}")

    # Step 1: Extract text
    text_result = extract_text_from_pdf(file_path)
    if not text_result.get("success"):
        return {"success": False, "error": text_result.get("error", "Text extraction failed")}

    # Step 2: Classify
    classification = text_result["classification"]
    doc_type = classification["document_type"]

    # Step 3: Extract tables
    table_result = extract_tables_from_pdf(file_path)
    tables = table_result.get("tables", [])

    # Step 4: Parse based on type
    full_text = text_result["full_text"]
    structured_data = {}

    if doc_type == "balance_sheet":
        structured_data = parse_balance_sheet(tables, full_text)
    elif doc_type == "income_statement":
        structured_data = parse_income_statement(tables, full_text)
    elif doc_type == "bank_statement":
        structured_data = parse_bank_statement(tables, full_text)
    elif doc_type == "gst_return":
        structured_data = parse_gst_return(tables, full_text)
    elif doc_type == "bank_sanction_letter":
        structured_data = parse_bank_sanction_letter(tables, full_text)
    elif doc_type == "itr":
        structured_data = parse_itr(tables, full_text)
    else:
        # For other types, provide text summary
        structured_data = {
            "document_type": doc_type,
            "summary": full_text[:2000],
            "key_tables": tables[:3] if tables else [],
        }

    return {
        "success": True,
        "file_name": text_result["file_name"],
        "document_type": doc_type,
        "classification_confidence": classification["confidence"],
        "total_pages": text_result["total_pages"],
        "total_tables": table_result.get("total_tables", 0),
        "structured_data": structured_data,
        "raw_text_preview": full_text[:1000],
        "extraction_method": text_result.get("extraction_method", "unknown"),
        "timestamp": datetime.now().isoformat(),
    }
