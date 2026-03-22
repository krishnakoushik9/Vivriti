"use client";

import React, { useState, useCallback, useRef } from "react";
import ResearchAnimation from "./ResearchAnimation";
import ResearchResults from "./ResearchResults";
import { Search } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Form state shape ─────────────────────────────────────────
interface FormData {
    company_name: string;
    promoters: string[];
    cin: string;
    revenue: number;
    gst_score: number;
    base_credit_score: number;
}

const DEFAULT_FORM: FormData = {
    company_name: "",
    promoters: [],
    cin: "",
    revenue: 0.0,
    gst_score: 50,
    base_credit_score: 650,
};

export default function ResearchPanel() {
    const [form, setForm] = useState<FormData>(DEFAULT_FORM);
    const [promoterInput, setPromoterInput] = useState("");

    // Stream / event state
    const [isRunning, setIsRunning] = useState(false);
    const [currentStage, setCurrentStage] = useState("");
    const [stageMessage, setStageMessage] = useState("");
    const [isError, setIsError] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [result, setResult] = useState<any>(null);

    const abortRef = useRef<AbortController | null>(null);

    // ── Promoter tag helpers ──────
    const addPromoter = () => {
        const v = promoterInput.trim();
        if (v && !form.promoters.includes(v)) {
            setForm((f) => ({ ...f, promoters: [...f.promoters, v] }));
            setPromoterInput("");
        }
    };
    const removePromoter = (p: string) => {
        setForm((f) => ({ ...f, promoters: f.promoters.filter((x) => x !== p) }));
    };

    // ── Reset ─────────────────────
    const reset = useCallback(() => {
        setIsRunning(false);
        setCurrentStage("");
        setStageMessage("");
        setIsError(false);
        setIsComplete(false);
        setErrorMessage("");
        setResult(null);
    }, []);

    // ── handleEvent dispatcher ────
    const handleEvent = useCallback((event: any) => {
        if (event.event === "stage") {
            setCurrentStage(event.stage);
            setStageMessage(event.message || "");
        } else if (event.event === "complete") {
            setIsComplete(true);
            setIsRunning(false);
            setResult(event.data);
        } else if (event.event === "error") {
            setIsError(true);
            setIsRunning(false);
            setErrorMessage(event.message || "Unknown error");
        }
    }, []);

    // ── Run research with streaming NDJSON ──
    const runResearch = useCallback(async () => {
        if (!form.company_name.trim()) return;
        reset();
        setIsRunning(true);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch("/api/research/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
                signal: controller.signal,
            });

            if (!res.ok || !res.body) {
                handleEvent({
                    event: "error",
                    message: `HTTP ${res.status}: ${res.statusText}`,
                });
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const event = JSON.parse(line);
                        handleEvent(event);
                    } catch {
                        console.warn("Partial line skipped:", line);
                    }
                }
            }

            // Process any remaining buffer
            if (buffer.trim()) {
                try {
                    const event = JSON.parse(buffer);
                    handleEvent(event);
                } catch {
                    console.warn("Final partial line skipped:", buffer);
                }
            }
        } catch (err: any) {
            if (err.name !== "AbortError") {
                handleEvent({
                    event: "error",
                    message: err.message || "Network error",
                });
            }
        }
    }, [form, handleEvent, reset]);

    return (
        <section className="bg-white border border-[#E5E5E3] rounded-[8px] p-6">
            <div className="flex items-center gap-2 mb-6">
                <Search className="w-4 h-4 text-[#0A0A0A]" />
                <h3 className="text-[16px] font-semibold text-[#0A0A0A]">
                    Company Research
                </h3>
            </div>

            <div className="flex flex-col gap-6">
                {/* Form Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    {/* Company Name */}
                    <div className="md:col-span-2">
                        <label className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wide mb-1.5 block">
                            Company Name *
                        </label>
                        <input
                            value={form.company_name}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, company_name: e.target.value }))
                            }
                            placeholder="e.g., Tata Motors"
                            className="w-full h-[40px] px-3 border border-[#E5E5E3] rounded-[6px] text-[14px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A] bg-white transition-colors"
                        />
                    </div>

                    {/* Promoters */}
                    <div className="md:col-span-2">
                        <label className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wide mb-1.5 block">
                            Promoter Names (optional)
                        </label>
                        <div className="flex gap-2">
                            <input
                                value={promoterInput}
                                onChange={(e) => setPromoterInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addPromoter();
                                    }
                                }}
                                placeholder="Type name & press Enter"
                                className="flex-1 h-[40px] px-3 border border-[#E5E5E3] rounded-[6px] text-[14px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A] bg-white transition-colors"
                            />
                            <button
                                onClick={addPromoter}
                                className="h-[40px] px-4 bg-[#F0EFEB] text-[#0A0A0A] font-medium text-[14px] rounded-[6px] hover:bg-[#E5E5E3] transition-colors"
                            >
                                Add
                            </button>
                        </div>
                        {form.promoters.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {form.promoters.map((p) => (
                                    <span key={p} className="inline-flex items-center gap-2 bg-[#F0EFEB] text-[#0A0A0A] px-3 py-1 rounded-full text-[12px] font-medium">
                                        {p}
                                        <button
                                            onClick={() => removePromoter(p)}
                                            className="text-[#A3A3A3] hover:text-[#0A0A0A] font-bold text-[14px]"
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* CIN */}
                    <div>
                        <label className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wide mb-1.5 block">
                            CIN Number
                        </label>
                        <input
                            value={form.cin}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, cin: e.target.value }))
                            }
                            placeholder="Optional"
                            className="w-full h-[40px] px-3 border border-[#E5E5E3] rounded-[6px] text-[14px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A] bg-white transition-colors"
                        />
                    </div>

                    {/* Revenue */}
                    <div>
                        <label className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wide mb-1.5 block">
                            Revenue (Cr)
                        </label>
                        <input
                            type="number"
                            value={form.revenue || ""}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    revenue: parseFloat(e.target.value) || 0,
                                }))
                            }
                            placeholder="0"
                            className="w-full h-[40px] px-3 border border-[#E5E5E3] rounded-[6px] text-[14px] text-[#0A0A0A] focus:outline-none focus:border-[#0A0A0A] bg-white transition-colors"
                        />
                    </div>

                    {/* GST Score slider */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wide">
                            GST COMPLIANCE: {form.gst_score}
                        </label>
                        <div className="relative h-6 flex items-center">
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={form.gst_score}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        gst_score: parseInt(e.target.value, 10),
                                    }))
                                }
                                className="w-full appearance-none bg-[#E5E5E3] h-[4px] rounded-[2px] cursor-pointer accent-[#0A0A0A] slider-thumb-custom"
                            />
                        </div>
                    </div>

                    {/* Credit score slider */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wide">
                            CREDIT SCORE: {form.base_credit_score}
                        </label>
                        <div className="relative h-6 flex items-center">
                            <input
                                type="range"
                                min={300}
                                max={900}
                                step={10}
                                value={form.base_credit_score}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        base_credit_score: parseInt(e.target.value, 10),
                                    }))
                                }
                                className="w-full appearance-none bg-[#E5E5E3] h-[4px] rounded-[2px] cursor-pointer accent-[#0A0A0A] slider-thumb-custom"
                            />
                        </div>
                    </div>
                </div>

                <style>{`
                    .slider-thumb-custom::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        width: 14px;
                        height: 14px;
                        background: #FFFFFF;
                        border: 1.5px solid #0A0A0A;
                        border-radius: 50%;
                        cursor: pointer;
                    }
                    .slider-thumb-custom::-moz-range-thumb {
                        width: 14px;
                        height: 14px;
                        background: #FFFFFF;
                        border: 1.5px solid #0A0A0A;
                        border-radius: 50%;
                        cursor: pointer;
                    }
                `}</style>

                {/* Run Button */}
                <button
                    onClick={runResearch}
                    disabled={isRunning || !form.company_name.trim()}
                    className={`w-full h-[40px] flex items-center justify-center gap-2 rounded-[6px] font-medium text-[14px] transition-all
                        ${isRunning || !form.company_name.trim()
                            ? "bg-[#A3A3A3] text-white cursor-not-allowed"
                            : "bg-[#0A0A0A] text-white hover:bg-[#1A1A1A]"
                        }`}
                >
                    {isRunning ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            Running research...
                        </>
                    ) : (
                        <>
                            <Search className="w-4 h-4" />
                            Run Research
                        </>
                    )}
                </button>

                {/* Animation / Results */}
                {(isRunning || isError || isComplete) && (
                    <div className="mt-8 pt-8 border-t border-[#F0EFEB]">
                        <ResearchAnimation
                            currentStage={currentStage}
                            stageMessage={stageMessage}
                            isError={isError}
                            isComplete={isComplete}
                            errorMessage={errorMessage}
                            onRetry={() => {
                                setIsError(false);
                                setErrorMessage("");
                                setCurrentStage("");
                                setResult(null);
                            }}
                        />

                        <div
                            className={`transition-all duration-500 delay-150 ${result ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
                                }`}
                        >
                            {result && <ResearchResults data={result} />}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

/* 
   Note: Banned colors and gradients removed.
   Inline styles replaced with Tailwind and curated config.
*/
