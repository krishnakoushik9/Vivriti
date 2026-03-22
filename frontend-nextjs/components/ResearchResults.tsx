"use client";

import React, { useState } from "react";
import {
    Search,
    MessageSquare,
    ShieldAlert,
    TrendingUp,
    ChevronRight,
    ArrowUpRight,
    AlertCircle,
    CheckCircle2,
    Clock
} from "lucide-react";
import { motion } from "framer-motion";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
    data: any;
}

export default function ResearchResults({ data }: Props) {
    if (!data) return null;

    // Risk color utilities
    const getRiskColor = (level?: string) => {
        const l = level?.toUpperCase();
        if (l === "HIGH" || l === "CRITICAL") return { bg: "#FEF2F2", text: "#DC2626", border: "#FEE2E2" };
        if (l === "MEDIUM") return { bg: "#FFFBEB", text: "#D97706", border: "#FEF3C7" };
        if (l === "LOW") return { bg: "#F0FDF4", text: "#16A34A", border: "#DCFCE7" };
        return { bg: "#F8FAFC", text: "#6B6B6B", border: "#E5E5E3" };
    };

    const riskLevel = data.overall_risk_level || data.risk_rating?.rating || "MEDIUM";
    const riskStyle = getRiskColor(riskLevel);
    const score = data.avg_risk_score || data.risk_rating?.score || 0;
    const confidence = data.confidence_avg || data.risk_rating?.confidence || 0;

    return (
        <div className="flex flex-col gap-8 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header / Summary Card */}
            <div className="bg-white border border-[#E5E5E3] rounded-[8px] p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-1">
                        <div className="text-[16px] font-semibold text-[#0A0A0A]">
                            Summary Intelligence Report
                        </div>
                        <h2 className="text-[24px] font-bold text-[#0A0A0A]">
                            {data.company || data.company_name}
                        </h2>
                        <div className="flex items-center gap-3 mt-4">
                            <span
                                className="px-4 py-1.5 rounded-full text-[13px] font-bold uppercase tracking-wider border"
                                style={{
                                    backgroundColor: riskStyle.bg,
                                    color: riskStyle.text,
                                    borderColor: riskStyle.border
                                }}
                            >
                                {riskLevel} RISK
                            </span>
                            <span className="text-[13px] text-[#6B6B6B]">
                                {(data.top_alerts?.length || 0)} high-priority signals detected
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-8 border-l border-[#F0EFEB] pl-8">
                        <div className="space-y-1 text-center md:text-left">
                            <div className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wide">ML Score</div>
                            <div className="text-[18px] font-semibold text-[#0A0A0A]">{score.toFixed(1)}</div>
                        </div>
                        <div className="space-y-1 text-center md:text-left">
                            <div className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wide">Articles</div>
                            <div className="text-[18px] font-semibold text-[#0A0A0A]">{data.total_articles || data.total_articles_analyzed || 0}</div>
                        </div>
                        <div className="space-y-1 text-center md:text-left">
                            <div className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wide">Confidence</div>
                            <div className="text-[18px] font-semibold text-[#0A0A0A]">{Math.round(confidence * 100)}%</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Top Critical Alerts */}
                <div className="bg-white border border-[#E5E5E3] rounded-[8px] flex flex-col">
                    <div className="px-6 py-4 border-b border-[#F0EFEB]">
                        <h3 className="text-[14px] font-semibold text-[#0A0A0A]">Top Critical Alerts</h3>
                    </div>
                    <div className="p-0 overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-[#F7F7F5] border-b border-[#E5E5E3]">
                                <tr>
                                    <th className="px-6 py-2.5 text-left text-[11px] font-medium text-[#A3A3A3] uppercase">Priority</th>
                                    <th className="px-6 py-2.5 text-left text-[11px] font-medium text-[#A3A3A3] uppercase">Issue</th>
                                    <th className="px-6 py-2.5 text-left text-[11px] font-medium text-[#A3A3A3] uppercase text-right">Impact</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#F0EFEB]">
                                {(data.top_alerts || []).map((alert: any, i: number) => {
                                    const alertStyle = getRiskColor(alert.severity || alert.risk_level);
                                    return (
                                        <tr key={i} className="hover:bg-[#F7F7F5] transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: alertStyle.text }} />
                                                    <span className="text-[12px] font-medium" style={{ color: alertStyle.text }}>{alert.severity || alert.risk_level}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-[13px] text-[#0A0A0A] font-medium line-clamp-1">{alert.short_summary || alert.title}</div>
                                                <div className="text-[11px] text-[#A3A3A3] uppercase">{alert.type || alert.source_type}</div>
                                            </td>
                                            <td className="px-6 py-4 text-[12px] text-[#0A0A0A] font-semibold text-right">
                                                {(alert.impact_score || alert.risk_score || 0).toFixed(1)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Risk Factor Breakdown */}
                <div className="bg-white border border-[#E5E5E3] rounded-[8px] flex flex-col">
                    <div className="px-6 py-4 border-b border-[#F0EFEB]">
                        <h3 className="text-[14px] font-semibold text-[#0A0A0A]">Weighted Risk Breakdown</h3>
                    </div>
                    <div className="p-6 space-y-5">
                        {(data.risk_breakdown_list || Object.entries(data.risk_breakdown || {}).map(([factor, score]) => ({ factor, score: Number(score) }))).map((item: any, i: number) => {
                            // If item.score is just a count, we normalize or just use it. 
                            // The design system expects a 0-10 score.
                            const displayScore = typeof item.score === 'number' ? item.score : 0;
                            const factorStyle = getRiskColor(displayScore > 7 ? "HIGH" : (displayScore > 4 ? "MEDIUM" : "LOW"));
                            return (
                                <div key={i} className="space-y-1.5">
                                    <div className="flex justify-between items-end">
                                        <span className="text-[13px] font-medium text-[#0A0A0A]">{item.factor || item.key || "Unknown Factor"}</span>
                                        <span className="text-[12px] font-semibold" style={{ color: factorStyle.text }}>{displayScore.toFixed(1)}</span>
                                    </div>
                                    <div className="w-full h-[4px] bg-[#E5E5E3] rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(displayScore * 10, 100)}%` }}
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{
                                                backgroundColor: factorStyle.text
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Knowledge Sources */}
            <div className="bg-white border border-[#E5E5E3] rounded-[8px] p-6">
                <h3 className="text-[14px] font-semibold text-[#0A0A0A] mb-4 uppercase tracking-widest text-[11px]">Knowledge Sources</h3>
                <div className="flex flex-wrap gap-2">
                    {Object.entries(data.source_mix || {}).map(([source, count], i) => (
                        <div key={source} className="bg-[#F0EFEB] text-[#0A0A0A] px-3 py-1.5 rounded-[4px] text-[12px] font-medium border border-[#E5E5E3]">
                            {source.toUpperCase()}: {String(count)} signals
                        </div>
                    ))}
                </div>
            </div>

            {/* Supplemental Signals */}
            {data.supplemental && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.entries(data.supplemental).map(([key, signal]: [string, any], i) => (
                        <div key={key} className="bg-white border border-[#E5E5E3] rounded-[8px] p-4 flex flex-col gap-2">
                            <div className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wide">{key.replace(/_/g, ' ')}</div>
                            <div className="flex items-center justify-between">
                                <span className="text-[14px] font-semibold text-[#0A0A0A]">{typeof signal === 'object' ? (signal.status || signal.score || "Check") : String(signal)}</span>
                                <div className="w-2 h-2 rounded-full bg-[#16A34A]" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Intelligence Stream (Articles) */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-[16px] font-bold text-[#0A0A0A]">Intelligence Stream</h3>
                    <div className="text-[12px] text-[#6B6B6B]">Showing {(data.articles || []).length} verified signals</div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {(data.articles || []).map((article: any, i: number) => {
                        const articleRiskStyle = getRiskColor(article.risk_level);
                        return (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="bg-white border-t-2 border-t-[#F0EFEB] border border-x-[#E5E5E3] border-b-[#E5E5E3] rounded-b-[8px] p-5 hover:bg-[#F7F7F5] transition-colors group relative overflow-hidden"
                            >
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] font-bold text-[#6B6B6B] tracking-[0.05em] uppercase">
                                                {article.source || article.source_type || "External Signal"}
                                            </span>
                                            <span
                                                className="text-[10px] px-1.5 py-0.5 rounded-[4px] font-bold"
                                                style={{ backgroundColor: articleRiskStyle.bg, color: articleRiskStyle.text }}
                                            >
                                                {article.risk_level}
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-[#A3A3A3]">
                                            {article.published_at || article.publish_date || "Recent"}
                                        </span>
                                    </div>
                                    <a
                                        href={article.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[15px] font-semibold text-[#0A0A0A] hover:underline decoration-[#A3A3A3] underline-offset-4 group-hover:text-black transition-colors flex items-center gap-2"
                                    >
                                        {article.title}
                                        <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </a>
                                    <p className="text-[13px] text-[#6B6B6B] leading-relaxed line-clamp-2">
                                        {article.snippet || article.summary}
                                    </p>
                                    <div className="flex items-center gap-4 mt-2 pt-2 border-t border-[#F7F7F5]">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                                            <span className="text-[11px] font-medium text-[#6B6B6B]">Credibility: {Math.round((article.confidence || article.credibility_score || 0.8) * 100)}%</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#0A0A0A]" />
                                            <span className="text-[11px] font-medium text-[#6B6B6B]">Impact: {(article.risk_score || 0).toFixed(1)}</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

const ShieldExclamation = ({ size, className }: { size: number; className?: string }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
    </svg>
);
