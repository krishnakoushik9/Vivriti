"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart3,
  Shield,
  FileText,
  Brain,
  Sparkles,
  Lock,
  LogIn,
  ArrowRight,
  CheckCircle2,
  Gauge,
  ListChecks,
  FileSignature,
} from "lucide-react";
import { login as demoLogin, isLoggedIn } from "@/lib/auth";
import { TubesBackground } from "@/components/ui/TubesBackground";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("judge@vivriti.demo");
  const [password, setPassword] = useState("vivriti");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoggedIn()) router.replace("/");
  }, [router]);

  const credibilityTags = useMemo(
    () => [
      { icon: FileText, label: "Document-led underwriting" },
      { icon: Brain, label: "Explainable ML scoring" },
      { icon: Shield, label: "RBI-aligned decisioning" },
    ],
    []
  );

  const workflow = useMemo(
    () => [
      {
        icon: FileText,
        title: "Upload Borrower Documents",
        body: "Annual report, bank statement, GST returns, sanction letters. Text + scanned PDFs supported with OCR fallback.",
      },
      {
        icon: BarChart3,
        title: "Extract Financial Signals",
        body: "Structured fields and transaction-level features are extracted and persisted as evidence for review.",
      },
      {
        icon: Gauge,
        title: "Hybrid Risk Scoring",
        body: "Random Forest risk model + anomaly detection + qualitative overlay produce an auditable risk score.",
      },
      {
        icon: ListChecks,
        title: "Explainability + Policy Trace",
        body: "SHAP drivers (where available) plus deterministic RBI-aligned policy engine shows the exact rule applied.",
      },
      {
        icon: FileSignature,
        title: "Generate Credit Memo",
        body: "A structured CAM is rendered consistently, then exported to PDF/DOCX for internal approval workflows.",
      },
    ],
    []
  );

  const handleLogin = () => {
    setError(null);
    const r = demoLogin(email, password);
    if (!r.ok) {
      setError(r.error || "Login failed");
      return;
    }
    router.replace("/");
  };

  return (
    <TubesBackground className="text-white">
      {/* Top navigation */}
      <div className="relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center shadow-lg">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold tracking-tight text-lg">
                    Intelli<span className="text-blue-300">Credit</span>
                  </span>
                  <span className="text-[10px] font-bold text-blue-200 bg-white/10 px-2 py-0.5 rounded-full tracking-widest">
                    AI
                  </span>
                </div>
                <div className="text-[10px] text-slate-200/60 tracking-wider">
                  VIVRITI CAPITAL · CREDIT UNDERWRITING DEMO
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-emerald-900/30 border border-emerald-700/40 text-emerald-200 font-semibold">
                <Shield className="w-3.5 h-3.5" />
                RBI DL aligned
              </span>
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-3.5 py-2 text-sm font-semibold transition-all"
                onClick={() => {
                  const el = document.getElementById("demo-login");
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                Demo Login <ArrowRight className="w-4 h-4 text-blue-200" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* HERO (vertically centered) */}
      <section className="relative min-h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left */}
            <div className="max-w-xl">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white border border-white/10">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span className="text-xs font-semibold tracking-wide">Vivriti Hackathon · IntelliCredit</span>
                </div>

                <h1 className="mt-4 text-3xl sm:text-4xl lg:text-[44px] font-extrabold leading-tight tracking-tight">
                  Explainable Credit Intelligence
                  <span className="text-blue-300"> for SME Lending</span>
                </h1>

                <p className="mt-4 text-slate-200/80 text-sm sm:text-base leading-relaxed">
                  Upload financial documents, analyze borrower risk using hybrid ML + policy models, and generate an auditable Credit Approval Memo.
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {credibilityTags.map((t) => {
                    const Icon = t.icon;
                    return (
                      <span
                        key={t.label}
                        className="inline-flex items-center gap-2 rounded-full bg-black/30 border border-white/10 px-3 py-1.5 text-xs text-slate-100/90"
                      >
                        <Icon className="w-3.5 h-3.5 text-blue-200" />
                        <span className="font-semibold">{t.label}</span>
                      </span>
                    );
                  })}
                </div>

                <div className="mt-6 text-xs text-slate-200/70 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  Judges: use <span className="font-semibold text-slate-100">Create Application → Upload PDFs → Analyze → Export CAM</span>.
                </div>
              </motion.div>
            </div>

            {/* Right: Login card (bank internal tool style) */}
            <motion.div
              id="demo-login"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-xl lg:max-w-none mx-auto"
            >
              <div className="rounded-3xl border border-white/15 bg-black/40 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.8)]">
                <div className="px-6 py-5 border-b border-white/10 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Lock className="w-5 h-5 text-emerald-300" />
                      <h2 className="text-lg font-extrabold">Demo Login</h2>
                    </div>
                    <p className="mt-1 text-sm text-slate-200/70">
                      Local session for judging (no external identity provider).
                    </p>
                  </div>
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-900/30 border border-emerald-700/40 text-emerald-200 font-semibold">
                    RBI DL aligned
                  </span>
                </div>

                <div className="p-6">
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-200/80">Email</label>
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-300/60 focus:outline-none focus:ring-2 focus:ring-blue-300/40"
                        placeholder="judge@vivriti.demo"
                        autoComplete="email"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-200/80">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-300/60 focus:outline-none focus:ring-2 focus:ring-blue-300/40"
                        placeholder="vivriti"
                        autoComplete="current-password"
                      />
                    </div>
                    {error && (
                      <div className="text-sm text-red-200 bg-red-950/40 border border-red-900/50 rounded-2xl p-3">
                        {error}
                      </div>
                    )}

                    <button
                      className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 text-sm transition-all"
                      onClick={handleLogin}
                    >
                      <LogIn className="w-4 h-4" />
                      Enter Dashboard
                    </button>

                    <div className="mt-3 text-xs text-slate-200/70">
                      Demo creds:
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                          <div className="font-semibold text-slate-100">Judge</div>
                          <div className="font-mono">judge@vivriti.demo</div>
                          <div className="font-mono">vivriti</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                          <div className="font-semibold text-slate-100">Credit Officer</div>
                          <div className="font-mono">credit@vivriti.demo</div>
                          <div className="font-mono">vivriti</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* PRODUCT WORKFLOW */}
      <section className="relative py-14 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-200/60 font-bold">Workflow</div>
              <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">From documents to decision — in minutes</h2>
              <p className="mt-2 text-sm text-slate-200/70 max-w-2xl">
                Designed for credit teams: every signal is sourced, explainable, and mapped to deterministic policy outcomes.
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-5 gap-3">
            {workflow.map((s, idx) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.03, duration: 0.25 }}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4 hover:bg-white/7 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-blue-200" />
                    </div>
                    <div className="text-[10px] font-bold text-slate-200/60">STEP {idx + 1}</div>
                  </div>
                  <div className="mt-3 text-sm font-bold">{s.title}</div>
                  <div className="mt-2 text-xs text-slate-200/70 leading-relaxed">{s.body}</div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* EXPLAINABILITY */}
      <section className="relative py-14 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-200/60 font-bold">Explainability</div>
              <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">Every Credit Decision is Explainable</h2>
              <p className="mt-3 text-sm text-slate-200/70 leading-relaxed">
                Credit officers can validate decisions using a combination of feature drivers, anomaly signals, and a deterministic policy trace.
                No invented case numbers or penalty amounts — evidence is surfaced with source URLs and raw excerpts where applicable.
              </p>

              <div className="mt-6 space-y-3">
                {[
                  { icon: Brain, label: "SHAP drivers + narrative explanation" },
                  { icon: Gauge, label: "Risk score meter with signal breakdown" },
                  { icon: ListChecks, label: "Policy trace: rule applied + rationale" },
                ].map((i) => {
                  const Icon = i.icon;
                  return (
                    <div key={i.label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                      <Icon className="w-4 h-4 text-emerald-300" />
                      <div className="text-sm font-semibold text-slate-100/90">{i.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* UI placeholders */}
            <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
              <div className="text-sm font-extrabold">Explainability Preview</div>
              <div className="mt-1 text-xs text-slate-200/60">Representative UI cards shown in the dashboard after analysis.</div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-200/70 uppercase tracking-wider">Risk Score Meter</div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-700/40 text-blue-200 font-semibold">
                      Hybrid ML
                    </span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-2 w-[76%] bg-gradient-to-r from-emerald-500 to-blue-500" />
                  </div>
                  <div className="mt-2 text-xs text-slate-200/60">Score: 76/100 · Moderate risk</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-200/70 uppercase tracking-wider">Top SHAP Drivers</div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/30 border border-purple-700/40 text-purple-200 font-semibold">
                      Explainable
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {[
                      { label: "Interest Coverage", w: "w-[72%]", c: "bg-emerald-500" },
                      { label: "Debt-to-Equity", w: "w-[58%]", c: "bg-amber-500" },
                      { label: "GST Compliance", w: "w-[44%]", c: "bg-blue-500" },
                    ].map((r) => (
                      <div key={r.label}>
                        <div className="flex items-center justify-between text-xs text-slate-200/70">
                          <span className="font-semibold">{r.label}</span>
                          <span>impact</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-white/10 overflow-hidden">
                          <div className={`h-2 ${r.w} ${r.c}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-200/70 uppercase tracking-wider">Policy Trace Log</div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/30 border border-emerald-700/40 text-emerald-200 font-semibold">
                      Deterministic
                    </span>
                  </div>
                  <div className="mt-3 text-xs text-slate-200/70 font-mono rounded-xl border border-white/10 bg-black/20 p-3">
                    RULE-2: TIER-2 CONDITIONAL APPROVE
                    <div className="mt-1 text-slate-200/60">
                      Reason: ML score ≥ 70 and anomaly detected → ₹25L @ 15%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMPLIANCE */}
      <section className="relative py-14 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-xs uppercase tracking-wider text-slate-200/60 font-bold">Compliance</div>
          <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">Built for regulated credit workflows</h2>
          <p className="mt-2 text-sm text-slate-200/70 max-w-2xl">
            Strong separation between AI insights and deterministic decisioning, with persistence and export paths suitable for internal governance.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                icon: Shield,
                title: "Deterministic policy engine",
                body: "Final decision is rule-based, transparent, and consistent (policy trace surfaced in UI).",
              },
              {
                icon: ListChecks,
                title: "Full audit trail",
                body: "Every stage emits immutable logs to support review, escalation, and approval committee workflows.",
              },
              {
                icon: FileText,
                title: "Exportable CAM report",
                body: "Structured CAM rendered to markdown and exportable to PDF/DOCX for real-world sharing.",
              },
            ].map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.title} className="rounded-2xl border border-white/10 bg-black/30 p-5 hover:bg-white/7 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div className="text-sm font-extrabold">{c.title}</div>
                  </div>
                  <div className="mt-3 text-xs text-slate-200/70 leading-relaxed">{c.body}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-14 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-blue-900/50 via-black/40 to-emerald-900/40 p-6 sm:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-200/60 font-bold">Demo</div>
                <div className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">Try the Demo Workflow</div>
                <div className="mt-2 text-sm text-slate-200/70 max-w-2xl">
                  Launch the dashboard, create a real company application, upload PDFs, run analysis, and export the CAM.
                </div>
              </div>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 text-sm transition-all"
                onClick={handleLogin}
              >
                Launch Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-10 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-slate-200/70">
            <div>
              <div className="font-extrabold text-slate-100">IntelliCredit</div>
              <div className="mt-2 text-xs leading-relaxed">
                Built for Vivriti Hackathon. A professional demo of document-led credit underwriting with explainable intelligence and compliant decisioning.
              </div>
            </div>
            <div>
              <div className="font-bold text-slate-100 text-xs uppercase tracking-wider">Tech stack</div>
              <div className="mt-2 text-xs leading-relaxed font-mono">
                Next.js · Node BFF · Spring Boot · FastAPI · SHAP · IsolationForest · RandomForest
              </div>
            </div>
            <div>
              <div className="font-bold text-slate-100 text-xs uppercase tracking-wider">Team</div>
              <div className="mt-2 text-xs leading-relaxed">
                IntelliCredit demo build — optimized for judge review and verifiable outputs (sources + audit trail + exports).
              </div>
            </div>
          </div>
          <div className="mt-6 text-center text-[10px] text-white/20 tracking-widest select-none pointer-events-none">
            CLICK ANYWHERE TO RANDOMIZE · MOVE CURSOR TO INTERACT
          </div>
        </div>
      </footer>
    </TubesBackground>
  );
}
