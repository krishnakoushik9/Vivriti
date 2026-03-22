"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import ApplicationTable from "@/components/ApplicationTable";
import ApplicationDetail from "@/components/ApplicationDetail";
import { useSocket } from "@/hooks/useSocket";
import { intelliCreditApi } from "@/lib/api";
import type { LoanApplication } from "@/lib/types";
import { Database, RefreshCw, PlusCircle, X } from "lucide-react";

import { isLoggedIn } from "@/lib/auth";
import { toast } from "sonner";

export default function Dashboard() {
  const router = useRouter();
  const [applications, setApplications] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createCompanyName, setCreateCompanyName] = useState("");
  const [createSector, setCreateSector] = useState("General");
  const [createCreditScore, setCreateCreditScore] = useState<number>(650);
  const [createGstScore, setCreateGstScore] = useState<number>(70);
  const [createError, setCreateError] = useState<string | null>(null);

  // Pipeline state
  const [isProcessing, setIsProcessing] = useState(false);

  const {
    isConnected,
    currentStage,
    progress,
    progressMessage,
    subscribeToApplication,
    unsubscribeFromApplication,
    clearEvents,
  } = useSocket((completedAppId) => {
    // On complete, refresh the specific application
    setIsProcessing(false);
    fetchApplication(completedAppId);
  });

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await intelliCreditApi.getApplications();
      setApplications(data);
    } catch (err) {
      console.error("Failed to fetch applications:", err);
      toast.error("Failed to fetch applications");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchApplication = useCallback(async (applicationId: string) => {
    try {
      const data = await intelliCreditApi.getApplication(applicationId);
      setApplications((prev) =>
        prev.map((app) => (app.applicationId === applicationId ? data : app))
      );
    } catch (err) {
      console.error("Failed to fetch application:", err);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    fetchApplications();
  }, [fetchApplications, router]);

  const handleSelectApplication = (appId: string) => {
    if (selectedId) {
      unsubscribeFromApplication(selectedId);
    }
    setSelectedId(appId);
    subscribeToApplication(appId);
    clearEvents();
  };

  const handleIngestMockData = async () => {
    try {
      setLoading(true);
      toast.message("Loading demo dataset…");
      await intelliCreditApi.ingestAll();
      await fetchApplications();
      toast.success("Demo dataset loaded");
    } catch (err) {
      console.error("Failed to ingest data:", err);
      toast.error("Ingest failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApplication = async () => {
    try {
      setCreateError(null);
      if (!createCompanyName.trim()) {
        setCreateError("Company name is required.");
        return;
      }
      const created = await intelliCreditApi.createApplication({
        companyName: createCompanyName.trim(),
        sector: createSector.trim() || "General",
        creditScore: createCreditScore,
        gstComplianceScore: createGstScore,
      });
      setShowCreate(false);
      setCreateCompanyName("");
      await fetchApplications();
      handleSelectApplication(created.applicationId);
    } catch (e: unknown) {
      const errObj = e as { response?: { data?: { message?: unknown; error?: unknown } }; message?: unknown };
      const msg =
        errObj?.response?.data?.message ||
        errObj?.response?.data?.error ||
        errObj?.message ||
        "Failed to create application";
      setCreateError(String(msg));
    }
  };

  const handleTriggerAnalysis = async () => {
    if (!selectedId) return;
    try {
      setIsProcessing(true);
      clearEvents();
      toast.message("Analysis started…");
      // Optimistic status update
      setApplications((prev) =>
        prev.map((app) =>
          app.applicationId === selectedId
            ? { ...app, status: "PROCESSING" }
            : app
        )
      );
      await intelliCreditApi.triggerAnalysis(
        selectedId,
        notesDrafts[selectedId] || ""
      );
      // Actual completion is handled by the WebSocket callback
    } catch (err) {
      console.error("Failed to trigger analysis:", err);
      setIsProcessing(false);
      toast.error("Failed to trigger analysis");
    }
  };

  const selectedApp = applications.find((a) => a.applicationId === selectedId);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar isConnected={isConnected} />

      <main className="pt-[96px] pb-[40px] px-[48px] flex flex-col gap-[32px]">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          <h1 className="text-[24px] font-[700] text-[var(--text-primary)] font-mono tracking-tight uppercase">
            Credit Intelligence Dashboard
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreate(true)}
              disabled={loading}
              className="bg-[var(--text-primary)] text-[var(--bg-base)] px-4 py-2 rounded-[4px] text-[12px] font-mono font-[700] hover:opacity-90 transition-colors flex items-center gap-2 uppercase tracking-wider"
            >
              <PlusCircle className="w-4 h-4" />
              Create Application
            </button>
            <button
              onClick={handleIngestMockData}
              disabled={loading}
              className="bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-default)] px-4 py-2 rounded-[4px] text-[12px] font-mono font-[700] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2 uppercase tracking-wider"
            >
              <Database className="w-4 h-4" />
              Load Demo Dataset
            </button>
            <button
              onClick={fetchApplications}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className={`flex flex-col lg:flex-row gap-[32px] ${selectedId ? "" : "justify-center"}`}>
          {/* Main Content Area */}
          {selectedId && selectedApp ? (
            <div className="w-full">
              <ApplicationDetail
                application={selectedApp}
                currentStage={currentStage}
                progress={progress}
                progressMessage={progressMessage}
                isProcessing={isProcessing}
                creditOfficerNotes={notesDrafts[selectedId] || ""}
                onNotesChange={(notes) =>
                  setNotesDrafts((prev) => ({ ...prev, [selectedId]: notes }))
                }
                onTriggerAnalysis={handleTriggerAnalysis}
                onApplicationUpdated={(updated) => {
                  setApplications((prev) =>
                    prev.map((a) => (a.applicationId === updated.applicationId ? updated : a))
                  );
                }}
                onBack={() => {
                  unsubscribeFromApplication(selectedId);
                  setSelectedId(undefined);
                }}
              />
            </div>
          ) : (
            <div className="w-full max-w-5xl mx-auto">
              <ApplicationTable
                applications={applications}
                loading={loading}
                onSelect={handleSelectApplication}
                selectedId={selectedId}
                isCompact={false}
              />
            </div>
          )}
        </div>


      </main>

      {/* Create Application Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-lg bg-[var(--bg-surface)] rounded-[4px] border border-[var(--border-default)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
              <div>
                <div className="text-[16px] font-[700] text-[var(--text-primary)] font-mono uppercase tracking-tight">Create Application</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1 font-mono uppercase">Enter real company name for web research.</div>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-5 bg-[var(--bg-elevated)]">
              <div>
                <label className="text-[10px] font-mono font-[700] text-[var(--text-muted)] uppercase tracking-[0.15em]">Company name</label>
                <input
                  value={createCompanyName}
                  onChange={(e) => setCreateCompanyName(e.target.value)}
                  placeholder="E.G., TATA MOTORS LIMITED"
                  className="mt-1.5 w-full rounded-[4px] border border-[var(--border-default)] px-3 py-2 text-[13px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] bg-[var(--bg-base)] transition-colors placeholder:text-[var(--border-default)]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-mono font-[700] text-[var(--text-muted)] uppercase tracking-[0.15em]">Sector</label>
                  <input
                    value={createSector}
                    onChange={(e) => setCreateSector(e.target.value)}
                    placeholder="AUTO / MANUFACTURING"
                    className="mt-1.5 w-full rounded-[4px] border border-[var(--border-default)] px-3 py-2 text-[13px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] bg-[var(--bg-base)] transition-colors placeholder:text-[var(--border-default)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono font-[700] text-[var(--text-muted)] uppercase tracking-[0.15em]">Credit score</label>
                  <input
                    type="number"
                    value={createCreditScore}
                    onChange={(e) => setCreateCreditScore(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-[4px] border border-[var(--border-default)] px-3 py-2 text-[13px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] bg-[var(--bg-base)] transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-mono font-[700] text-[var(--text-muted)] uppercase tracking-[0.15em]">GST compliance score (0–100)</label>
                <input
                  type="number"
                  value={createGstScore}
                  onChange={(e) => setCreateGstScore(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-[4px] border border-[var(--border-default)] px-3 py-2 text-[13px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] bg-[var(--bg-base)] transition-colors"
                />
              </div>
              {createError && (
                <div className="text-[11px] font-mono text-[var(--accent-red)] bg-[var(--accent-red-bg)] border border-[var(--accent-red-border)] rounded-[4px] p-3 uppercase">
                  {createError}
                </div>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  className="bg-[var(--bg-surface)] text-[var(--text-secondary)] px-4 py-2 rounded-[4px] text-[12px] font-mono font-[700] hover:text-[var(--text-primary)] transition-colors uppercase"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button
                  className="bg-[var(--text-primary)] text-[var(--bg-base)] px-4 py-2 rounded-[4px] text-[12px] font-mono font-[700] hover:opacity-90 transition-colors uppercase tracking-wider"
                  onClick={handleCreateApplication}
                >
                  Create & Select
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
