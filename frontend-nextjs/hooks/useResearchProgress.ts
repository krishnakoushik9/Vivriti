"use client";

import { useState, useEffect } from "react";
import { useSocket } from "./useSocket";

export interface ResearchStep {
    source: string;
    sourceName: string;
    status: "pending" | "active" | "done" | "failed" | "skipped";
    found: number;
}

export const STAGE_TO_SOURCE: Record<string, string> = {
    newsapi: "newsapi",
    gdelt: "gdelt",
    gate_check: "gate_check",
    fallback: "fallback",
    bff: "bff",
    dedup: "dedup",
    scoring: "scoring",
    aggregating: "aggregating",
};

export const INITIAL_STEPS: ResearchStep[] = [
    { source: "newsapi", sourceName: "NewsAPI", status: "pending", found: 0 },
    { source: "gdelt", sourceName: "GDELT", status: "pending", found: 0 },
    { source: "gate_check", sourceName: "Validation", status: "pending", found: 0 },
    { source: "fallback", sourceName: "Secondary Search", status: "pending", found: 0 },
    { source: "bff", sourceName: "BFF Scrapers", status: "pending", found: 0 },
    { source: "dedup", sourceName: "Deduplication", status: "pending", found: 0 },
    { source: "scoring", sourceName: "Risk Scoring", status: "pending", found: 0 },
    { source: "aggregating", sourceName: "Finalizing", status: "pending", found: 0 },
];

export function useResearchProgress(applicationId: string | undefined) {
    const { events, currentStage } = useSocket();
    const [progress, setProgress] = useState<ResearchStep[]>(INITIAL_STEPS);
    const [isResearching, setIsResearching] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        if (!applicationId) return;

        // Reset state when applicationId changes
        setProgress(INITIAL_STEPS);
        setIsResearching(false);
        setIsComplete(false);
    }, [applicationId]);

    useEffect(() => {
        if (!events || events.length === 0) return;

        const researchEvents = events.filter(e =>
            e.applicationId === applicationId &&
            (e.stage === "CRAWLING_INTELLIGENCE" || e.stage.startsWith("DEEP_CRAWL"))
        );

        if (researchEvents.length > 0) {
            setIsResearching(true);

            const lastEvent = researchEvents[researchEvents.length - 1];
            if (lastEvent.stage === "COMPLETED" || (lastEvent.stage as string) === "DEEP_CRAWL_COMPLETED") {
                setIsComplete(true);
                setIsResearching(false);
                setProgress(prev => prev.map(s => ({ ...s, status: "done" })));
            }
        }
    }, [events, applicationId]);

    return {
        isResearching: isResearching || currentStage === "CRAWLING_INTELLIGENCE",
        progress,
        setProgress,
        isComplete
    };
}
