"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    TrendingUp,
    TrendingDown,
    Clock,
    Building2,
    ChevronRight,
} from "lucide-react";
import type { LoanApplication } from "@/lib/types";
import {
    formatCurrency,
    getRiskColor,
    getRiskLabel,
    getDecisionConfig,
    getStatusConfig,
} from "@/lib/types";

interface ApplicationTableProps {
    applications: LoanApplication[];
    onSelect: (applicationId: string) => void;
    selectedId?: string;
    loading?: boolean;
    isCompact?: boolean;
}

const SECTOR_ICONS: Record<string, string> = {
    Technology: "💻",
    Fintech: "💳",
    Manufacturing: "🏭",
    Trading: "📦",
    Auto: "🚗",
    Healthcare: "🏥",
    Retail: "🛒",
};

function getSectorIcon(sector: string) {
    const key = Object.keys(SECTOR_ICONS).find((k) =>
        sector.toLowerCase().includes(k.toLowerCase())
    );
    return key ? SECTOR_ICONS[key] : "🏢";
}

function SkeletonRow() {
    return (
        <tr className="border-b border-[#F0EFEB]">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                <td key={i} className="px-6 py-4">
                    <div className="bg-[#F0EFEB] h-[16px] rounded-[4px] w-full animate-pulse" style={{ width: `${40 + Math.random() * 50}%` }} />
                </td>
            ))}
        </tr>
    );
}

export default function ApplicationTable({
    applications,
    onSelect,
    selectedId,
    loading = false,
    isCompact = false,
}: ApplicationTableProps) {
    if (!loading && applications.length === 0) {
        return (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[4px] p-12 flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-12 h-12 bg-[var(--bg-base)] rounded-full flex items-center justify-center border border-[var(--border-subtle)]">
                    <Building2 className="w-6 h-6 text-[var(--text-disabled)]" />
                </div>
                <div>
                    <h3 className="text-[16px] font-[700] text-[var(--text-primary)] font-mono uppercase tracking-tight">No Applications Found</h3>
                    <p className="text-[12px] text-[var(--text-muted)] mt-2 max-w-[280px] font-mono uppercase">
                        NO CREDIT APPLICATIONS IN SYSTEM. USE CREATE OR LOAD DEMO.
                    </p>
                </div>
            </div>
        );
    }
    return (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[4px] overflow-hidden">
            <div className="px-6 py-6 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[var(--text-secondary)]" />
                        <h2 className="text-[14px] font-[700] text-[var(--text-primary)] font-mono uppercase tracking-tight">
                            Credit Ingestion Queue
                        </h2>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] font-mono uppercase">
                        REAL-TIME UNDERWRITING · HYBRID ML SCORING · RBI COMPLIANT
                    </p>
                </div>
                <div className="bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--text-secondary)] text-[10px] font-mono font-medium px-3 py-1 rounded-[3px] uppercase tracking-wider">
                    {applications.length} APPS TOTAL
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-[var(--bg-base)] border-b border-[var(--border-subtle)]">
                            {["Company", "Sector", "Revenue", "D/E Ratio", "GST Score", "ML Risk Score", "Decision", "Status", ""].map((h, i) => (
                                <th key={h} className={`px-6 py-3 text-left text-[10px] font-mono font-[700] text-[var(--text-muted)] uppercase tracking-[0.15em] ${isCompact && i > 0 && i < 7 && h !== "ML Risk Score" ? "hidden" : ""}`}>
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading
                            ? [1, 2, 3].map((i) => <SkeletonRow key={i} />)
                            : applications.map((app, idx) => {
                                const isSelected = app.applicationId === selectedId;

                                // GST Color logic
                                const getGstColor = (score: number) => {
                                    if (score >= 80) return "var(--accent-green)";
                                    if (score >= 60) return "var(--accent-amber)";
                                    return "var(--accent-red)";
                                };

                                // ML Risk Color logic
                                const getRiskColorHex = (score: number) => {
                                    if (score >= 70) return "var(--accent-green)";
                                    if (score >= 50) return "var(--accent-amber)";
                                    return "var(--accent-red)";
                                };

                                // Status logic
                                const statusMap: Record<string, { dot: string; text: string; bg: string; border: string; label: string }> = {
                                    PROCESSING: { dot: "var(--accent-amber)", text: "var(--accent-amber)", bg: "var(--accent-amber-bg)", border: "var(--accent-amber-border)", label: "ANALYZING" },
                                    PENDING: { dot: "var(--text-muted)", text: "var(--text-muted)", bg: "var(--bg-base)", border: "var(--border-default)", label: "PENDING" },
                                    APPROVED: { dot: "var(--accent-green)", text: "var(--accent-green)", bg: "var(--accent-green-bg)", border: "var(--accent-green-border)", label: "APPROVED" },
                                    REJECTED: { dot: "var(--accent-red)", text: "var(--accent-red)", bg: "var(--accent-red-bg)", border: "var(--accent-red-border)", label: "REJECTED" },
                                };
                                const statusInfo = statusMap[app.status] || statusMap.PENDING;

                                // Decision logic
                                const decisionMap: Record<string, { color: string; icon: string; label: string }> = {
                                    APPROVE: { color: "var(--accent-green)", icon: "●", label: "APPROVE" },
                                    REJECT: { color: "var(--accent-red)", icon: "●", label: "REJECT" },
                                };
                                const decisionInfo = (app.finalDecision && decisionMap[app.finalDecision]) || { color: "var(--text-muted)", icon: "○", label: "PENDING" };

                                return (
                                    <motion.tr
                                        key={app.applicationId}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: idx * 0.02 }}
                                        onClick={() => onSelect(app.applicationId)}
                                        className={`h-[52px] border-b border-[var(--border-subtle)] cursor-pointer transition-colors duration-[100ms] ${isSelected ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-hover)]"
                                            }`}
                                    >
                                        {/* Company */}
                                        <td className="px-6 py-2">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col">
                                                    <span className="text-[13px] font-mono font-[600] text-[var(--text-primary)] uppercase tracking-tight">
                                                        {app.companyName}
                                                    </span>
                                                    <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                                        {app.applicationId}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Sector */}
                                        {!isCompact && (
                                            <td className="px-6 py-2">
                                                <span className="bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--text-secondary)] text-[10px] font-mono font-medium px-2 py-0.5 rounded-[3px] uppercase">
                                                    {app.sector?.split("/")[0]?.trim()}
                                                </span>
                                            </td>
                                        )}

                                        {/* Revenue */}
                                        {!isCompact && (
                                            <td className="px-6 py-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[13px] font-mono font-medium text-[var(--text-primary)]">
                                                        {formatCurrency(app.annualRevenue)}
                                                    </span>
                                                </div>
                                            </td>
                                        )}

                                        {/* D/E */}
                                        {!isCompact && (
                                            <td className="px-6 py-2 text-[13px] font-mono font-[700]" style={{
                                                color: app.debtToEquityRatio <= 1.0 ? "var(--accent-green)" : (app.debtToEquityRatio <= 2.0 ? "var(--accent-amber)" : "var(--accent-red)")
                                            }}>
                                                {app.debtToEquityRatio?.toFixed(2)}x
                                            </td>
                                        )}

                                        {/* GST Score */}
                                        {!isCompact && (
                                            <td className="px-6 py-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[13px] font-mono font-medium text-[var(--text-primary)]">
                                                        {app.gstComplianceScore?.toFixed(0)}
                                                    </span>
                                                    <div className="w-[40px] h-[2px] bg-[var(--bg-base)] rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full transition-all"
                                                            style={{
                                                                width: `${app.gstComplianceScore}%`,
                                                                backgroundColor: getGstColor(app.gstComplianceScore)
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                        )}

                                        {/* ML Risk Score */}
                                        <td className="px-6 py-2">
                                            {app.mlRiskScore != null ? (
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[13px] font-mono font-[700]" style={{ color: getRiskColorHex(app.mlRiskScore) }}>
                                                        {app.mlRiskScore.toFixed(0)}
                                                    </span>
                                                    <div className="w-[40px] h-[2px] bg-[var(--bg-base)] rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full transition-all"
                                                            style={{
                                                                width: `${app.mlRiskScore}%`,
                                                                backgroundColor: getRiskColorHex(app.mlRiskScore)
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-[var(--text-disabled)] font-mono text-[13px]">--</span>
                                            )}
                                        </td>

                                        {/* Decision */}
                                        {!isCompact && (
                                            <td className="px-6 py-2">
                                                <div className="flex items-center gap-1.5 text-[11px] font-mono font-[700]" style={{ color: decisionInfo.color }}>
                                                    <span>{decisionInfo.icon}</span>
                                                    <span>{decisionInfo.label}</span>
                                                </div>
                                            </td>
                                        )}

                                        {/* Status */}
                                        {!isCompact && (
                                            <td className="px-6 py-2">
                                                <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-[3px] border uppercase" style={{ backgroundColor: statusInfo.bg, borderColor: statusInfo.border }}>
                                                    <div className={`w-1 h-1 rounded-full ${app.status === 'PROCESSING' ? 'animate-pulse' : ''}`} style={{ backgroundColor: statusInfo.dot }} />
                                                    <span className="text-[10px] font-mono font-bold tracking-wider" style={{ color: statusInfo.text }}>
                                                        {statusInfo.label}
                                                    </span>
                                                </div>
                                            </td>
                                        )}

                                        {/* Action */}
                                        <td className="px-6 py-2 text-right">
                                            <span className={`text-[14px] font-mono transition-colors ${isSelected ? "text-[var(--text-primary)]" : "text-[var(--text-disabled)] group-hover:text-[var(--text-primary)]"}`}>
                                                >>
                                            </span>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                    </tbody>
                </table>

                {!loading && applications.length === 0 && (
                    <div className="py-16 text-center">
                        <div className="text-4xl mb-3">📂</div>
                        <p className="text-slate-500 font-medium">No applications loaded</p>
                        <p className="text-slate-400 text-sm mt-1">
                            Click &quot;Ingest from Databricks&quot; to load the CMIE Prowess dataset
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
