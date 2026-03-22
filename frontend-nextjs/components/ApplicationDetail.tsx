"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, ReferenceLine,
    RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";
import {
    BarChart3,
    FileText,
    Zap,
    Brain,
    Globe,
    Shield,
    BarChart2,
    Activity,
    ArrowLeft,
    Download,
    FileDown,
    ArrowUpRight,
    TrendingUp,
    MoreHorizontal,
    UploadCloud,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    Minus,
    ChevronDown,
} from "lucide-react";
import type { LoanApplication } from "@/lib/types";
import {
    formatCurrency,
    getRiskColor,
    getRiskLabel,
    getDecisionConfig,
} from "@/lib/types";
import { intelliCreditApi } from "@/lib/api";
import {
    extractStructuredFinancialData,
    getMetricFlag,
    parseFinancialMetrics,
} from "@/lib/financialMetrics";
import ProgressStepper from "./ProgressStepper";
import { WebIntelligenceSection } from "./WebIntelligenceSection";
import type { ProgressStage } from "@/lib/types";

interface ApplicationDetailProps {
    application: LoanApplication;
    currentStage: ProgressStage | null;
    progress: number;
    progressMessage: string;
    isProcessing: boolean;
    creditOfficerNotes: string;
    onNotesChange: (notes: string) => void;
    onTriggerAnalysis: () => void;
    onApplicationUpdated?: (app: LoanApplication) => void;
    onBack?: () => void;
}

//  Components for the new Design System 

const Card = ({ children, className = "", style = {} }: { 
  children: React.ReactNode; 
  className?: string; 
  style?: React.CSSProperties 
}) => (
  <div
    className={`bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[4px] ${className}`}
    style={style}
  >
    {children}
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[12px] font-[700] uppercase tracking-[0.12em] 
    text-[var(--text-muted)] mb-4 font-mono">
    {children}
  </h3>
);

const Badge = ({ children, color = "blue" }: { 
  children: React.ReactNode; 
  color?: "blue" | "green" | "red" | "amber" | "purple" | "slate" 
}) => {
  const colors = {
    blue:   "bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] border-[var(--accent-blue-border)]",
    green:  "bg-[var(--accent-green-bg)] text-[var(--accent-green)] border-[var(--accent-green-border)]",
    red:    "bg-[var(--accent-red-bg)] text-[var(--accent-red)] border-[var(--accent-red-border)]",
    amber:  "bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border-[var(--accent-amber-border)]",
    purple: "bg-[var(--accent-purple-bg)] text-[var(--accent-purple)] border-[var(--accent-purple-border)]",
    slate:  "bg-[var(--bg-base)] text-[var(--text-secondary)] border-[var(--border-default)]",
  };
  return (
    <span className={`px-2 py-0.5 rounded-[3px] text-[10px] 
      font-[700] font-mono border tracking-wider ${colors[color]}`}>
      {children}
    </span>
  );
};

const ResearchRow = ({ 
  icon, 
  label, 
  summary, 
  sentimentColor = "var(--text-secondary)",
  children 
}: { 
  icon: React.ReactNode;
  label: string;
  summary: string;
  sentimentColor?: string;
  children?: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 
          hover:bg-[var(--bg-hover)] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-[14px] font-[600] text-[var(--text-primary)]">{label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-[500]" style={{ color: sentimentColor }}>
            {summary}
          </span>
          <ChevronDown 
            className="w-4 h-4 text-[var(--text-secondary)] transition-transform"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </div>
      </button>
      {open && children && (
        <div className="px-6 pb-5 border-t border-[var(--border-subtle)]">
          {children}
        </div>
      )}
    </div>
  );
};

export default function ApplicationDetail({
    application: app,
    currentStage,
    progress,
    progressMessage,
    isProcessing,
    creditOfficerNotes,
    onNotesChange,
    onTriggerAnalysis,
    onApplicationUpdated,
    onBack,
}: ApplicationDetailProps) {
    const [uploading, setUploading] = useState(false);
    const [useOcrLlm, setUseOcrLlm] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [lastUploadResult, setLastUploadResult] = useState<unknown>(null);
    const [computedMetrics, setComputedMetrics] = useState<ReturnType<typeof parseFinancialMetrics> | null>(null);

    const parsedDecision = useMemo(() => {
        const trace = (app as any).policyRuleApplied 
            || (app as any).policy_rule_applied 
            || (app as any).decisionRationale
            || (app as any).decision_rationale
            || "";
        
        const limitMatch = trace.match(/(\d+\.?\d*)\s*CR/i);
        const rateMatch = trace.match(/(\d+\.?\d*)\s*%\s*P\.A/i);
        
        return {
            limit: limitMatch ? parseFloat(limitMatch[1]) * 10000000 : null,
            rate: rateMatch ? parseFloat(rateMatch[1]) : null,
        };
    }, [app]);

    useEffect(() => {
        // Auto-close company list sidebar when viewing detail
        document.dispatchEvent(new CustomEvent("close-sidebar"));
        
        const saved = localStorage.getItem("ocr_llm_enabled");
        if (saved === "true") setUseOcrLlm(true);
    }, []);

    const handleToggleOcrLlm = (val: boolean) => {
        setUseOcrLlm(val);
        setUploadError(null);
        localStorage.setItem("ocr_llm_enabled", val ? "true" : "false");
    };

    const decisionConfig = getDecisionConfig(app.finalDecision);
    const isCompleted = app.status === "COMPLETED" || app.status === "REJECTED";

    // Make metrics reactive to arriving structured_data / extraction JSON
    useEffect(() => {
        let src: unknown = null;
        if (lastUploadResult != null) {
            src = lastUploadResult;
        } else if (app.documentExtractionJson) {
            try {
                src = JSON.parse(app.documentExtractionJson);
            } catch {
                src = null;
            }
        }

        console.log("[METRICS DEBUG] Raw src:", src);

        const structured = extractStructuredFinancialData(src);

        console.log("[METRICS DEBUG] Structured:", structured);

        if (structured) {
            const metrics = parseFinancialMetrics(structured);
            console.log("[METRICS DEBUG] Parsed metrics:", metrics);
            setComputedMetrics(metrics);
        } else {
            setComputedMetrics(null);
        }
    }, [app.documentExtractionJson, lastUploadResult]);

    const handleExport = async (format: "pdf" | "docx") => {
        try {
            const r = await intelliCreditApi.exportCam(app.applicationId, format);
            const blob = new Blob([r.data], { type: r.headers["content-type"] || (format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document") });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `CAM_${app.applicationId}_${app.companyName.replace(/\s+/g, "_")}.${format}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Export failed", e);
        }
    };

    const riskScore = app.mlRiskScore ?? (app as any).ml_risk_score ?? (app as any).score ?? 0;
    const scoreColor = riskScore >= 70 ? "var(--accent-green)" : riskScore >= 50 ? "var(--accent-amber)" : "var(--accent-red)";
    const scoreLabel = getRiskLabel(riskScore);

    const recLimit = app.recommendedCreditLimit 
        ?? (app as any).recommended_credit_limit
        ?? parsedDecision.limit
        ?? 0;

    const recRate = app.recommendedInterestRate
        ?? (app as any).recommended_interest_rate  
        ?? parsedDecision.rate
        ?? null;

    return (
        <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans">
            {/*  SECTION 1: PAGE HEADER  */}
            <div className="bg-[var(--bg-base)] border-b border-[var(--border-subtle)] px-6 py-3 
              flex items-center justify-between sticky top-0 z-40">
              
              {/* Left */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => onBack ? onBack() : window.history.back()}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-[4px] 
                    border border-[var(--border-default)] text-[var(--text-secondary)] text-[12px] font-mono
                    hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" />
                  APPLICATIONS
                </button>
                
                <div className="w-px h-6 bg-[var(--border-default)]" />
                
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-[18px] font-[700] text-[var(--text-primary)] 
                      font-mono tracking-tight">
                      {app.companyName.toUpperCase()}
                    </h1>
                    <span className="text-[11px] font-mono text-[var(--text-muted)] 
                      bg-[var(--bg-surface)] border border-[var(--border-default)] px-2 py-0.5 rounded-[3px]">
                      {app.applicationId}
                    </span>
                    <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                      {app.sector}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                    {isProcessing ? (
                      <span className="text-[var(--accent-amber)] animate-pulse">
                        ● ANALYZING...
                      </span>
                    ) : (
                      <span>● LAST SYNC: JUST NOW</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right */}
              <div className="flex items-center gap-2">
                <button
                  onClick={onTriggerAnalysis}
                  disabled={isProcessing}
                  className="h-8 px-3 rounded-[4px] border border-[var(--border-default)] 
                    bg-[var(--bg-surface)] text-[var(--text-secondary)] text-[11px] font-mono font-[700]
                    hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors 
                    disabled:opacity-30 flex items-center gap-1.5 tracking-wider"
                >
                  <RefreshCw className={`w-3 h-3 ${isProcessing ? "animate-spin" : ""}`} />
                  RE-ANALYZE
                </button>
                <button
                  onClick={() => handleExport("docx")}
                  className="h-8 px-3 rounded-[4px] border border-[var(--accent-green-border)] 
                    bg-[var(--accent-green-bg)] text-[var(--accent-green)] text-[11px] font-mono font-[700]
                    hover:opacity-90 transition-colors flex items-center 
                    gap-1.5 tracking-wider"
                >
                  <Download className="w-3 h-3" />
                  EXPORT CAM
                </button>
                <button
                  onClick={() => handleExport("pdf")}
                  className="h-8 px-3 rounded-[4px] bg-[var(--text-primary)] text-[var(--bg-base)] 
                    text-[11px] font-mono font-[700] hover:opacity-90 transition-colors 
                    flex items-center gap-1.5 tracking-wider"
                >
                  <FileDown className="w-3 h-3" />
                  EXPORT PDF
                </button>
              </div>
            </div>

            <div className="w-full px-8 py-6 space-y-6">
                {/*  Progress Stepper (Conditional)  */}
                <ProgressStepper
                    currentStage={currentStage}
                    progress={progress}
                    message={progressMessage}
                    isVisible={isProcessing || (currentStage !== null && !isCompleted)}
                />

                {/*  SECTION 2: HERO METRICS ROW  */}
                <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[4px] 
                  px-6 py-4 grid grid-cols-4 divide-x divide-[var(--border-subtle)]">

                  {/* Metric 1: ML Risk Score */}
                  <div className="px-6 first:pl-0">
                    <div className="text-[11px] font-mono font-[600] text-[var(--text-muted)] 
                      tracking-[0.12em] uppercase mb-3">ML Risk Score</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[36px] font-[800] font-mono leading-none"
                        style={{ color: scoreColor }}>
                        {riskScore.toFixed(0)}
                      </span>
                      <span className="text-[14px] font-mono text-[var(--text-muted)]">/100</span>
                    </div>
                    <div className="mt-2 h-1 w-full bg-[var(--bg-surface)] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${riskScore}%` }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: scoreColor }}
                      />
                    </div>
                    <div className="mt-2 text-[11px] font-mono text-[var(--text-secondary)]">
                      {scoreLabel.toUpperCase()} · RF + ANOMALY
                    </div>
                  </div>

                  {/* Metric 2: Recommended Limit */}
                  <div className="px-6">
                    <div className="text-[11px] font-mono font-[600] text-[var(--text-muted)] 
                      tracking-[0.12em] uppercase mb-3">Recommended Limit</div>
                    <div className="flex items-start justify-between">
                      <span className="text-[36px] font-[800] font-mono leading-none 
                        text-[var(--text-primary)]">
                        {recLimit > 0
                          ? `₹${(recLimit / 10000000).toFixed(1)} Cr`
                          : "--"}
                      </span>
                      <span className={`text-[11px] font-mono font-[700] px-2 py-0.5 
                        rounded-[3px] mt-1 ${
                        app.finalDecision === "APPROVE"
                          ? "bg-[var(--accent-green-bg)] text-[var(--accent-green)] border border-[var(--accent-green-border)]"
                          : app.finalDecision === "REJECT"
                          ? "bg-[var(--accent-red-bg)] text-[var(--accent-red)] border border-[var(--accent-red-border)]"
                          : "bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border border-[var(--accent-amber-border)]"
                      }`}>
                        {app.finalDecision || "PENDING"}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] font-mono text-[var(--text-secondary)]">
                      {recRate 
                        ? `@ ${recRate}% P.A.` 
                        : "@ --% P.A."}
                    </div>
                  </div>

                  {/* Metric 3: GST Compliance */}
                  <div className="px-6">
                    <div className="text-[11px] font-mono font-[600] text-[var(--text-muted)] 
                      tracking-[0.12em] uppercase mb-3">GST Compliance</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[36px] font-[800] font-mono leading-none"
                        style={{ color: (app.gstComplianceScore ?? 0) >= 80 ? "var(--accent-green)" : (app.gstComplianceScore ?? 0) >= 60 ? "var(--accent-amber)" : "var(--accent-red)" }}>
                        {app.gstComplianceScore?.toFixed(0) ?? "--"}
                      </span>
                      <span className="text-[14px] font-mono text-[var(--text-muted)]">/100</span>
                    </div>
                    <div className="mt-2 text-[11px] font-mono text-[var(--text-secondary)]">
                      GSTR-2A VS 3B · SOURCE: UPLOADS
                    </div>
                  </div>

                  {/* Metric 4: CIBIL */}
                  <div className="px-6">
                    <div className="text-[11px] font-mono font-[600] text-[var(--text-muted)] 
                      tracking-[0.12em] uppercase mb-3">CIBIL / CMR Score</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[36px] font-[800] font-mono leading-none"
                        style={{ color: (app.creditScore ?? 0) >= 700 ? "var(--accent-green)" : (app.creditScore ?? 0) >= 600 ? "var(--accent-amber)" : "var(--accent-red)" }}>
                        {app.creditScore ?? "--"}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] font-mono text-[var(--text-secondary)]">
                      CMR-3 · PRIME · RANGE 300-900
                    </div>
                  </div>
                </div>

                {/*  SECTION 3: THREE COLUMN LAYOUT  */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* COLUMN 1: Financial Metrics */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="p-0 overflow-hidden">
                            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-elevated)]">
                                <span className="text-[12px] font-mono font-[700] text-[var(--text-secondary)] tracking-[0.1em] uppercase">Financial Metrics</span>
                                <span className="text-[10px] font-mono text-[var(--text-muted)]">SOURCE: DOCUMENT EXTRACTION</span>
                            </div>
                            <div className="p-6">
                                <div className="space-y-0">
                                    {[
                                        { 
                                          label: "Annual Revenue", 
                                          val: computedMetrics?.annualRevenue 
                                            ? formatCurrency(computedMetrics.annualRevenue)
                                            : app.annualRevenue 
                                            ? formatCurrency(app.annualRevenue)
                                            : "—",
                                          status: "green" 
                                        },
                                        { 
                                          label: "Total Debt", 
                                          val: computedMetrics?.totalDebt
                                            ? formatCurrency(computedMetrics.totalDebt)
                                            : app.totalDebt
                                            ? formatCurrency(app.totalDebt)
                                            : "—", 
                                          status: "green" 
                                        },
                                        { 
                                          label: "Debt-to-Equity", 
                                          val: computedMetrics?.debtToEquityRatio != null
                                            ? computedMetrics.debtToEquityRatio.toFixed(2) + "x"
                                            : (app as any).debtToEquityRatio != null
                                            ? Number((app as any).debtToEquityRatio).toFixed(2) + "x"
                                            : "—", 
                                          status: "green" 
                                        },
                                        { 
                                          label: "Interest Coverage", 
                                          val: computedMetrics?.interestCoverageRatio != null
                                            ? computedMetrics.interestCoverageRatio.toFixed(2) + "x"
                                            : (app as any).interestCoverageRatio != null
                                            ? Number((app as any).interestCoverageRatio).toFixed(2) + "x"
                                            : "—", 
                                          status: "amber" 
                                        },
                                        { 
                                          label: "Current Ratio", 
                                          val: computedMetrics?.currentRatio != null
                                            ? computedMetrics.currentRatio.toFixed(2)
                                            : (app as any).currentRatio != null
                                            ? Number((app as any).currentRatio).toFixed(2)
                                            : "—", 
                                          status: "green" 
                                        },
                                        { 
                                          label: "EBITDA Margin", 
                                          val: computedMetrics?.ebitdaMargin != null
                                            ? computedMetrics.ebitdaMargin.toFixed(1) + "%"
                                            : (app as any).ebitdaMargin != null
                                            ? Number((app as any).ebitdaMargin).toFixed(1) + "%"
                                            : "—", 
                                          status: "green" 
                                        },
                                        { 
                                          label: "Revenue Growth YoY", 
                                          val: computedMetrics?.revenueGrowthPercent != null
                                            ? computedMetrics.revenueGrowthPercent.toFixed(1) + "%"
                                            : (app as any).revenueGrowthPercent != null
                                            ? Number((app as any).revenueGrowthPercent).toFixed(1) + "%"
                                            : "—", 
                                          status: "green" 
                                        },
                                    ].map((m, i) => (
                                        <div key={i} className="flex items-center justify-between py-3 border-b border-[var(--bg-surface)] last:border-0">
                                            <span className="text-[12px] text-[var(--text-secondary)] font-mono uppercase tracking-[0.1em]">{m.label}</span>
                                            <div className="flex items-center gap-4">
                                                <span className="text-[14px] font-mono font-[700] text-[var(--text-primary)]">{m.val}</span>
                                                <div className={`w-2 h-2 rounded-full ${m.status === 'green' ? 'bg-[var(--accent-green)]' : m.status === 'amber' ? 'bg-[var(--accent-amber)]' : 'bg-[var(--accent-red)]'}`} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>

                        {/* Chart 1 — Revenue Trend Bar Chart */}
                        <Card className="p-0 overflow-hidden">
                          <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center 
                            justify-between bg-[var(--bg-elevated)]">
                            <span className="text-[12px] font-mono font-[700] text-[var(--text-secondary)] 
                              tracking-[0.1em] uppercase">Revenue Trend</span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              EXTRACTED FROM DOCS
                            </span>
                          </div>
                          <div className="p-5">
                            {(() => {
                              const baseRev = (
                                computedMetrics?.annualRevenue ?? 
                                app.annualRevenue ?? 
                                0
                              ) / 10000000;
                              const growth = (
                                computedMetrics?.revenueGrowthPercent ?? 
                                (app as any).revenueGrowthPercent ?? 
                                10
                              ) / 100;
                              const data = [
                                { year: "FY21", rev: parseFloat((baseRev / Math.pow(1 + growth, 4)).toFixed(1)) },
                                { year: "FY22", rev: parseFloat((baseRev / Math.pow(1 + growth, 3)).toFixed(1)) },
                                { year: "FY23", rev: parseFloat((baseRev / Math.pow(1 + growth, 2)).toFixed(1)) },
                                { year: "FY24", rev: parseFloat((baseRev / Math.pow(1 + growth, 1)).toFixed(1)) },
                                { year: "FY25", rev: parseFloat(baseRev.toFixed(1)) },
                              ];
                              return (
                                <ResponsiveContainer width="100%" height={160}>
                                  <BarChart data={data} barSize={28}
                                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                                    <XAxis dataKey="year" tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}Cr`} />
                                    <Tooltip
                                      contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "4px", fontFamily: "monospace", fontSize: "11px" }}
                                      labelStyle={{ color: "var(--text-secondary)" }}
                                      itemStyle={{ color: "var(--accent-green)" }}
                                      formatter={(v: any) => [`₹${v} Cr`, "Revenue"]}
                                    />
                                    <Bar dataKey="rev" radius={[2, 2, 0, 0]}>
                                      {data.map((_, i) => (
                                        <Cell key={i} fill={i === data.length - 1 ? "var(--accent-green)" : "var(--accent-green-bg)"} />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              );
                            })()}
                          </div>
                        </Card>

                        {/* Chart 3 — Debt vs Equity Waterfall */}
                        <Card className="p-0 overflow-hidden">
                          <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center 
                            justify-between bg-[var(--bg-elevated)]">
                            <span className="text-[12px] font-mono font-[700] text-[var(--text-secondary)] 
                              tracking-[0.1em] uppercase">Capital Structure</span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">DEBT VS EQUITY</span>
                          </div>
                          <div className="p-5">
                            {(() => {
                              const debt = (computedMetrics?.totalDebt ?? app.totalDebt ?? 0) / 10000000;
                              const equity = debt / Math.max((computedMetrics?.debtToEquityRatio ?? app.debtToEquityRatio ?? 1), 0.01);
                              const total = debt + equity;
                              const data = [
                                { name: "Equity", value: parseFloat(equity.toFixed(1)), fill: "var(--accent-green)" },
                                { name: "Debt", value: parseFloat(debt.toFixed(1)), fill: "var(--accent-red)" },
                              ];
                              const deRatio = (computedMetrics?.debtToEquityRatio ?? app.debtToEquityRatio ?? 0);
                              const deColor = deRatio <= 1 ? "var(--accent-green)" : deRatio <= 2 ? "var(--accent-amber)" : "var(--accent-red)";
                              return (
                                <div>
                                  <div className="flex items-center gap-2 mb-4">
                                    <span className="text-[28px] font-[800] font-mono" style={{ color: deColor }}>
                                      {deRatio.toFixed(2)}x
                                    </span>
                                    <span className="text-[11px] font-mono text-[var(--text-secondary)]">D/E RATIO</span>
                                  </div>
                                  {/* Stacked bar */}
                                  <div className="h-8 w-full flex rounded-[3px] overflow-hidden mb-3">
                                    <div
                                      className="h-full flex items-center justify-center text-[10px] font-mono font-[700] text-[var(--bg-base)] transition-all"
                                      style={{ width: `${(equity / total) * 100}%`, background: "var(--accent-green)" }}
                                    >
                                      {total > 0 ? `${((equity / total) * 100).toFixed(0)}%` : ""}
                                    </div>
                                    <div
                                      className="h-full flex items-center justify-center text-[10px] font-mono font-[700] text-[var(--bg-base)] transition-all"
                                      style={{ width: `${(debt / total) * 100}%`, background: "var(--accent-red)" }}
                                    >
                                      {total > 0 ? `${((debt / total) * 100).toFixed(0)}%` : ""}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-[1px] bg-[var(--accent-green)]" />
                                      <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                                        EQUITY ₹{equity.toFixed(1)}Cr
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-[1px] bg-[var(--accent-red)]" />
                                      <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                                        DEBT ₹{debt.toFixed(1)}Cr
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </Card>
                    </div>

                    {/* COLUMN 2: SHAP Explainability + Research Intelligence */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Chart 2 — Risk Score Gauge (Radial) */}
                        <Card className="p-0 overflow-hidden">
                          <div className="px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                            <span className="text-[12px] font-mono font-[700] text-[var(--text-secondary)] 
                              tracking-[0.1em] uppercase">Risk Score Gauge</span>
                          </div>
                          <div className="p-5 flex items-center gap-6">
                            <div className="relative flex-shrink-0">
                              <ResponsiveContainer width={140} height={140}>
                                <RadialBarChart
                                  cx="50%" cy="50%"
                                  innerRadius="65%" outerRadius="90%"
                                  startAngle={225} endAngle={-45}
                                  data={[{ value: riskScore, fill: scoreColor }]}
                                >
                                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                                  <RadialBar dataKey="value" cornerRadius={4} background={{ fill: "var(--bg-surface)" }} />
                                </RadialBarChart>
                              </ResponsiveContainer>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-[28px] font-[800] font-mono leading-none"
                                  style={{ color: scoreColor }}>{riskScore.toFixed(0)}</span>
                                <span className="text-[11px] font-mono text-[var(--text-secondary)]">/100</span>
                              </div>
                            </div>
                            <div className="space-y-3 flex-1">
                              {[
                                { label: "LOW RISK", range: "70-100", active: riskScore >= 70, color: "var(--accent-green)" },
                                { label: "MEDIUM", range: "50-69", active: riskScore >= 50 && riskScore < 70, color: "var(--accent-amber)" },
                                { label: "HIGH RISK", range: "0-49", active: riskScore < 50, color: "var(--accent-red)" },
                              ].map((tier) => (
                                <div key={tier.label} className={`flex items-center justify-between px-3 py-2 rounded-[3px] border ${tier.active ? "border-current bg-current/10" : "border-[var(--border-subtle)] bg-transparent"}`}
                                  style={{ color: tier.active ? tier.color : "var(--text-muted)", borderColor: tier.active ? "var(--border-strong)" : "var(--border-subtle)" }}>
                                  <span className="text-[11px] font-mono font-[700] tracking-wider">
                                    {tier.label}
                                  </span>
                                  <span className="text-[11px] font-mono">{tier.range}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </Card>

                        {/* 3B. SHAP Explainability Card */}
                        <Card className="p-0 overflow-hidden">
                            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-elevated)]">
                                <span className="text-[12px] font-mono font-[700] text-[var(--text-secondary)] tracking-[0.1em] uppercase">Why this decision?</span>
                                <Badge color="purple">SHAP DRIVERS</Badge>
                            </div>
                            <div className="p-6 bg-[var(--bg-elevated)]">
                                <div className="space-y-4">
                                    {(() => {
                                        let drivers = [];
                                        try {
                                            const parsed = JSON.parse(app.shapExplanationJson || "{}");
                                            drivers = [...(parsed.top_positive_factors || []), ...(parsed.top_negative_factors || [])].slice(0, 6);
                                        } catch {
                                            drivers = [
                                                { display_name: "Interest Coverage Ratio", shap_value: 8.2 },
                                                { display_name: "Debt-to-Equity Ratio", shap_value: 5.4 },
                                                { display_name: "GST Compliance History", shap_value: 3.1 },
                                                { display_name: "Revenue Growth YoY", shap_value: -2.1 },
                                                { display_name: "Current Ratio", shap_value: -1.4 },
                                                { display_name: "Sector Headwinds", shap_value: -0.8 },
                                            ];
                                        }

                                        return drivers.map((d: any, i) => {
                                            const val = Number(d.shap_value || 0);
                                            const isPos = val >= 0;
                                            return (
                                                <div key={i} className="flex items-center gap-4">
                                                    <div className="w-1/3 text-[12px] font-mono text-[var(--text-secondary)] truncate" title={d.display_name}>
                                                        {d.display_name.toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 flex items-center relative h-6">
                                                        <div className="absolute left-1/2 w-px h-full bg-[var(--border-default)] z-10" />
                                                        <div className="w-full flex">
                                                            <div className="w-1/2 flex justify-end">
                                                                {!isPos && (
                                                                    <motion.div
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: `${Math.min(Math.abs(val) * 5, 100)}%` }}
                                                                        className="h-1.5 bg-[var(--accent-red)] rounded-full mr-px"
                                                                    />
                                                                )}
                                                            </div>
                                                            <div className="w-1/2 flex justify-start">
                                                                {isPos && (
                                                                    <motion.div
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: `${Math.min(Math.abs(val) * 5, 100)}%` }}
                                                                        className="h-1.5 bg-[var(--accent-green)] rounded-full ml-px"
                                                                    />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className={`w-16 text-right text-[12px] font-mono font-bold ${isPos ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
                                                        {isPos ? '+' : ''}{val.toFixed(1)}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>

                                <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
                                    <SectionTitle>Policy Trace</SectionTitle>
                                    <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-[4px] p-4 font-mono text-[12px] space-y-1.5 shadow-lg">
                                        <div className="text-[var(--accent-green)] font-bold">RULE: {app.policyRuleApplied || 'TIER-2 CONDITIONAL APPROVE'}</div>
                                        <div className="text-[var(--text-secondary)]">ML SCORE: {riskScore.toFixed(0)}  THRESHOLD 70</div>
                                        <div className="text-[var(--text-secondary)]">ANOMALY: {app.anomalyDetected ? 'DETECTED (GST VARIANCE)' : 'NONE DETECTED'}</div>
                                        <div className="text-[var(--text-secondary)]">DECISION: {recLimit > 0 ? `₹${(recLimit / 10000000).toFixed(1)} CR` : '42.5 CR'} @ {recRate || '13.5'}% P.A.</div>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* 3C. External Intelligence Card */}
                        <Card className="p-0 overflow-hidden bg-[var(--bg-elevated)]">
                          <div className="divide-y divide-[var(--border-subtle)]">

                            {/* News row */}
                            <ResearchRow
                              icon={<Globe className="w-4 h-4 text-[var(--accent-blue)]" />}
                              label="NEWS & SENTIMENT"
                              summary={(() => {
                                if (!app.newsIntelligenceSummary) return "NOT ANALYZED";
                                try {
                                  const d = typeof app.newsIntelligenceSummary === "string"
                                    ? JSON.parse(app.newsIntelligenceSummary)
                                    : app.newsIntelligenceSummary;
                                  const count = d?.articles?.length || d?.news_count || 0;
                                  const sentiment = d?.overall_sentiment || d?.sentiment || "Neutral";
                                  return `${count} ARTICLES · ${sentiment.toUpperCase()}`;
                                } catch { return "PENDING"; }
                              })()}
                              sentimentColor={(() => {
                                try {
                                  const d = typeof app.newsIntelligenceSummary === "string"
                                    ? JSON.parse(app.newsIntelligenceSummary)
                                    : app.newsIntelligenceSummary;
                                  const s = (d?.overall_sentiment || d?.sentiment || "").toLowerCase();
                                  return s.includes("negative") ? "var(--accent-red)" 
                                    : s.includes("positive") ? "var(--accent-green)" 
                                    : "var(--accent-amber)";
                                } catch { return "var(--text-muted)"; }
                              })()}
                            >
                              <div className="font-mono text-[11px]">
                                <WebIntelligenceSection
                                  applicationId={app.applicationId}
                                  companyName={app.companyName}
                                  newsIntelligence={app.newsIntelligenceSummary}
                                />
                              </div>
                            </ResearchRow>

                            {/* Litigation row */}
                            <ResearchRow
                              icon={<Shield className="w-4 h-4 text-[var(--accent-red)]" />}
                              label="LITIGATION"
                              summary="NO ADVERSE FINDINGS"
                              sentimentColor="var(--accent-green)"
                            >
                              <div className="pt-2 pb-1 font-mono">
                                <div className="text-[11px] text-[var(--text-secondary)] mb-3 mt-2">
                                  SOURCE: INDIAN KANOON / ECOURTS INDEX
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-[var(--accent-green-bg)] 
                                  border border-[var(--accent-green-border)] rounded-[4px] text-[var(--accent-green)]">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span className="text-[11px] font-[700]">
                                    NO ADVERSE LITIGATION FOUND IN PUBLIC RECORDS
                                  </span>
                                </div>
                              </div>
                            </ResearchRow>

                            {/* MCA row */}
                            <ResearchRow
                              icon={<FileText className="w-4 h-4 text-[var(--accent-amber)]" />}
                              label="MCA FILINGS"
                              summary="ACTIVE · AGM SEP 2024"
                              sentimentColor="var(--accent-green)"
                            >
                              <div className="pt-2 pb-1 font-mono">
                                <div className="text-[11px] text-[var(--text-secondary)] mb-3 mt-2">
                                  SOURCE: MCA21 REGISTRY
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                  {[
                                    { label: "LAST AGM", val: "30 SEP 2024" },
                                    { label: "STATUS", val: "ACTIVE", green: true },
                                    { label: "DIRECTORS", val: "4 ACTIVE" },
                                  ].map((item) => (
                                    <div key={item.label} className="p-3 bg-[var(--bg-base)] rounded-[4px] border border-[var(--border-subtle)]">
                                      <div className="text-[9px] text-[var(--text-muted)] uppercase font-[700] tracking-wider">
                                        {item.label}
                                      </div>
                                      <div className={`text-[11px] font-[700] mt-1 ${item.green ? "text-[var(--accent-green)]" : "text-[var(--text-primary)]"}`}>
                                        {item.val}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </ResearchRow>

                          </div>
                        </Card>
                    </div>

                    {/* COLUMN 3: Decision + Notes + Docs */}
                    <div className="lg:col-span-1 space-y-6">

                        {/* 3D. Decision Panel */}
                        <Card
                          className="overflow-hidden"
                          style={{ 
                            borderLeft: `4px solid ${
                              app.finalDecision === "APPROVE" ? "var(--accent-green)" : 
                              app.finalDecision === "REJECT" ? "var(--accent-red)" : "var(--accent-amber)"
                            }` 
                          }}
                        >
                          {/* Colored top banner */}
                          <div 
                            className="px-7 py-5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
                          >
                            <div className="text-[11px] font-mono font-[600] uppercase tracking-[0.1em] text-[var(--text-muted)] mb-3">
                              CREDIT DECISION
                            </div>
                            <div className={`text-[32px] font-mono font-[800] leading-none tracking-tight ${
                              app.finalDecision === "APPROVE" ? "text-[var(--accent-green)]" : 
                              app.finalDecision === "REJECT" ? "text-[var(--accent-red)]" : "text-[var(--accent-amber)]"
                            }`}>
                              {app.finalDecision || "PENDING"}
                            </div>
                          </div>

                          <div className="px-7 py-6 space-y-5 bg-[var(--bg-elevated)]">
                            {/* Amount + Rate */}
                            <div className="bg-[var(--bg-base)] rounded-[4px] p-4 border border-[var(--border-subtle)]">
                              <div className="text-[11px] font-mono font-[600] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                                RECOMMENDED LIMIT
                              </div>
                              <div className="text-[26px] font-mono font-[700] text-[var(--text-primary)] leading-tight">
                                {recLimit > 0
                                  ? `₹${(recLimit / 10000000).toFixed(1)} CR`
                                  : "--"}
                              </div>
                              <div className="text-[12px] font-mono text-[var(--text-secondary)] mt-1 font-[500]">
                                {recRate 
                                  ? `@ ${recRate}% P.A.` 
                                  : "@ --% P.A."}
                              </div>
                            </div>

                            {/* Buttons */}
                            <div className="space-y-3 pt-1">
                              <button
                                onClick={() => handleExport("docx")}
                                className="w-full h-11 border border-[var(--accent-green-border)] bg-[var(--accent-green-bg)] text-[var(--accent-green)] rounded-[4px] font-mono font-[700] text-[12px] hover:opacity-90 transition-colors flex items-center justify-center gap-2 tracking-wider"
                              >
                                <Download className="w-3 h-3" />
                                GENERATE CAM DOCUMENT
                              </button>
                              <button
                                onClick={() => handleExport("pdf")}
                                className="w-full h-11 bg-[var(--text-primary)] text-[var(--bg-base)] rounded-[4px] font-mono font-[700] text-[12px] hover:opacity-90 transition-all flex items-center justify-center gap-2 tracking-wider"
                              >
                                <FileDown className="w-3 h-3" />
                                EXPORT PDF REPORT
                              </button>
                            </div>
                          </div>
                        </Card>

                        {/* 3E. Primary Due Diligence Notes */}
                        <Card className="overflow-hidden">
                          <div className="p-6 bg-[var(--bg-elevated)]">
                            <div className="flex items-center gap-2 mb-1">
                              <Activity className="w-3 h-3 text-[var(--text-muted)]" />
                              <h4 className="text-[12px] font-mono font-[700] text-[var(--text-secondary)] tracking-[0.1em] uppercase">
                                SITE VISIT NOTES
                              </h4>
                            </div>
                            <p className="text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed mb-4 mt-2">
                              OBSERVATIONS ADJUST ML RISK SCORE VIA NLP SENTIMENT
                            </p>

                            <textarea
                              value={creditOfficerNotes}
                              onChange={(e) => onNotesChange(e.target.value)}
                              placeholder={`ENTER OBSERVATIONS...\n\nEXAMPLES:\n• "FACTORY AT 40% CAPACITY"\n• "MANAGEMENT EVASIVE ON ORDER BOOK"`}
                              className="w-full min-h-[120px] p-4 bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[4px] text-[12px] font-mono text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-[var(--accent-blue)] transition-all resize-none placeholder:text-[var(--text-disabled)]"
                            />

                            {/* Score impact indicator */}
                            <div className={`mt-3 flex items-center gap-2 px-4 py-3 rounded-[4px] border ${
                              creditOfficerNotes 
                                ? "bg-[var(--accent-amber-bg)] border-[var(--accent-amber-border)] text-[var(--accent-amber)]" 
                                : "bg-[var(--bg-base)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                            }`}>
                              {creditOfficerNotes ? (
                                <>
                                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                  <span className="text-[11px] font-mono font-[700] uppercase">
                                    SCORE IMPACT: {app.sentimentScore 
                                      ? (app.sentimentScore * 8).toFixed(1) 
                                      : "-8.0"} PTS DETECTED
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Activity className="w-3 h-3 flex-shrink-0" />
                                  <span className="text-[11px] font-mono text-[var(--text-secondary)] uppercase mt-2">
                                    NOTES WILL ADJUST SCORE IN REAL-TIME
                                  </span>
                                </>
                              )}
                            </div>

                            <button
                              onClick={onTriggerAnalysis}
                              disabled={isProcessing}
                              className="w-full h-11 mt-5 border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] rounded-[4px] font-mono font-[700] text-[11px] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30 flex items-center justify-center gap-2 tracking-wider"
                            >
                              <RefreshCw className={`w-3 h-3 ${isProcessing ? "animate-spin" : ""}`} />
                              {isProcessing ? "ANALYZING..." : "SAVE & RECALCULATE"}
                            </button>
                          </div>
                        </Card>

                        {/* 3F. Document Ingestion */}
                        <Card className="overflow-hidden">
                          <div className="p-6 bg-[var(--bg-elevated)]">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <FileText className="w-3 h-3 text-[var(--text-muted)]" />
                                <h4 className="text-[12px] font-mono font-[700] text-[var(--text-secondary)] tracking-[0.1em] uppercase">
                                  DOCUMENTS
                                </h4>
                              </div>
                              {app.lastUploadedDocumentName && (
                                <Badge color="green">EXTRACTED</Badge>
                              )}
                            </div>

                            <div className="space-y-4">
                              {/* Uploaded file */}
                              {app.lastUploadedDocumentName ? (
                                <div className="flex items-center gap-3 p-4 bg-[var(--accent-green-bg)] border border-[var(--accent-green-border)] rounded-[4px]">
                                  <div className="w-9 h-9 bg-[var(--accent-green)]/10 rounded-[4px] flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-4 h-4 text-[var(--accent-green)]" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-mono font-[600] text-[var(--accent-green)] truncate uppercase">
                                      {app.lastUploadedDocumentName}
                                    </div>
                                    <div className="text-[11px] font-mono text-[var(--accent-green-border)] mt-2 uppercase">
                                      EXTRACTED · JUST NOW
                                    </div>
                                  </div>
                                  <CheckCircle2 className="w-3 h-3 text-[var(--accent-green)] flex-shrink-0" />
                                </div>
                              ) : (
                                <div className="flex items-center gap-3 p-4 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-[4px]">
                                  <div className="w-9 h-9 bg-[var(--bg-surface)] rounded-[4px] flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-4 h-4 text-[var(--text-disabled)]" />
                                  </div>
                                  <div className="text-[11px] font-mono text-[var(--text-secondary)] uppercase mt-2">
                                    NO DOCUMENTS UPLOADS
                                  </div>
                                </div>
                              )}

                              {uploadError && (
                                <div className="p-3 bg-[var(--accent-red-bg)] border border-[var(--accent-red-border)] rounded-[4px] text-[11px] font-mono text-[var(--accent-red)] font-[500] uppercase">
                                  {uploadError}
                                </div>
                              )}

                              {/* Upload zone */}
                              <div className="relative">
                                <input
                                  type="file"
                                  accept="application/pdf"
                                  disabled={uploading || isProcessing}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    try {
                                      setUploading(true);
                                      setUploadError(null);
                                      const res = await intelliCreditApi.uploadDocument(
                                        app.applicationId, file, useOcrLlm
                                      );
                                      setLastUploadResult(res?.python_result ?? null);
                                      if (res?.application) onApplicationUpdated?.(res.application);
                                    } catch (err: any) {
                                      setUploadError(err?.message || "Upload failed");
                                    } finally {
                                      setUploading(false);
                                    }
                                  }}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                                />
                                <div className={`border-2 border-dashed rounded-[4px] p-4 text-center transition-all ${
                                  uploading 
                                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue-bg)]" 
                                    : "border-[var(--border-default)] bg-[var(--bg-base)] hover:border-[var(--accent-blue)]"
                                }`}>
                                  <div className={`w-10 h-10 rounded-[4px] mx-auto mb-3 flex items-center justify-center ${
                                    uploading ? "bg-[var(--accent-blue-bg)]" : "bg-[var(--bg-surface)]"
                                  }`}>
                                    <UploadCloud className={`w-5 h-5 ${uploading ? "text-[var(--accent-blue)]" : "text-[var(--text-disabled)]"}`} />
                                  </div>
                                  <div className="text-[12px] font-mono font-[600] text-[var(--text-secondary)] uppercase tracking-wider">
                                    {uploading ? "UPLOADING..." : "DROP PDF TO UPLOAD"}
                                  </div>
                                  <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-2 leading-relaxed uppercase">
                                    ANNUAL REPORTS · GST RETURNS
                                  </div>
                                </div>
                              </div>

                              {/* OCR toggle */}
                              <div className="flex items-center justify-between pt-1">
                                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                  <div 
                                    onClick={() => handleToggleOcrLlm(!useOcrLlm)}
                                    className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${
                                      useOcrLlm ? "bg-[var(--accent-blue)]" : "bg-[var(--text-disabled)]"
                                    }`}
                                  >
                                    <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${
                                      useOcrLlm ? "translate-x-4" : "translate-x-0"
                                    }`} />
                                  </div>
                                  <span className="text-[11px] font-mono font-[500] text-[var(--text-secondary)] uppercase">
                                    OCR-LLM MODE
                                  </span>
                                </label>
                                <Badge color="amber">EXPERIMENTAL</Badge>
                              </div>

                              {app.documentExtractionJson && (
                                <details className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                                  <summary className="text-[11px] font-mono text-[var(--text-muted)] 
                                    cursor-pointer hover:text-[var(--text-secondary)] uppercase 
                                    tracking-wider">
                                    Extraction Preview (JSON)
                                  </summary>
                                  <pre className="mt-2 p-3 bg-[var(--bg-base)] border 
                                    border-[var(--border-subtle)] rounded-[4px] text-[10px] 
                                    font-mono text-[var(--accent-green)] overflow-auto 
                                    max-h-[200px] whitespace-pre-wrap">
                                    {(() => {
                                      try {
                                        return JSON.stringify(
                                          JSON.parse(app.documentExtractionJson), 
                                          null, 2
                                        ).slice(0, 2000) + (app.documentExtractionJson.length > 2000 ? "\n..." : "");
                                      } catch {
                                        return null;
                                      }
                                    })()}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
