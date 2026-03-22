"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { ProgressEvent, ProgressStage } from "@/lib/types";
import { intelliCreditApi } from "@/lib/api";

const BFF_URL = process.env.NEXT_PUBLIC_BFF_URL || "http://localhost:3001";

interface UseSocketReturn {
    isConnected: boolean;
    currentStage: ProgressStage | null;
    progress: number;
    progressMessage: string;
    events: ProgressEvent[];
    subscribeToApplication: (applicationId: string) => void;
    unsubscribeFromApplication: (applicationId: string) => void;
    clearEvents: () => void;
}

export function useSocket(
    onComplete?: (applicationId: string) => void
): UseSocketReturn {
    const onCompleteRef = useRef(onComplete);
    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [currentStage, setCurrentStage] = useState<ProgressStage | null>(null);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState("");
    const [events, setEvents] = useState<ProgressEvent[]>([]);
    const [activeApplicationId, setActiveApplicationId] = useState<string | null>(null);
    const [lastSeenResearchedAt, setLastSeenResearchedAt] = useState<string | null>(null);

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        const socket = io(BFF_URL, {
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 30000,
        });

        socketRef.current = socket;

        socket.on("connect", () => {
            setIsConnected(true);
            console.log("[Socket] Connected:", socket.id);
        });

        socket.on("disconnect", () => {
            setIsConnected(false);
            console.log("[Socket] Disconnected");
        });

        socket.on("connect_error", (err) => {
            console.warn("[Socket] Connection error:", err.message);
        });

        // Progress updates from the pipeline
        socket.on("progress:update", (event: ProgressEvent) => {
            setCurrentStage(event.stage);
            setProgress(event.progress);
            setProgressMessage(event.message);
            setEvents((prev) => [...prev.slice(-49), event]); // Keep last 50
        });

        // Analysis complete with final application data
        socket.on("analysis:complete", ({ applicationId }: { applicationId: string }) => {
            onCompleteRef.current?.(applicationId);
        });

        // Buffer replay on reconnection
        socket.on("event:buffer", ({ events: bufferedEvents }: { events: ProgressEvent[] }) => {
            setEvents(bufferedEvents);
            if (bufferedEvents.length > 0) {
                const last = bufferedEvents[bufferedEvents.length - 1];
                setCurrentStage(last.stage);
                setProgress(last.progress);
                setProgressMessage(last.message);
            }
        });

        // Heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
            if (socket.connected) {
                socket.emit("ping:heartbeat");
            }
        }, 30000);

        return () => {
            clearInterval(heartbeat);
            socket.disconnect();
        };
    }, []);

    const subscribeToApplication = useCallback((applicationId: string) => {
        setActiveApplicationId(applicationId);
        if (socketRef.current?.connected) {
            socketRef.current.emit("subscribe:application", { applicationId });
        }
    }, []);

    const unsubscribeFromApplication = useCallback((applicationId: string) => {
        setActiveApplicationId(null);
        setLastSeenResearchedAt(null);
        if (socketRef.current?.connected) {
            socketRef.current.emit("unsubscribe:application", { applicationId });
        }
    }, []);

    const clearEvents = useCallback(() => {
        setEvents([]);
        setCurrentStage(null);
        setProgress(0);
        setProgressMessage("");
        setLastSeenResearchedAt(null);
    }, []);

    // Fallback Polling Logic
    useEffect(() => {
        if (isConnected || !activeApplicationId) return;

        console.log(`[Socket Fallback] Starting polling for ${activeApplicationId}`);

        const poll = async () => {
            try {
                const summary = await intelliCreditApi.getRiskSummary(activeApplicationId);
                const currentResearchedAt = summary.lastResearchedAt;

                if (currentResearchedAt && currentResearchedAt !== lastSeenResearchedAt) {
                    console.log("[Socket Fallback] Research data changed, application updated.");

                    // Simulate progress update if we were stuck
                    setCurrentStage("COMPLETED");
                    setProgress(100);
                    setProgressMessage("Analysis complete (via polling fallback)");

                    if (onCompleteRef.current) {
                        onCompleteRef.current(activeApplicationId);
                    }

                    setLastSeenResearchedAt(currentResearchedAt);
                } else if (!currentResearchedAt && !currentStage) {
                    // Just show we are doing something
                    setCurrentStage("INGESTING");
                    setProgress(10);
                    setProgressMessage("Waiting for live updates (Polling Fallback active)...");
                }
            } catch (err) {
                console.error("[Socket Fallback] Polling error:", err);
            }
        };

        const interval = setInterval(poll, 3000);
        poll(); // Initial poll

        return () => clearInterval(interval);
    }, [isConnected, activeApplicationId, lastSeenResearchedAt, currentStage]);

    return {
        isConnected,
        currentStage,
        progress,
        progressMessage,
        events,
        subscribeToApplication,
        unsubscribeFromApplication,
        clearEvents,
    };
}
