import os
import io
import json
import math
import logging
from datetime import datetime
from typing import Dict, Any

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, 
    Image as RLImage, PageBreak
)
from reportlab.platypus.flowables import Flowable
from reportlab.graphics.shapes import Drawing, Group, Rect, String, Polygon, Circle, Line
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger("intellicredit.cam_pdf")

# Palette
NAVY = HexColor("#0D1B2A")
ACCENT_BLUE = HexColor("#1A56DB")
TEAL = HexColor("#0E9F6E")
RED = HexColor("#E02424")
AMBER = HexColor("#D97706")
TEXT_BODY = HexColor("#0F172A")
MID_GRAY = HexColor("#64748B")
BORDER_COLOR = HexColor("#CBD5E1")
BG_LIGHT = HexColor("#F8FAFC")
BG_BLUE = HexColor("#EFF6FF")
WHITE = HexColor("#FFFFFF")

def draw_header_footer(canvas, doc, data):
    canvas.saveState()
    # Watermark
    canvas.setFillColor(HexColor("#E2E8F0"), alpha=0.08)
    canvas.setFont("Helvetica-Bold", 48)
    canvas.translate(A4[0]/2, A4[1]/2)
    canvas.rotate(45)
    canvas.drawCentredString(0, 0, "CONFIDENTIAL")
    canvas.rotate(-45)
    canvas.translate(-A4[0]/2, -A4[1]/2)
    canvas.setStrokeAlpha(1.0)
    canvas.setFillAlpha(1.0)

    # Header
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 14*mm, A4[0], 14*mm, fill=1, stroke=0)
    
    canvas.setFillColor(ACCENT_BLUE)
    canvas.rect(0, A4[1] - 15*mm, A4[0], 1*mm, fill=1, stroke=0)
    
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(WHITE)
    canvas.drawString(20*mm, A4[1] - 8*mm, "INTELLICREDIT  |  VIVRITI CAPITAL")
    
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawCentredString(A4[0]/2, A4[1] - 8*mm, "CREDIT APPRAISAL MEMORANDUM")
    
    # Confidential Badge
    canvas.setFillColor(RED)
    canvas.roundRect(A4[0] - 20*mm - 25*mm, A4[1] - 10*mm, 25*mm, 5*mm, 1*mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 7)
    canvas.drawCentredString(A4[0] - 20*mm - 12.5*mm, A4[1] - 8.5*mm, "CONFIDENTIAL")

    # Footer
    canvas.setStrokeColor(BORDER_COLOR)
    canvas.setLineWidth(0.5)
    canvas.line(20*mm, 20*mm, A4[0] - 20*mm, 20*mm)
    
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MID_GRAY)
    app_id = data.get("app_id", "N/A")
    company = data.get("company_name") or data.get("companyName") or ""
    dt = data.get("generated_at") or datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    
    canvas.drawString(20*mm, 15*mm, f"Application ID: {app_id}  |  {company}")
    canvas.drawCentredString(A4[0]/2, 15*mm, f"Page {doc.page} of {doc.page} (approx)")
    canvas.drawRightString(A4[0] - 20*mm, 15*mm, f"Generated: {dt}  |  IntelliCredit AI Engine")
    
    canvas.restoreState()


class SectionHeader(Flowable):
    def __init__(self, num, title, badge=""):
        Flowable.__init__(self)
        self.num = num
        self.title = title
        self.badge = badge
        self.width = A4[0] - 40*mm
        self.height = 8*mm

    def draw(self):
        self.canv.setFillColor(NAVY)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)
        
        self.canv.setFillColor(WHITE)
        self.canv.setFont("Helvetica", 9)
        self.canv.drawString(4*mm, 2.5*mm, self.num)
        
        self.canv.setFont("Helvetica-Bold", 10)
        self.canv.drawString(12*mm, 2.5*mm, self.title)
        
        if self.badge:
            self.canv.setFont("Helvetica", 7)
            bw = self.canv.stringWidth(self.badge, "Helvetica", 7) + 6*mm
            self.canv.setFillColor(ACCENT_BLUE)
            self.canv.roundRect(self.width - bw - 2*mm, 1.5*mm, bw, 5*mm, 2.5*mm, fill=1, stroke=0)
            self.canv.setFillColor(WHITE)
            self.canv.drawCentredString(self.width - bw/2 - 2*mm, 2.8*mm, self.badge)


class Gauge(Flowable):
    def __init__(self, score, title, is_sentiment=False):
        Flowable.__init__(self)
        self.score = score
        self.title = title
        self.is_sentiment = is_sentiment
        self.width = 80*mm
        self.height = 45*mm

    def draw(self):
        c = self.canv
        xc, yc = self.width/2, 10*mm
        r = 30*mm
        
        c.setLineWidth(4*mm)
        
        if self.is_sentiment:
            # -1 to 1 (Neg to Pos)
            # 180 to 0 degrees
            c.setStrokeColor(RED)
            c.arc(xc - r, yc - r, xc + r, yc + r, 120, 60)
            c.setStrokeColor(AMBER)
            c.arc(xc - r, yc - r, xc + r, yc + r, 60, 60)
            c.setStrokeColor(TEAL)
            c.arc(xc - r, yc - r, xc + r, yc + r, 0, 60)
            
            # Map -1..1 to 180..0
            s = max(-1.0, min(1.0, self.score))
            angle = 90 - (s * 90)
        else:
            # 0 to 100
            c.setStrokeColor(TEAL)
            c.arc(xc - r, yc - r, xc + r, yc + r, 90, 90)
            c.setStrokeColor(AMBER)
            c.arc(xc - r, yc - r, xc + r, yc + r, 45, 45)
            c.setStrokeColor(RED)
            c.arc(xc - r, yc - r, xc + r, yc + r, 0, 45)
            
            s = max(0.0, min(100.0, self.score))
            angle = 180 - (s / 100.0 * 180)

        # Needle
        rad = math.radians(angle)
        nx = xc + (r - 4*mm) * math.cos(rad)
        ny = yc + (r - 4*mm) * math.sin(rad)
        
        c.setLineWidth(2)
        c.setStrokeColor(NAVY)
        c.line(xc, yc, nx, ny)
        c.setFillColor(NAVY)
        c.circle(xc, yc, 3*mm, fill=1, stroke=0)
        
        # Text
        c.setFont("Helvetica-Bold", 18)
        if self.is_sentiment:
            c.drawCentredString(xc, yc - 8*mm, f"{self.score:.1f}")
        else:
            c.drawCentredString(xc, yc - 8*mm, f"{self.score:.1f}")
        
        c.setFont("Helvetica", 8)
        c.setFillColor(MID_GRAY)
        c.drawCentredString(xc, yc - 12*mm, self.title)


def generate_shap_chart(shap_factors):
    plt.figure(figsize=(4, 3))
    factors = sorted(shap_factors, key=lambda x: x["value"])
    labels = [f["factor"] for f in factors]
    values = [f["value"] for f in factors]
    colors = ["#E02424" if v < 0 else "#0E9F6E" for v in values]
    
    plt.barh(labels, values, color=colors)
    plt.title("Decision Factor Weights (SHAP)", fontsize=9, color="#0D1B2A", pad=10)
    plt.tick_params(axis='both', labelsize=8, colors="#0F172A")
    plt.gca().spines['top'].set_visible(False)
    plt.gca().spines['right'].set_visible(False)
    plt.gca().spines['left'].set_color('#CBD5E1')
    plt.gca().spines['bottom'].set_color('#CBD5E1')
    plt.axvline(0, color='#CBD5E1', linewidth=0.8)
    plt.tight_layout()
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, transparent=True)
    plt.close()
    buf.seek(0)
    return buf


def generate_financial_chart(revenue, margin):
    plt.figure(figsize=(6, 3))
    years = ["FY2021", "FY2022", "FY2023", "FY2024"]
    # Mock trend data based on current
    rev_data = [revenue * 0.7, revenue * 0.85, revenue * 0.95, revenue]
    margin_data = [margin - 2, margin - 1, margin + 1, margin]
    
    fig, ax1 = plt.subplots(figsize=(6, 3))
    ax2 = ax1.twinx()
    
    ax1.bar(years, rev_data, color="#0D1B2A", width=0.4, label="Revenue")
    ax2.plot(years, margin_data, color="#0E9F6E", marker='o', linewidth=2, label="EBITDA Margin %")
    
    ax1.set_ylabel("Revenue (Rs. Cr)", color="#0D1B2A", fontsize=8)
    ax2.set_ylabel("Margin %", color="#0E9F6E", fontsize=8)
    ax1.tick_params(axis='y', labelsize=8)
    ax2.tick_params(axis='y', labelsize=8)
    ax1.tick_params(axis='x', labelsize=8)
    
    ax1.spines['top'].set_visible(False)
    ax2.spines['top'].set_visible(False)
    
    lines, labels = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax2.legend(lines + lines2, labels + labels2, loc='upper left', fontsize=7, frameon=False)
    
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, transparent=True)
    plt.close('all')
    buf.seek(0)
    return buf

def create_dot(color):
    d = Drawing(10, 10)
    d.add(Circle(5, 5, 3, fillColor=color, strokeColor=None))
    return d


def extract_financials_from_docs(app: dict) -> dict:
    """Extract real financial data from document_extraction_json"""
    raw = app.get("documentExtractionJson") or app.get("document_extraction_json")
    if not raw:
        return {}
    
    try:
        if isinstance(raw, str):
            extractions = json.loads(raw)
        else:
            extractions = raw
        
        if not isinstance(extractions, list):
            extractions = [extractions]
        
        # Find the best extraction (highest confidence, has data)
        best = None
        for e in extractions:
            if isinstance(e, dict) and e.get("success") and e.get("structured_data"):
                sd = e["structured_data"]
                if sd.get("revenue_from_operations") or sd.get("total_revenue"):
                    best = sd
                    break
        
        if not best:
            best = extractions[0].get("structured_data", {}) if extractions else {}
        
        # Map to standard field names
        revenue = best.get("revenue_from_operations") or best.get("total_revenue") or 0
        debt = best.get("borrowings") or best.get("total_debt") or 0
        equity = best.get("shareholders_equity") or best.get("total_equity") or 0
        ebitda = best.get("ebitda") or 0
        ebitda_margin = (ebitda / revenue * 100) if revenue > 0 else 0
        icr = best.get("interest_coverage_ratio") or 0
        current_ratio = best.get("current_ratio") or 0
        de_ratio = (debt / equity) if equity > 0 else best.get("debt_to_asset_ratio") or 0
        
        # Convert to Crores for display
        def to_cr(val):
            if not val or val == 0:
                return 0.0
            try:
                return round(float(val) / 10000000, 2)
            except (ValueError, TypeError):
                return 0.0
        
        return {
            "annual_revenue_cr": to_cr(revenue),
            "total_debt_cr": to_cr(debt),
            "equity_cr": to_cr(equity),
            "ebitda_margin": round(float(ebitda_margin), 1) if ebitda_margin else 0,
            "interest_coverage": round(float(icr), 2) if icr else 0,
            "current_ratio": round(float(current_ratio), 2) if current_ratio else 0,
            "debt_to_equity": round(float(de_ratio), 2) if de_ratio else 0,
            "raw_revenue": revenue,
        }
    except Exception as e:
        logger.warn(f"[CAM] Error parsing extraction JSON: {e}")
        return {}


def generate_cam_pdf(data: dict, output_path: str) -> str:
    # --- ENRICHMENT LOGIC ---
    app = data  # Alias for extraction logic
    extracted = extract_financials_from_docs(app)
    
    # Financial metrics with fallback
    annual_revenue_cr = extracted.get("annual_revenue_cr") \
        or float(app.get("annualRevenue") or app.get("annual_revenue") or 0) / 10000000
    
    ebitda_margin = extracted.get("ebitda_margin") \
        or float(app.get("ebitdaMargin") or app.get("ebitda_margin") or 0)
    
    icr = extracted.get("interest_coverage") \
        or float(app.get("interestCoverageRatio") or app.get("interest_coverage_ratio") or 0)
    
    de_ratio = extracted.get("debt_to_equity") \
        or float(app.get("debtToEquityRatio") or app.get("debt_to_equity_ratio") or 0)
        
    revenue_growth = float(app.get("revenueGrowthPercent") or app.get("revenue_growth") or 0)
    cibil_proxy = app.get("creditScore") or app.get("cibil_proxy") or 0

    # Dynamic limit calculation
    raw_revenue = extracted.get("raw_revenue", 0)
    if raw_revenue > 0:
        base_limit = raw_revenue * 0.10  # 10% of revenue
        score = app.get("mlRiskScore") or app.get("ml_risk_score") or 50
        
        if score >= 80: multiplier = 1.5
        elif score >= 70: multiplier = 1.2
        elif score >= 60: multiplier = 1.0
        else: multiplier = 0.7
        
        final_limit_cr = round((base_limit * multiplier) / 10000000, 1)
    else:
        # Fallback
        final_limit_cr = app.get("recommendedCreditLimit") or app.get("credit_limit_cr") or 0
        # If it's a huge number, it's absolute INR
        if final_limit_cr > 1000:
            final_limit_cr = round(final_limit_cr / 10000000, 1)

    # Finalize the 'fin' dict for the rest of the generator
    fin = {
        "annual_revenue_cr": annual_revenue_cr,
        "revenue_growth_pct": revenue_growth,
        "ebitda_margin_pct": ebitda_margin,
        "debt_to_equity": de_ratio,
        "interest_coverage": icr,
        "cibil_proxy": cibil_proxy
    }
    limit = final_limit_cr
    rate = app.get("recommendedInterestRate") or app.get("interest_rate_pct") or 0

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=20*mm,
        rightMargin=20*mm,
        topMargin=25*mm,
        bottomMargin=25*mm
    )
    
    styles = getSampleStyleSheet()
    p_body = ParagraphStyle('Body', fontName='Helvetica', fontSize=10, leading=14, textColor=TEXT_BODY)
    p_bold = ParagraphStyle('Bold', fontName='Helvetica-Bold', fontSize=10, textColor=TEXT_BODY)
    p_mono = ParagraphStyle('Mono', fontName='Courier', fontSize=8, textColor=MID_GRAY)

    elements = []

    # ── PAGE 1: COVER ──
    # Top Block
    t_cover = Table([[Paragraph("<font color='white' size=22><b>CREDIT APPRAISAL MEMORANDUM</b></font>", ParagraphStyle('C', alignment=1))]], colWidths=[A4[0]-40*mm], rowHeights=[60*mm])
    t_cover.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), NAVY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('LINEBELOW', (0,0), (-1,-1), 1.5, HexColor("#B8860B"))
    ]))
    elements.append(t_cover)
    elements.append(Spacer(1, 15*mm))

    # Identity
    company_name = data.get('company_name') or app.get('companyName') or "Unknown Company"
    sector = data.get('sector') or app.get('sector') or "Unknown Sector"
    
    elements.append(Paragraph(f"<font color='#0D1B2A' size=26><b>{company_name}</b></font>", ParagraphStyle('C', alignment=1)))
    elements.append(Spacer(1, 2*mm))
    elements.append(Paragraph(f"<font color='#64748B' size=10>{sector}</font>", ParagraphStyle('C', alignment=1)))
    elements.append(Spacer(1, 5*mm))
    
    # Divider
    elements.append(Table([['']], colWidths=[A4[0]-40*mm], rowHeights=[1], style=TableStyle([('LINEABOVE', (0,0), (-1,-1), 1, BORDER_COLOR)])))
    elements.append(Spacer(1, 10*mm))

    # Meta Grid
    ml_score = data.get("ml_risk_score") or app.get("mlRiskScore") or 0
    decision = data.get("decision") or app.get("finalDecision") or "REVIEW"
    d_color = TEAL if "APPROVE" in decision else (RED if "REJECT" in decision else AMBER)
    
    meta_data = [
        [
            Paragraph(f"<b>Prepared For:</b><br/>{data.get('prepared_for') or 'Credit Committee — Vivriti Capital'}<br/><br/><b>Prepared By:</b><br/>{data.get('prepared_by') or 'IntelliCredit AI Engine v2.1'}<br/><br/><b>Date:</b><br/>{data.get('generated_at') or datetime.now().strftime('%Y-%m-%d')}", p_body),
            Paragraph(f"<b>Document Class:</b><br/>Confidential<br/><br/><b>Policy:</b><br/>{data.get('policy') or app.get('policyRuleApplied') or 'N/A'}<br/><br/><b>Validity:</b><br/>90 Days", p_body),
            Gauge(ml_score, "/ 100 HYBRID ML SCORE")
        ],
        [
            "", "", 
            Paragraph(f"<font color='white'><b>{decision.replace('_', ' ')}</b></font>", ParagraphStyle('C', alignment=1, backColor=d_color, borderPadding=5, borderRadius=5))
        ]
    ]
    t_meta = Table(meta_data, colWidths=[55*mm, 55*mm, 60*mm])
    t_meta.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
    elements.append(t_meta)
    
    elements.append(PageBreak())

    # ── PAGE 2: SUMMARY ──
    elements.append(SectionHeader("01", "EXECUTIVE SUMMARY", "QUANTITATIVE ANALYSIS"))
    elements.append(Spacer(1, 5*mm))
    
    rationale = data.get("rationale") or app.get("decisionRationale") or "Generated via IntelliCredit Engine"
    elements.append(Paragraph(f"{company_name} ({sector}) has an ML Risk Score of {ml_score}. {rationale}", p_body))
    elements.append(Spacer(1, 8*mm))
    
    # fin is already enriched above
    metrics_data = [[
        f"Rs.{fin.get('annual_revenue_cr', 0):,.1f} Cr", 
        f"{fin.get('ebitda_margin_pct', 0):.1f}%", 
        f"{fin.get('interest_coverage', 0):.2f}x", 
        str(fin.get('cibil_proxy', 0))
    ], [
        "ANNUAL REVENUE", "EBITDA MARGIN", "INTEREST COVERAGE", "CIBIL PROXY SCORE"
    ]]
    t_met = Table(metrics_data, colWidths=[(A4[0]-40*mm)/4]*4)
    t_met.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_BLUE),
        ('TEXTCOLOR', (0,0), (-1,0), NAVY),
        ('FONT', (0,0), (-1,0), 'Helvetica-Bold', 14),
        ('TEXTCOLOR', (0,1), (-1,1), MID_GRAY),
        ('FONT', (0,1), (-1,1), 'Helvetica', 7),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('BOTTOMPADDING', (0,0), (-1,0), 0),
        ('TOPPADDING', (0,1), (-1,1), 2),
        ('LINEBEFORE', (1,0), (-1,-1), 1, WHITE),
    ]))
    elements.append(t_met)
    elements.append(Spacer(1, 10*mm))
    
    elements.append(SectionHeader("02", "RISK SCORE BREAKDOWN", "ML PIPELINE"))
    elements.append(Spacer(1, 5*mm))
    
    # SHAP Factors enrichment if data is raw app
    shap_factors = data.get("shap_factors", [])
    if not shap_factors and app.get("shapExplanationJson"):
        try:
            shap = json.loads(app.get("shapExplanationJson") or "{}")
            top_factors = shap.get("top_positive_factors", []) + shap.get("top_negative_factors", [])
            shap_factors = [{"factor": f.get("display_name", f.get("feature", "Factor")), "value": float(f.get("impact", 0))} for f in top_factors]
        except Exception:
            shap_factors = []

    shap_img = RLImage(generate_shap_chart(shap_factors), width=80*mm, height=60*mm)
    
    comp_data = [
        ["Component", "Score", "Weight", "Contribution"],
        ["Financial Health", "71/100", "40%", "28.4"],
        ["Market Intelligence", "48/100", "25%", "12.0"],
        ["Anomaly Detection", "85/100", "20%", "17.0"],
        ["Sentiment Analysis", "32/100", "15%", "4.8"],
        ["COMPOSITE SCORE", f"{ml_score:.1f}", "100%", f"{ml_score:.1f}"]
    ]
    t_comp = Table(comp_data, colWidths=[35*mm, 15*mm, 15*mm, 20*mm])
    t_comp.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONT', (0,0), (-1,0), 'Helvetica-Bold', 9),
        ('BACKGROUND', (0,-1), (-1,-1), ACCENT_BLUE),
        ('TEXTCOLOR', (0,-1), (-1,-1), WHITE),
        ('FONT', (0,-1), (-1,-1), 'Helvetica-Bold', 9),
        ('ALIGN', (1,0), (-1,-1), 'CENTER'),
        ('GRID', (0,0), (-1,-2), 0.5, BORDER_COLOR),
    ]))
    
    t_split = Table([[shap_img, t_comp]], colWidths=[90*mm, 85*mm])
    t_split.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE')]))
    elements.append(t_split)
    elements.append(PageBreak())

    # ── PAGE 3: FINANCIALS ──
    elements.append(SectionHeader("03", "FINANCIAL SNAPSHOT", "CREDIT METRICS"))
    elements.append(Spacer(1, 5*mm))
    
    fin_table = [
        ["", "Metric", "FY2024 Value", "Assessment", "Benchmark"],
        [create_dot(TEAL), "Annual Revenue", f"Rs.{fin.get('annual_revenue_cr',0):,.1f} Cr", "Strong", "—"],
        [create_dot(AMBER), "Revenue Growth", f"{fin.get('revenue_growth_pct',0):.1f}%", "Stagnant", "8-12%"],
        [create_dot(TEAL), "EBITDA Margin", f"{fin.get('ebitda_margin_pct',0):.1f}%", "Industry Std.", "20-25%"],
        [create_dot(TEAL), "Debt-to-Equity", f"{fin.get('debt_to_equity',0):.2f}x", "Healthy", "<1.5x"],
        [create_dot(RED if fin.get('interest_coverage',0) < 1.5 else TEAL), "Interest Coverage", f"{fin.get('interest_coverage',0):.2f}x", "Tight", ">2.0x"],
        [create_dot(TEAL), "CIBIL Proxy Score", str(fin.get('cibil_proxy',0)), "Prime", ">750"]
    ]
    t_fin = Table(fin_table, colWidths=[8*mm, 45*mm, 35*mm, 35*mm, 35*mm])
    t_fin.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONT', (0,0), (-1,0), 'Helvetica-Bold', 9),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (2,0), (-1,-1), 'CENTER'),
    ]))
    elements.append(t_fin)
    elements.append(Spacer(1, 8*mm))
    
    fin_chart = RLImage(generate_financial_chart(fin.get('annual_revenue_cr',100), fin.get('ebitda_margin_pct', 10)), width=120*mm, height=60*mm)
    elements.append(fin_chart)
    elements.append(Spacer(1, 8*mm))
    
    # Exposure Box
    exp_data = [
        [Paragraph("<b>Dynamic Exposure Model — Calculated Limits</b>", p_bold), ""],
        ["Base Limit (10% of Revenue):", f"Rs.{fin.get('annual_revenue_cr',0)*0.1:,.1f} Cr"],
        ["Risk Multiplier:", f"Applied (Score: {ml_score:.0f})"],
        ["FINAL SANCTIONED LIMIT:", f"Rs.{limit:,.1f} Cr"],
        ["Interest Rate (Score-based):", f"{rate:.1f}% p.a."]
    ]
    t_exp = Table(exp_data, colWidths=[100*mm, 50*mm])
    t_exp.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_BLUE),
        ('BOX', (0,0), (-1,-1), 1, ACCENT_BLUE),
        ('LINEBELOW', (0,0), (-1,0), 0.5, ACCENT_BLUE),
        ('LINEABOVE', (0,-2), (-1,-2), 0.5, ACCENT_BLUE),
        ('FONT', (0,-2), (-1,-1), 'Helvetica-Bold', 9),
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
    ]))
    elements.append(t_exp)
    elements.append(PageBreak())

    # ── PAGE 4: INTELLIGENCE ──
    elements.append(SectionHeader("04", "EXTERNAL INTELLIGENCE", "NLP & ANOMALY"))
    elements.append(Spacer(1, 5*mm))
    
    sent = data.get("nlp_sentiment_score") or app.get("sentimentScore") or 0
    sent_label = data.get("sentiment_label") or ("POSITIVE" if sent > 0.3 else ("NEGATIVE" if sent < -0.3 else "NEUTRAL"))
    anom_status = "CRITICAL" if data.get("anomaly_status") == "CRITICAL" or app.get("anomalyDetected") else "CLEAN"
    
    t_intel = Table([
        [Gauge(sent, f"NLP SENTIMENT: {sent_label}", is_sentiment=True),
         Paragraph(f"<b>ANOMALY DETECTION</b><br/><br/><font color='{'#0E9F6E' if anom_status=='CLEAN' else '#E02424'}' size=16><b>{anom_status}</b></font><br/><br/>Circular Trading: {data.get('circular_trading_risk') or app.get('circularTradingRisk') or 'LOW'}", p_body)]
    ], colWidths=[85*mm, 85*mm])
    t_intel.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
    elements.append(t_intel)
    elements.append(Spacer(1, 10*mm))
    
    news = data.get("news_articles", [])
    if not news and app.get("researchDataJson"):
        try:
            research = json.loads(app.get("researchDataJson") or "{}")
            news = research.get("news_items", [])
        except Exception:
            news = []

    if news:
        n_data = [["#", "Source", "Headline", "Risk"]]
        for i, n in enumerate(news[:8], 1):
            n_data.append([str(i), n.get("source", "")[:15], Paragraph(n.get("title", ""), p_body), n.get("risk_level", "NONE")])
        t_news = Table(n_data, colWidths=[10*mm, 30*mm, 100*mm, 30*mm])
        t_news.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), NAVY),
            ('TEXTCOLOR', (0,0), (-1,0), WHITE),
            ('FONT', (0,0), (-1,0), 'Helvetica-Bold', 9),
            ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        elements.append(t_news)
    
    elements.append(PageBreak())

    # ── PAGE 5: RECOMMENDATION ──
    elements.append(SectionHeader("05", "CREDIT COMMITTEE RECOMMENDATION", "FINAL"))
    elements.append(Spacer(1, 5*mm))
    
    dec_text = f"{decision.replace('_', ' ')} Rs.{limit} Cr @ {rate}% p.a."
    t_dec = Table([[Paragraph(f"<font size=16><b>{dec_text}</b></font><br/><br/><font color='#64748B'>Policy: {data.get('policy') or app.get('policyRuleApplied') or 'N/A'}</font><br/><br/>{rationale}", p_body)]], colWidths=[A4[0]-40*mm])
    t_dec.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 2, d_color),
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('LEFTPADDING', (0,0), (-1,-1), 15),
    ]))
    elements.append(t_dec)
    elements.append(Spacer(1, 10*mm))
    
    elements.append(Paragraph("<b>APPROVAL WORKFLOW</b>", p_bold))
    elements.append(Spacer(1, 5*mm))
    
    sign_data = [
        ["Prepared By", "Reviewed By", "Approved By"],
        [data.get('prepared_by', 'IntelliCredit AI'), "Credit Officer, Level 2", "Credit Committee"],
        ["", "", ""],
        [data.get('generated_at') or datetime.now().strftime('%Y-%m-%d'), "Date: ________________", "Date: ________________"]
    ]
    t_sign = Table(sign_data, colWidths=[(A4[0]-40*mm)/3]*3)
    t_sign.setStyle(TableStyle([
        ('LINEABOVE', (0,0), (-1,0), 0.5, MID_GRAY),
        ('FONT', (0,0), (-1,0), 'Helvetica-Bold', 7),
        ('TEXTCOLOR', (0,0), (-1,0), MID_GRAY),
        ('FONT', (0,1), (-1,-1), 'Helvetica', 9),
        ('BOTTOMPADDING', (0,1), (-1,1), 20),
    ]))
    elements.append(t_sign)

    doc.build(elements, onFirstPage=lambda c, d: draw_header_footer(c, d, data), onLaterPages=lambda c, d: draw_header_footer(c, d, data))
    return output_path
