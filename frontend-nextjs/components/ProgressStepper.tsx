"use client";

import React from "react";
import { CheckCircle2, Circle, Loader2, Database, Brain, Globe, FileText, Star, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ProgressStage } from "@/lib/types";
import { PIPELINE_STEPS } from "@/lib/types";

interface ProgressStepperProps {
    currentStage: ProgressStage | null;
    progress: number;
    message: string;
    isVisible: boolean;
}

const STEP_ICONS: Record<string, React.ElementType> = {
    INGESTING: Database,
    RUNNING_MODELS: Brain,
    CRAWLING_INTELLIGENCE: Globe,
    SYNTHESIZING_CAM: FileText,
    COMPLETED: Star,
    ERROR: AlertCircle,
};

function getStepState(
    stepStage: ProgressStage,
    currentStage: ProgressStage | null
): "pending" | "active" | "done" | "error" {
    if (!currentStage) return "pending";
    if (currentStage === "ERROR") {
        return stepStage === currentStage ? "error" : "done";
    }

    const stepOrder = PIPELINE_STEPS.find((s) => s.id === stepStage)?.step ?? 0;
    const currentOrder = PIPELINE_STEPS.find((s) => s.id === currentStage)?.step ?? 0;

    if (stepOrder < currentOrder) return "done";
    if (stepOrder === currentOrder) return "active";
    return "pending";
}

export default function ProgressStepper({
    currentStage,
    progress,
    message,
    isVisible,
}: ProgressStepperProps) {
    if (!isVisible) return null;

    const isComplete = currentStage === "COMPLETED";
    const isError = currentStage === "ERROR";

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.97 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className={`card border-2 p-6 mb-6 ${isComplete
                    ? "border-emerald-300 bg-emerald-50"
                    : isError
                        ? "border-red-300 bg-red-50"
                        : "border-blue-200 bg-blue-50/50"
                    }`}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <div className="font-bold text-slate-900 text-base flex items-center gap-2">
                            {isComplete ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : isError ? (
                                <AlertCircle className="w-5 h-5 text-red-500" />
                            ) : (
                                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                            )}
                            {isComplete
                                ? "Analysis Complete — Credit Intelligence Ready"
                                : isError
                                    ? "Processing Error"
                                    : "AI Credit Analysis Pipeline Running…"}
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5 pl-7">{message}</p>
                    </div>
                    <div className="text-right">
                        <div
                            className={`text-2xl font-extrabold ${isComplete
                                ? "text-emerald-600"
                                : isError
                                    ? "text-red-600"
                                    : "text-blue-700"
                                }`}
                        >
                            {progress < 0 ? "—" : `${progress}%`}
                        </div>
                        <div className="text-xs text-slate-400 font-medium">
                            {isComplete ? "Completed" : isError ? "Failed" : "Progress"}
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-2 bg-white rounded-full border border-slate-200 mb-6 overflow-hidden">
                    <motion.div
                        className={`h-full rounded-full ${isComplete
                            ? "bg-emerald-500"
                            : isError
                                ? "bg-red-500"
                                : "progress-fill"
                            }`}
                        initial={{ width: "0%" }}
                        animate={{ width: `${Math.max(0, progress)}%` }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}
                    />
                </div>

                {/* Steps */}
                <div className="flex items-start justify-between gap-2 relative">
                    {/* Connector line */}
                    <div className="absolute top-5 left-10 right-10 h-0.5 bg-slate-200 z-0" />

                    {PIPELINE_STEPS.map((step) => {
                        const Icon = STEP_ICONS[step.id] || Circle;
                        const state = getStepState(step.id, currentStage);

                        return (
                            <div key={step.id} className="flex flex-col items-center gap-2 flex-1 z-10">
                                <motion.div
                                    animate={
                                        state === "active"
                                            ? { scale: [1, 1.08, 1] }
                                            : { scale: 1 }
                                    }
                                    transition={{ repeat: Infinity, duration: 1.5 }}
                                    className={`step-icon w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${state === "done"
                                        ? "bg-emerald-500 text-white shadow-md"
                                        : state === "active"
                                            ? "bg-blue-600 text-white ring-4 ring-blue-100 shadow-glow-blue"
                                            : state === "error"
                                                ? "bg-red-500 text-white"
                                                : "bg-white text-slate-400 border-2 border-slate-200"
                                        }`}
                                >
                                    {state === "done" ? (
                                        <CheckCircle2 className="w-5 h-5" />
                                    ) : state === "active" ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <Icon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
                                    )}
                                </motion.div>
                                <div className="text-center">
                                    <div
                                        className={`text-[11px] font-semibold leading-tight ${state === "active"
                                            ? "text-blue-700"
                                            : state === "done"
                                                ? "text-emerald-700"
                                                : "text-slate-400"
                                            }`}
                                    >
                                        {step.label}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5 hidden sm:block leading-tight">
                                        {step.description}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
