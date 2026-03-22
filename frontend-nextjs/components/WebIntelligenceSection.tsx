/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { useRiskSummary } from "@/hooks/useRiskSummary";
import { useResearchProgress, ResearchStep } from "@/hooks/useResearchProgress";
import { Globe, RefreshCw, Zap, Shield, AlertTriangle, ExternalLink, Activity } from "lucide-react";
import { toast } from "sonner";

import { intelliCreditApi } from "@/lib/api";

const STAGE_TO_SOURCE: Record<string, string> = {
    newsapi: "newsapi",
    gdelt: "gdelt",
    gate_check: "gate_check",
    fallback: "fallback",
    bff: "bff",
    dedup: "dedup",
    scoring: "scoring",
    aggregating: "aggregating",
    complete: "aggregating",
    newsapi_done: "newsapi",
    gdelt_done: "gdelt",
};

interface WebIntelligenceSectionProps {
    applicationId: string;
    companyName: string;
    newsIntelligence?: string | null;
}

// ── TRIGGER RESEARCH HELPER ──
async function triggerResearchAction(applicationId: string, companyName: string, promoters: string[] = []) {
    const tid = toast.loading(`Connecting to news scrapers for ${companyName}...`, {
        duration: 8000
    });
    try {
        console.log(`[Research] Triggering for ${companyName} (${applicationId})...`);
        const res = await intelliCreditApi.triggerResearch(applicationId, companyName, promoters);
        console.log('[Research] Triggered successfully. API Response:', res);
        toast.success(`Research pipeline started for ${companyName}`, { id: tid });
        return res;
    } catch (e: any) {
        console.error('[Research] Trigger failed:', e.message);
        toast.error(`Research trigger failed: ${e.message}`, { id: tid });
        throw e;
    }
}



// ── RESEARCH STEPS DEFINITION ──
const INITIAL_STEPS: ResearchStep[] = [
    { source: "newsapi", sourceName: "NewsAPI", status: "pending", found: 0 },
    { source: "gdelt", sourceName: "GDELT", status: "pending", found: 0 },
    { source: "gate_check", sourceName: "Validation", status: "pending", found: 0 },
    { source: "fallback", sourceName: "Secondary Search", status: "pending", found: 0 },
    { source: "bff", sourceName: "BFF Scrapers", status: "pending", found: 0 },
    { source: "dedup", sourceName: "Deduplication", status: "pending", found: 0 },
    { source: "scoring", sourceName: "Risk Scoring", status: "pending", found: 0 },
    { source: "aggregating", sourceName: "Aggregating", status: "pending", found: 0 },
];

export function WebIntelligenceSection({ applicationId, companyName, newsIntelligence }: WebIntelligenceSectionProps) {
    const { data: riskSummary, isLoading, refetch } = useRiskSummary(applicationId);
    const { isResearching, progress, isComplete } = useResearchProgress(applicationId);
    const [localProgress, setLocalProgress] = React.useState<ResearchStep[]>(INITIAL_STEPS);
    const [isTriggering, setIsTriggering] = React.useState(false);
    const [isPolling, setIsPolling] = React.useState(false);
    const [isScanning, setIsScanning] = React.useState(false);
    const [currentStage, setCurrentStage] = React.useState("");
    const [stageMessage, setStageMessage] = React.useState("");
    const [intelligenceData, setIntelligenceData] = React.useState<any>(null);
    const pollCount = React.useRef(0);

    // ── STRESS-FIX: Immediate UI Feedback ──
    const handleRunResearch = async () => {
        setIsScanning(true);
        setCurrentStage("");
        setStageMessage("");
        setLocalProgress(INITIAL_STEPS);

        try {
            await intelliCreditApi.triggerResearch(
                applicationId,
                companyName,
                [], // promoters
                // onStage — update animation
                (stage: string, message: string) => {
                    setCurrentStage(stage);
                    setStageMessage(message);

                    const sourceKey = STAGE_TO_SOURCE[stage] ?? stage;

                    setLocalProgress(prev => prev.map(step => {
                        if (step.source === sourceKey) {
                            return { ...step, status: "active" as const };
                        }
                        if (step.status === "active") {
                            // previous active step is now done
                            return { ...step, status: "done" as const };
                        }
                        return step;
                    }));
                },

                // onComplete — re-fetch from Java then stop scanning
                async () => {
                    try {
                        const updated = await intelliCreditApi.getRiskSummary(applicationId);
                        if (updated) {
                            setIntelligenceData(updated);
                        }
                    } catch (e) {
                        console.error("Re-fetch after complete failed:", e);
                    } finally {
                        setIsScanning(false);
                        setCurrentStage("complete");
                        setLocalProgress(prev =>
                            prev.map(step => ({ ...step, status: "done" as const }))
                        );
                        refetch(); // Ensure the hook also updates
                    }
                },

                // onError — stop scanning, show error
                (message: string) => {
                    console.error("[Research] Error:", message);
                    setIsScanning(false);
                    setCurrentStage("error");
                    setStageMessage(message);

                    setLocalProgress(prev => prev.map(step => ({
                        ...step,
                        status: step.status === "active" ? "failed" as const : step.status,
                    })));

                    toast.error(`Research failed: ${message}`);
                }
            );
        } catch (err) {
            console.error("[Research] Stream failed:", err);
            setIsScanning(false);
        }
    };

    // After research completes (via socket), refetch the summary
    useEffect(() => {
        if (isComplete) {
            console.log("[UI] Socket says research is complete. Refetching...");
            setIsPolling(false);
            refetch();
        }
    }, [isComplete, refetch]);

    // ── POLLING LOGIC ──
    useEffect(() => {
        // If we have no data and aren't already researching, start polling for background task results
        if (!riskSummary?.signals?.length && !isResearching && !isComplete) {
            setIsPolling(true);
        } else if (riskSummary?.signals?.length > 0) {
            setIsPolling(false);
        }
    }, [riskSummary, isResearching, isComplete]);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isPolling && !isResearching && !isComplete) {
            timer = setInterval(async () => {
                pollCount.current += 1;
                console.log(`[Polling] Attempt ${pollCount.current} for ${applicationId}...`);

                const data = await refetch();
                // Stop if data appears or we timeout (3 mins = 45 attempts * 4s)
                if ((data as any)?.topAlerts?.length > 0 || pollCount.current >= 45) {
                    setIsPolling(false);
                    clearInterval(timer);
                }
            }, 4000);
        }
        return () => clearInterval(timer);
    }, [isPolling, isResearching, isComplete, applicationId, refetch]);

    // ── LOADING STATE ──
    if (isLoading && !riskSummary) {
        return <WebIntelligenceSkeleton />;
    }

    // ── RESEARCHING STATE ──
    if (isScanning || isResearching || (progress && progress.length > 0 && !isComplete)) {
        return (
            <div className="space-y-4">
                <SectionHeader />
                <ResearchProgressBar progress={isScanning ? localProgress : progress} />
            </div>
        );
    }

    // ── HAS REAL DATA ──
    const activeData = intelligenceData || riskSummary;
    if (activeData && activeData.aggregateScore !== undefined) {
        return (
            <div className="space-y-6">
                <SectionHeader
                    lastResearched={riskSummary.lastResearchedAt}
                    onRerun={handleRunResearch}
                    isStarting={isTriggering}
                />

                {/* Risk Score + Level */}
                <RiskScoreCard
                    score={activeData.aggregateScore}
                    level={activeData.overallRiskLevel}
                    breakdown={activeData.breakdown}
                />

                {/* Top Alert Cards */}
                <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Top Risk Alerts
                    </h4>
                    {activeData.topAlerts && activeData.topAlerts.length > 0 ? (
                        activeData.topAlerts.map((alert: any, idx: number) => (
                            <AlertCard key={alert.id || idx} alert={alert} />
                        ))
                    ) : (
                        <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-xl border border-dashed text-center">
                            No high-risk alerts found in recent sources.
                        </div>
                    )}
                </div>

                {/* Sources searched */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <div className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        <span>
                            Sources: {activeData.sourcesSearched?.join(', ') || "Unknown"}
                        </span>
                    </div>
                    <div>
                        {(activeData.breakdown?.low || 0) + (activeData.breakdown?.medium || 0) +
                            (activeData.breakdown?.high || 0) + (activeData.breakdown?.critical || 0)} articles analyzed
                    </div>
                </div>
            </div>
        );
    }

    // ── EMPTY / POLLING STATE ──
    return (
        <div className="card p-8 text-center flex flex-col items-center border-dashed bg-slate-50/50 relative overflow-hidden">
            {isPolling && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
                    <div className="relative mb-4">
                        <div className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center text-xs">🔎</div>
                    </div>
                    <h4 className="text-sm font-bold text-blue-900 mb-1">Scanning Intelligence Sources</h4>
                    <p className="text-[11px] text-blue-700/70 max-w-[200px]">
                        Running automated research for <strong>{companyName}</strong>. This usually takes 30-60 seconds.
                    </p>
                </div>
            )}

            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center text-3xl mb-4">
                🔍
            </div>
            <h3 className="text-lg font-bold text-slate-800">No intelligence data yet</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
                Real-time scanning of Economic Times, Mint, Google News and regulatory watchlists not yet started for this entity.
            </p>
            <button
                onClick={handleRunResearch}
                disabled={isScanning || isResearching || isPolling}
                className={`btn-primary transition-all duration-300 ${(isScanning || isPolling) ? 'scale-[0.98] bg-blue-700' : 'hover:shadow-glow-blue'}`}
            >
                {isScanning ? (
                    <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Requesting Intelligence...
                    </>
                ) : isPolling ? (
                    <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Scanners Active...
                    </>
                ) : (
                    <>
                        <Zap className="w-4 h-4" />
                        Run Research Now
                    </>
                )}
            </button>

            <style jsx>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

// ── SUB-COMPONENTS ──

function SectionHeader({ lastResearched, onRerun, isStarting }: { lastResearched?: string; onRerun?: () => void; isStarting?: boolean }) {
    return (
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-600" /> Web Intelligence Summary
            </h3>
            <div className="flex items-center gap-3">
                {lastResearched && (
                    <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded-full">
                        Last scan: {new Date(lastResearched).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                )}
                {onRerun && (
                    <button
                        onClick={onRerun}
                        disabled={isStarting}
                        className={`p-1.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-blue-100 ${isStarting ? 'opacity-50' : ''}`}
                        title="Re-run Research"
                    >
                        <RefreshCw className={`w-4 h-4 ${isStarting ? 'animate-spin' : ''}`} />
                    </button>
                )}
            </div>
        </div>
    );
}

function RiskScoreCard({ score, level, breakdown }: any) {
    const color = score >= 60 ? '#ef4444' : score >= 40 ? '#f97316'
        : score >= 20 ? '#eab308' : '#22c55e';
    const levelColors: any = {
        CRITICAL: 'badge-red',
        HIGH: 'badge-orange',
        MEDIUM: 'badge-amber',
        LOW: 'badge-green',
    };
    return (
        <div className="flex items-center gap-5 p-5 rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5">
            <ScoreRing score={score} color={color} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-extrabold text-xl tracking-tight" style={{ color }}>
                        News Risk Score: {score}
                    </span>
                    <span className={`badge ${levelColors[level] || 'badge-slate'} text-[10px]`}>
                        {level}
                    </span>
                </div>
                <BreakdownBar breakdown={breakdown} />
                <p className="text-[11px] text-slate-500 mt-2 font-medium">
                    {breakdown?.critical || 0} critical · {breakdown?.high || 0} high ·
                    {breakdown?.medium || 0} medium · {breakdown?.low || 0} low risk articles
                </p>
            </div>
        </div>
    );
}

function AlertCard({ alert }: { alert: any }) {
    const borderColor = alert.riskScore >= 40 ? 'border-red-400'
        : alert.riskScore >= 20 ? 'border-orange-400'
            : 'border-amber-400';
    const bgHover = alert.riskScore >= 40 ? 'hover:bg-red-50/50'
        : alert.riskScore >= 20 ? 'hover:bg-orange-50/50'
            : 'hover:bg-amber-50/50';

    return (
        <div className={`border-l-4 ${borderColor} ${bgHover} pl-4 py-3 bg-white rounded-r-xl border border-slate-200 transition-colors group shadow-sm ring-1 ring-slate-900/5`}>
            <a href={alert.url || alert.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="font-bold text-sm text-slate-800 hover:text-blue-700 leading-snug line-clamp-2 transition-colors flex items-start gap-2">
                {alert.title}
                <ExternalLink className="w-3 h-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </a>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded leading-none">
                        {alert.sourceName}
                    </span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">
                    {alert.publishedAt ? new Date(alert.publishedAt).toLocaleDateString('en-IN') : ''}
                </span>

                <div className="flex gap-1">
                    {(alert.riskKeywords || alert.riskKeywordsFound)?.slice(0, 3).map((kw: string) => (
                        <span key={kw} className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded font-bold leading-none">
                            {kw}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ResearchProgressBar({ progress }: { progress: any[] }) {
    return (
        <div className="space-y-4 p-6 bg-blue-50/50 rounded-2xl border border-blue-100 shadow-inner">
            <div className="flex items-center gap-3 mb-2">
                <div className="relative">
                    <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center text-[10px]">🔍</div>
                </div>
                <div>
                    <p className="text-sm font-bold text-blue-900">Researching news sources...</p>
                    <p className="text-[11px] text-blue-700/70">Scanning real-time intelligence for the last 24 months</p>
                </div>
            </div>

            <div className="divide-y divide-blue-100/50 bg-white/60 rounded-xl overflow-hidden border border-blue-100/30">
                {(progress && progress.length > 0) ? progress.map((p, idx) => (
                    <div key={p.source || idx} className="flex items-center gap-3 px-4 py-3 text-sm">
                        <div className="w-5 h-5 flex items-center justify-center">
                            {p.status === "active" ? (
                                <div className="w-3 h-3 bg-black rounded-full animate-pulse ring-4 ring-black/10" />
                            ) : p.status === "done" ? (
                                <div className="w-4 h-4 bg-black rounded-full flex items-center justify-center text-[10px] text-white">
                                    ✓
                                </div>
                            ) : p.status === "failed" ? (
                                <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] text-white">
                                    ×
                                </div>
                            ) : p.status === "skipped" ? (
                                <div className="w-3 h-3 bg-slate-200 rounded-full" />
                            ) : (
                                <div className="w-3 h-3 bg-slate-200 rounded-full" />
                            )}
                        </div>
                        <span className="text-slate-700 font-semibold flex-1 tracking-tight">{p.sourceName}</span>
                        <div className="flex items-center gap-2">
                            {p.status === "skipped" && (
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">skipped</span>
                            )}
                            <span className="text-slate-500 text-[11px] font-medium font-mono">
                                {p.status === 'done' ? `${p.found || 0} articles` :
                                    p.status === 'active' ? 'scanning...' :
                                        p.status === 'pending' ? 'pending' : ''}
                            </span>
                        </div>
                    </div>
                )) : (
                    <div className="flex items-center gap-3 px-4 py-3 text-sm animate-pulse">
                        <span className="text-lg">⏳</span>
                        <span className="text-slate-700 font-semibold flex-1">Initializing scrapers...</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function ScoreRing({ score, color }: { score: number, color: string }) {
    const r = 32;
    const c = 2 * Math.PI * r;
    return (
        <div className="relative w-20 h-20 flex-shrink-0">
            <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
                <circle cx="40" cy="40" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
                <motion.circle
                    cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8"
                    strokeDasharray={c}
                    initial={{ strokeDashoffset: c }}
                    animate={{ strokeDashoffset: c * (1 - score / 100) }}
                    strokeLinecap="round"
                    transition={{ duration: 1.5, ease: "easeOut" }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-extrabold tracking-tighter" style={{ color }}>{score.toFixed(0)}</span>
            </div>
        </div>
    );
}

function BreakdownBar({ breakdown }: { breakdown: any }) {
    const total = (breakdown?.critical || 0) + (breakdown?.high || 0) +
        (breakdown?.medium || 0) + (breakdown?.low || 0);
    if (!total) return <div className="h-2 rounded-full bg-slate-100 w-full max-w-xs" />;

    const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;
    return (
        <div className="flex h-2.5 rounded-full overflow-hidden w-full max-w-xs ring-1 ring-slate-100">
            {breakdown.critical > 0 && <div style={{ width: pct(breakdown.critical), background: '#ef4444' }} />}
            {breakdown.high > 0 && <div style={{ width: pct(breakdown.high), background: '#f97316' }} />}
            {breakdown.medium > 0 && <div style={{ width: pct(breakdown.medium), background: '#eab308' }} />}
            {breakdown.low > 0 && <div style={{ width: pct(breakdown.low), background: '#22c55e' }} />}
        </div>
    );
}

function WebIntelligenceSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="h-6 bg-slate-200 rounded-md w-1/3 mb-6" />
            <div className="h-24 bg-slate-100 rounded-2xl border border-slate-200" />
            <div className="space-y-3">
                <div className="h-4 bg-slate-200 rounded w-1/4" />
                <div className="h-20 bg-slate-50 rounded-xl" />
                <div className="h-20 bg-slate-50 rounded-xl" />
            </div>
        </div>
    );
}
