"use client";

import React, { useState, useEffect } from "react";
import { 
  Search, 
  Database, 
  Globe, 
  Info, 
  AlertCircle, 
  ChevronRight, 
  ChevronLeft,
  Loader2,
  FileText,
  ShieldCheck
} from "lucide-react";
import Navbar from "@/components/Navbar";

// Define Types
interface MCARecord {
  CIN: string;
  CompanyName: string;
  CompanyROCcode: string;
  CompanyStatus?: string;
  [key: string]: any;
}

interface MCAStats {
  total_companies: number;
  roc_breakdown: Record<string, number>;
  error?: string;
}

// BFF is at port 3001. Using environment variable with fallback.
const BFF_URL = process.env.NEXT_PUBLIC_BFF_URL || "http://localhost:3001";
const MCA_API_URL = `${BFF_URL}/mca`;

export default function MCAPage() {
  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MCARecord[]>([]);
  const [searchSource, setSearchSource] = useState<"local" | "api" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<MCAStats | null>(null);
  const [searchLocalOnly, setSearchLocalOnly] = useState(false);
  
  // Live Browse State
  const [liveResults, setLiveResults] = useState<any[] | null>(null);
  const [liveTotal, setLiveTotal] = useState<number>(0);
  const [liveOffset, setLiveOffset] = useState(0);
  const [liveLimit, setLiveLimit] = useState(10);
  const [liveState, setLiveState] = useState("TG");
  const [isLiveLoading, setIsLiveLoading] = useState(false);
  const [responseTime, setResponseTime] = useState<number | null>(null);

  // UI state
  const [showApiInfo, setShowApiInfo] = useState(false);
  const [showLiveBrowse, setShowLiveBrowse] = useState(false);
  const [maskApiKey, setMaskApiKey] = useState(true);

  // Load stats on mount
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const resp = await fetch(`${MCA_API_URL}/stats`);
      const data = await resp.json();
      if (resp.ok) {
        setStats(data);
      } else if (resp.status === 404) {
        setError("Local dataset not found — please check BFF configuration.");
      }
    } catch (err) {
      console.error("Failed to fetch MCA stats", err);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const url = `${MCA_API_URL}/search?q=${encodeURIComponent(searchQuery)}${searchLocalOnly ? '&localOnly=true' : ''}`;
      const resp = await fetch(url);
      const data = await resp.json();
      
      if (resp.ok) {
        setSearchResults(data.results || []);
        setSearchSource(data.source);
        if (data.results?.length === 0) {
           setError("No companies found matching that criteria.");
        }
      } else {
        // Map specific error codes to user-friendly messages
        if (resp.status === 400) setError("Bad request — check your query");
        else if (resp.status === 403) setError("API key error — check credentials");
        else setError(data.error || "Search failed");
      }
    } catch (err) {
      setError("Communication failure: Could not reach BFF service.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLiveBrowse = async () => {
    setIsLiveLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${MCA_API_URL}/live?offset=${liveOffset}&limit=${liveLimit}&state=${liveState}`);
      const data = await resp.json();
      
      if (resp.status === 400) {
        setError("Bad request — check your query");
      } else if (resp.status === 403) {
        setError("API key error — check credentials");
      } else if (!resp.ok) {
        setError(data.error || "API Connection Failed");
      } else {
        setLiveResults(data.records || []);
        setLiveTotal(data.total || 0);
        setResponseTime(data.responseTimeMs);
      }
    } catch (err) {
      setError("Failed to fetch live data from BFF Gateway.");
    } finally {
      setIsLiveLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-mono selection:bg-[var(--accent-blue-bg)] selection:text-[var(--accent-blue)]">
      <Navbar isConnected={true} />
      
      <main className="pt-[100px] pb-24 px-[48px] max-w-[1400px] mx-auto">
        
        {/* Header Section */}
        <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[var(--border-subtle)] pb-8">
          <div>
            <div className="flex items-center gap-4 mb-3">
              <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[4px] shadow-sm">
                <ShieldCheck className="w-8 h-8 text-[var(--accent-blue)]" />
              </div>
              <div>
                <h1 className="text-3xl font-bold uppercase tracking-tighter text-[var(--text-primary)]">MCA — Company Master Data</h1>
                <div className="flex items-center gap-2 mt-1">
                   <span className="text-[10px] font-bold bg-[var(--bg-surface)] text-[var(--text-secondary)] px-2 py-0.5 rounded-[2px] uppercase tracking-wider border border-[var(--border-default)]">Unified Gateway</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            {stats && (
              <div className="flex items-center gap-3 px-4 py-2 rounded-[4px] border border-[var(--accent-green-border)] bg-[var(--accent-green-bg)] shadow-sm">
                <Database className="w-4 h-4 text-[var(--accent-green)]" />
                <span className="text-[11px] font-bold text-[var(--accent-green)] uppercase">
                   {stats.total_companies.toLocaleString()} companies in local Telangana dataset
                </span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-8 p-4 rounded-[4px] border border-[var(--accent-red-border)] bg-[var(--accent-red-bg)] text-[var(--accent-red)] flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-xs font-bold uppercase tracking-wider">{error}</p>
            </div>
            <button 
              onClick={() => setError(null)} 
              className="text-[10px] font-bold uppercase underline underline-offset-2 hover:text-[var(--text-primary)]"
            >
              Dismiss Alert
            </button>
          </div>
        )}

        {/* Search Bar Section */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[4px] p-8 mb-12 shadow-sm relative">
          <form onSubmit={handleSearch} className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-disabled)]" />
                <input 
                  type="text" 
                  placeholder="Search by Company Name or CIN Number..."
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[4px] py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-[var(--accent-blue)] transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button 
                type="submit"
                disabled={isLoading || !searchQuery.trim()}
                className="px-8 py-3.5 bg-[var(--text-primary)] text-[var(--bg-base)] rounded-[4px] text-xs font-bold uppercase tracking-widest hover:bg-[var(--text-secondary)] disabled:opacity-50 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                Execute Search
              </button>
            </div>
            
            <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <div className={`w-9 h-5 rounded-full p-1 transition-colors ${searchLocalOnly ? 'bg-[var(--accent-blue)]' : 'bg-[var(--border-default)]'}`}>
                    <div className={`w-3 h-3 bg-white rounded-full transition-transform duration-200 ${searchLocalOnly ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={searchLocalOnly} 
                    onChange={() => setSearchLocalOnly(!searchLocalOnly)}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                    Local Search Only
                  </span>
                </label>
                <div className="h-4 w-px bg-[var(--border-subtle)] hidden sm:block" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-disabled)] hidden sm:block">
                  Mode: {searchLocalOnly ? 'Strict Buffer Lookup' : 'Hybrid (Local + API Fallback)'}
                </span>
              </div>
              
              {searchSource && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-disabled)] font-bold uppercase tracking-widest">Source Identified:</span>
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-[4px] uppercase border tracking-wider ${
                    searchSource === 'local' 
                      ? 'bg-[var(--accent-green-bg)] border-[var(--accent-green-border)] text-[var(--accent-green)]' 
                      : 'bg-[var(--accent-blue-bg)] border-[var(--accent-blue-border)] text-[var(--accent-blue)]'
                  }`}>
                    {searchSource === 'local' ? 'Local Buffer' : 'Live Gateway'}
                  </span>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Results Table Section */}
        {searchResults.length > 0 && (
          <div className="mb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                Search Findings — {searchResults.length} Match{searchResults.length > 1 ? 'es' : ''}
              </h2>
            </div>
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[4px] overflow-x-auto shadow-sm">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-[var(--bg-base)] border-b border-[var(--border-default)]">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase text-[var(--text-secondary)] tracking-widest">CIN Identification</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase text-[var(--text-secondary)] tracking-widest">Entity Legal Name</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase text-[var(--text-secondary)] tracking-widest text-center">Jurisdiction (ROC)</th>
                    {searchSource === 'live-api' && (
                      <>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase text-[var(--text-secondary)] tracking-widest text-center">Status</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase text-[var(--text-secondary)] tracking-widest text-center">State</th>
                      </>
                    )}
                    <th className="px-6 py-4 text-[10px] font-bold uppercase text-[var(--text-secondary)] tracking-widest text-right">Data Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {searchResults.map((rec, i) => (
                    <tr key={i} className="hover:bg-[var(--bg-base)] transition-colors group">
                      <td className="px-6 py-5">
                        <span className="text-xs font-mono font-bold text-[var(--accent-blue)] bg-[var(--bg-base)] border border-[var(--border-subtle)] px-2 py-1 rounded-[2px]">
                          {rec.CIN}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[13px] font-bold uppercase tracking-tight group-hover:text-[var(--accent-blue)] transition-colors">
                          {rec.CompanyName}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase">
                          {rec.CompanyROCcode || "N/A"}
                        </span>
                      </td>
                      {searchSource === 'live-api' && (
                        <>
                          <td className="px-6 py-5 text-center">
                            <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase">
                              {(rec as any).CompanyStatus || "N/A"}
                            </span>
                          </td>
                          <td className="px-6 py-5 text-center">
                            <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase">
                              {(rec as any).StateCode || "N/A"}
                            </span>
                          </td>
                        </>
                      )}
                      <td className="px-6 py-5 text-right">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-[2px] uppercase border ${
                          searchSource === 'local' ? 'border-[var(--accent-green-border)] text-[var(--accent-green)]' : 'border-[var(--accent-blue-border)] text-[var(--accent-blue)]'
                        }`}>
                          {searchSource === 'local' ? 'LOCAL' : 'REMOTE'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Live Browse Section */}
        <div className="mb-8 border border-[var(--border-default)] rounded-[4px] overflow-hidden shadow-sm">
          <button 
            onClick={() => setShowLiveBrowse(!showLiveBrowse)}
            className="w-full flex items-center justify-between p-5 bg-[var(--bg-surface)] hover:bg-[var(--bg-base)] transition-all"
          >
            <div className="flex items-center gap-4">
              <Globe className={`w-5 h-5 ${showLiveBrowse ? 'text-[var(--accent-blue)]' : 'text-[var(--text-secondary)]'}`} />
              <span className="text-xs font-bold uppercase tracking-[0.1em]">Browse All India RoC Data (Live API Gateway)</span>
            </div>
            <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${showLiveBrowse ? 'rotate-90' : ''}`} />
          </button>
          
          {showLiveBrowse && (
            <div className="p-8 border-t border-[var(--border-default)] bg-[var(--bg-base)] animate-in slide-in-from-top-4 duration-300">
              <div className="flex flex-wrap items-end gap-6 mb-8 p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[4px]">
                <div className="flex flex-col gap-2.5">
                  <label className="text-[9px] font-black uppercase text-[var(--text-disabled)] tracking-widest">Target State Code</label>
                  <select 
                    value={liveState}
                    onChange={(e) => setLiveState(e.target.value)}
                    className="bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[4px] px-4 py-2 text-xs font-bold focus:outline-none focus:border-[var(--accent-blue)] shadow-sm"
                  >
                    <option value="TG">TG — Telangana</option>
                    <option value="AP">AP — Andhra Pradesh</option>
                    <option value="MH">MH — Maharashtra</option>
                    <option value="KA">KA — Karnataka</option>
                    <option value="DL">DL — Delhi</option>
                    <option value="TN">TN — Tamil Nadu</option>
                    <option value="GJ">GJ — Gujarat</option>
                    <option value="">All India (no filter)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2.5">
                  <label className="text-[9px] font-black uppercase text-[var(--text-disabled)] tracking-widest">Index Offset</label>
                  <input 
                    type="number" 
                    value={liveOffset}
                    onChange={(e) => setLiveOffset(parseInt(e.target.value))}
                    className="w-24 bg-[var(--bg-base)] border border-[var(--border-default)] rounded-[4px] px-4 py-2 text-xs font-bold focus:outline-none focus:border-[var(--accent-blue)] shadow-sm"
                  />
                </div>
                <button 
                  onClick={fetchLiveBrowse}
                  disabled={isLiveLoading}
                  className="px-8 py-2 bg-[var(--accent-blue)] text-white rounded-[4px] text-[10px] font-bold uppercase tracking-[0.2em] hover:brightness-110 disabled:opacity-50 transition-all flex items-center gap-3 shadow-md active:scale-95"
                >
                  {isLiveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                  Fetch Live Stream
                </button>
                {responseTime && (
                  <div className="ml-auto flex flex-col items-end">
                    <span className="text-[10px] font-black text-[var(--accent-green)] uppercase tracking-wider">
                      Latency: {responseTime}ms
                    </span>
                    <span className="text-[8px] text-[var(--text-disabled)] uppercase font-bold">Synchronized</span>
                  </div>
                )}
              </div>

              {liveResults === null ? (
                <div className="text-center py-16 border-2 border-dashed border-[var(--border-default)] rounded-[4px] bg-[var(--bg-surface)]">
                   <p className="text-[var(--text-disabled)] text-sm font-bold uppercase tracking-widest">No Active Synchronization</p>
                   <p className="text-[10px] text-[var(--text-disabled)] mt-1.5 uppercase">Awaiting instruction to bridge live gateway</p>
                </div>
              ) : liveResults.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-[var(--border-default)] rounded-[4px] bg-[var(--bg-surface)]">
                   <p className="text-[var(--accent-red)] text-sm font-bold uppercase tracking-widest">No Records Found</p>
                   <p className="text-[10px] text-[var(--text-disabled)] mt-1.5 uppercase">Zero matches for the current filter criteria</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                      Displaying {liveResults.length} of {liveTotal.toLocaleString()} records
                    </span>
                  </div>
                  <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[4px] overflow-x-auto shadow-inner">
                    <table className="w-full text-left border-collapse min-w-[900px]">
                      <thead>
                        <tr className="bg-[var(--bg-base)] border-b border-[var(--border-default)]">
                          {Object.keys(liveResults[0]).slice(0, 5).map((key) => (
                            <th key={key} className="px-6 py-4 text-[9px] font-black uppercase text-[var(--text-disabled)] tracking-widest border-r border-[var(--border-subtle)] last:border-0">{key.replace(/_/g, ' ')}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {liveResults.map((rec, i) => (
                          <tr key={i} className="hover:bg-[var(--bg-base)] transition-colors">
                            {Object.values(rec).slice(0, 5).map((val: any, j) => (
                              <td key={j} className="px-6 py-4 text-[10px] font-medium border-r border-[var(--border-subtle)] last:border-0 truncate max-w-[180px]">
                                {String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* API Info Panel */}
        <div className="border border-[var(--border-default)] rounded-[4px] overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
          <button 
            onClick={() => setShowApiInfo(!showApiInfo)}
            className="w-full flex items-center justify-between p-4 bg-[var(--bg-surface)] text-[var(--text-secondary)]"
          >
            <div className="flex items-center gap-3">
              <Info className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Technical Transparency & Citations</span>
            </div>
            <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${showApiInfo ? 'rotate-90' : ''}`} />
          </button>
          
          {showApiInfo && (
            <div className="p-8 border-t border-[var(--border-default)] bg-[var(--bg-base)] space-y-6 animate-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[9px] font-black uppercase text-[var(--text-disabled)] mb-2 tracking-widest flex items-center gap-2">
                       <Globe className="w-3 h-3" /> External API Endpoint
                    </h3>
                    <code className="text-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] p-3 rounded block break-all font-mono leading-relaxed">
                      https://api.data.gov.in/resource/4dbe5667-7b6b-41d7-82af-211562424d9a
                    </code>
                  </div>
                  <div>
                    <h3 className="text-[9px] font-black uppercase text-[var(--text-disabled)] mb-2 tracking-widest flex items-center justify-between">
                      <div className="flex items-center gap-2"><ShieldCheck className="w-3 h-3" /> Integrated API Key</div>
                      <button onClick={() => setMaskApiKey(!maskApiKey)} className="text-[8px] font-black underline uppercase hover:text-[var(--accent-blue)]">
                        {maskApiKey ? 'Reveal Key' : 'Mask Key'}
                      </button>
                    </h3>
                    <code className="text-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] p-3 rounded block font-mono">
                      {maskApiKey ? '579b464db66ec23bdd••••••••••••••••••••••••••••••••' : '579b464db66ec23bdd000001e55a2b7e099f45e96f171d7ee20c7b5a'}
                    </code>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[9px] font-black uppercase text-[var(--text-disabled)] mb-2 tracking-widest flex items-center gap-2">
                       <Database className="w-3 h-3" /> Local Buffer Configuration
                    </h3>
                    <p className="text-[10px] font-mono text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-default)] p-3 rounded truncate">
                      /home/krsna/Desktop/IITH-vivriti/MCA portaldownloadtelangana.csv
                    </p>
                  </div>
                  <div className="p-4 bg-[var(--accent-blue-bg)] border border-[var(--accent-blue-border)] rounded-[4px]">
                    <h3 className="text-[9px] font-black uppercase text-[var(--accent-blue)] mb-2 tracking-widest">Data Source Attribution</h3>
                    <p className="text-[10px] text-[var(--accent-blue)] font-bold leading-relaxed">
                      Ministry of Corporate Affairs (MCA) Central Repository. Synchronized via the Open Government Data (OGD) Platform India Gateway (data.gov.in).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
