"use client";

import React, { useState, useEffect, useRef } from "react";

// ─── Stage pipeline order ─────────────────────────────────────
const STAGE_ORDER = [
  "newsapi",
  "gdelt",
  "gate_check",
  "fallback",
  "bff",
  "dedup",
  "scoring",
  "aggregating",
];

const STAGE_LABELS: Record<string, string> = {
  newsapi: "NewsAPI",
  gdelt: "GDELT",
  gate_check: "Gate Check",
  fallback: "Fallback",
  bff: "BFF",
  dedup: "Dedup",
  scoring: "Scoring",
  aggregating: "Aggregating",
};

interface Props {
  currentStage: string;
  stageMessage: string;
  isError: boolean;
  isComplete: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}

export default function ResearchAnimation({
  currentStage,
  stageMessage,
  isError,
  isComplete,
  errorMessage,
  onRetry,
}: Props) {
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [displayedMessage, setDisplayedMessage] = useState("");
  const charIndex = useRef(0);

  // Track completed stages based on current stage position
  useEffect(() => {
    if (currentStage && STAGE_ORDER.includes(currentStage)) {
      const stageIndex = STAGE_ORDER.indexOf(currentStage);
      setCompletedStages(STAGE_ORDER.slice(0, stageIndex));
    }
  }, [currentStage]);

  // Typewriter effect for the stage message
  useEffect(() => {
    if (!stageMessage) return;
    setDisplayedMessage("");
    charIndex.current = 0;
    const interval = setInterval(() => {
      charIndex.current++;
      setDisplayedMessage(stageMessage.slice(0, charIndex.current));
      if (charIndex.current >= stageMessage.length) {
        clearInterval(interval);
      }
    }, 18);
    return () => clearInterval(interval);
  }, [stageMessage]);

  const getNodeState = (
    stageId: string
  ): "completed" | "active" | "inactive" | "error" | "fallback-skipped" | "fallback-active" => {
    if (isError && stageId === currentStage) return "error";
    if (isComplete) return "completed";
    if (stageId === currentStage) {
      if (stageId === "fallback") return "fallback-active";
      return "active";
    }
    if (completedStages.includes(stageId)) return "completed";
    // Fallback: if we passed it without triggering
    if (
      stageId === "fallback" &&
      !completedStages.includes("fallback") &&
      STAGE_ORDER.indexOf(currentStage) > STAGE_ORDER.indexOf("fallback")
    ) {
      return "fallback-skipped";
    }
    return "inactive";
  };

  return (
    <div
      className="research-animation-wrapper"
      style={{
        maxHeight: isComplete ? "0px" : "400px",
        opacity: isComplete ? 0 : 1,
        overflow: "hidden",
        transition: "max-height 400ms ease-out, opacity 300ms ease-out",
        background: "#F7F7F5",
        border: "1px solid #E5E5E3",
        borderRadius: "8px",
        padding: "24px",
      }}
    >
      {/* CSS Styles */}
      <style>{`
        .ra-container {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 24px;
        }
        .ra-node-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          min-width: 60px;
        }
        .ra-node {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
          transition: all 0.3s ease;
          position: relative;
          z-index: 2;
          border: 1.5px solid transparent;
        }
        .ra-node.inactive {
          background: #F0EFEB;
          border-color: #E5E5E3;
          color: #A3A3A3;
        }
        .ra-node.completed {
          background: #F0EFEB;
          border-color: #0A0A0A;
          color: #0A0A0A;
        }
        .ra-node.completed::after {
          content: "";
          position: absolute;
          top: -2px;
          right: -2px;
          width: 8px;
          height: 8px;
          background: #0A0A0A;
          border-radius: 50%;
          border: 1px solid #F7F7F5;
        }
        .ra-node.active {
          background: #0A0A0A;
          border-color: #0A0A0A;
          color: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(10,10,10,0.12);
          animation: ra-pulse 0.9s ease-in-out infinite;
        }
        .ra-node.fallback-active {
          background: #FFF7ED;
          border-color: #EA580C;
          color: #EA580C;
        }
        .ra-node.error {
          background: #FEF2F2;
          border-color: #DC2626;
          color: #DC2626;
        }
        @keyframes ra-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(10,10,10,0.12); }
          50% { box-shadow: 0 0 0 8px rgba(10,10,10,0.06); }
        }

        .ra-label {
          margin-top: 8px;
          font-size: 12px;
          color: #6B6B6B;
          text-align: center;
          font-weight: 400;
        }
        .ra-label.active {
          color: #0A0A0A;
          font-weight: 500;
        }
        .ra-label.completed {
          color: #0A0A0A;
        }

        .ra-edge {
          width: 24px;
          height: 1px;
          background: #E5E5E3;
          margin-bottom: 24px;
          position: relative;
        }
        .ra-edge.completed {
          background: #0A0A0A;
        }
        .ra-edge.active::after {
          content: "";
          position: absolute;
          inset: 0;
          background: #0A0A0A;
          animation: ra-dash 1.5s linear infinite;
        }
        @keyframes ra-dash {
          0% { opacity: 0.2; transform: translateX(-100%); }
          50% { opacity: 1; transform: translateX(0); }
          100% { opacity: 0.2; transform: translateX(100%); }
        }

        .ra-status-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border-top: 1px solid #E5E5E3;
          padding-top: 16px;
        }
        .ra-status-text {
          font-size: 13px;
          color: #6B6B6B;
        }
        .ra-spinner {
          width: 14px;
          height: 14px;
          border: 1.5px solid transparent;
          border-top-color: #0A0A0A;
          border-radius: 50%;
          animation: ra-spin 0.6s linear infinite;
        }
        @keyframes ra-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Node pipeline */}
      <div className="ra-container">
        {STAGE_ORDER.map((stageId, i) => {
          const state = getNodeState(stageId);
          const icon = state === "active" ? (STAGE_LABELS[stageId]?.charAt(0) || "?") : (state === "completed" ? "✓" : (STAGE_LABELS[stageId]?.charAt(0) || "?"));

          const edgeCompleted = STAGE_ORDER.indexOf(currentStage) > i || isComplete;
          const edgeActive = STAGE_ORDER.indexOf(currentStage) === i && !isComplete && i > 0;

          return (
            <React.Fragment key={stageId}>
              {i > 0 && (
                <div
                  className={`ra-edge ${edgeCompleted ? "completed" : (edgeActive ? "active" : "")}`}
                />
              )}
              <div className="ra-node-group">
                <div className={`ra-node ${state}`}>{icon}</div>
                <div className={`ra-label ${state === "active" ? "active" : (state === "completed" ? "completed" : "")}`}>
                  {STAGE_LABELS[stageId]}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Status bar */}
      <div className="ra-status-bar">
        {isError ? (
          <div className="text-center">
            <p className="text-[#DC2626] text-[13px] font-medium mb-3">
              ⚠ {errorMessage || "Execution error"}
            </p>
            <button
              onClick={onRetry}
              className="px-4 py-1.5 bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626] text-[12px] font-semibold rounded-[6px] hover:bg-[#FEE2E2] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : currentStage ? (
          <>
            <div className="ra-spinner" />
            <span className="ra-status-text">{displayedMessage}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
