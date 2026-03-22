"use client";

import { useState, useEffect, useCallback } from "react";
import { intelliCreditApi } from "@/lib/api";

export function useRiskSummary(applicationId: string | undefined) {
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchSummary = useCallback(async () => {
        if (!applicationId) return null;
        try {
            setIsLoading(true);
            const summary = await intelliCreditApi.getRiskSummary(applicationId);
            setData(summary);
            setError(null);
            return summary;
        } catch (err) {
            console.error("[useRiskSummary] Failed to fetch:", err);
            setError(err as Error);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [applicationId]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    return { data, isLoading, error, refetch: fetchSummary };
}
