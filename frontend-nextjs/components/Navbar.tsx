"use client";

import React from "react";
import {
    Shield,
    BarChart3,
    Wifi,
    WifiOff,
    Bell,
    LogOut,
} from "lucide-react";
import Link from "next/link";
import { logout } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/theme";

interface NavbarProps {
    isConnected?: boolean;
}

export default function Navbar({ isConnected = false }: NavbarProps) {
    const router = useRouter();
    const { isDark, toggleTheme } = useTheme();

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--bg-base)] border-b border-[var(--border-subtle)] h-[56px] flex items-center px-[48px]">
            <div className="w-full flex items-center justify-between">
                {/* Logo + Brand */}
                <div className="flex items-center gap-6">
                    <Link href="/" className="flex items-center gap-3">
                        {/* Logo Mark: Simple geometric black */}
                        <div className="w-8 h-8 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[4px] flex items-center justify-center">
                            <BarChart3 className="w-5 h-5 text-[var(--text-primary)]" />
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[var(--text-primary)] font-mono font-[800] text-[15px] leading-none uppercase tracking-tight">
                                    IntelliCredit
                                </span>
                                <span className="text-[10px] font-mono font-medium text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-default)] px-1.5 py-0.5 rounded-[4px] leading-none">
                                    AI
                                </span>
                            </div>
                            <div className="text-[var(--text-disabled)] text-[10px] font-mono font-medium tracking-[0.1em] mt-0.5 uppercase">
                                VIVRITI CAPITAL · HYBRID CREDIT ENGINE
                            </div>
                        </div>
                    </Link>

                    {/* Nav Links */}
                    <div className="hidden lg:flex items-center gap-6 ml-4">
                        {[
                            { href: "/", label: "Dashboard", active: true },
                            { href: "/research", label: "Research Lab" },
                        ].map((link) => (
                            <Link
                                key={link.label}
                                href={link.href}
                                className={`text-[12px] font-mono font-medium transition-colors hover:text-[var(--text-primary)] ${link.active
                                    ? "text-[var(--text-primary)]"
                                    : "text-[var(--text-secondary)]"
                                    } h-[56px] flex items-center`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-4">
                    {/* Theme Toggle Button */}
                    <button
                        onClick={toggleTheme}
                        className="flex items-center gap-2 h-8 px-3 rounded-[4px] 
                            border transition-all duration-200"
                        style={{
                            background: "var(--bg-surface)",
                            borderColor: "var(--border-default)",
                        }}
                        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
                    >
                        {isDark ? (
                            <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                    stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round">
                                    <circle cx="12" cy="12" r="5" />
                                    <line x1="12" y1="1" x2="12" y2="3" />
                                    <line x1="12" y1="21" x2="12" y2="23" />
                                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                    <line x1="1" y1="12" x2="3" y2="12" />
                                    <line x1="21" y1="12" x2="23" y2="12" />
                                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                                </svg>
                                <span style={{
                                    fontSize: "10px",
                                    fontFamily: "monospace",
                                    fontWeight: 700,
                                    color: "var(--text-secondary)",
                                    letterSpacing: "0.1em"
                                }}>LIGHT</span>
                            </>
                        ) : (
                            <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                    stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round">
                                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                </svg>
                                <span style={{
                                    fontSize: "10px",
                                    fontFamily: "monospace",
                                    fontWeight: 700,
                                    color: "var(--text-secondary)",
                                    letterSpacing: "0.1em"
                                }}>DARK</span>
                            </>
                        )}
                    </button>

                    {/* Live Status Pill */}
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-[4px] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
                        <div className={`w-[6px] h-[6px] rounded-full animate-pulse ${isConnected ? "bg-[var(--accent-green)]" : "bg-[var(--accent-red)]"}`} />
                        <span className={`text-[11px] font-mono font-medium ${isConnected ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}>
                            {isConnected ? "LIVE" : "OFFLINE"}
                        </span>
                    </div>

                    {/* RBI Compliance Badge */}
                    <div className="hidden sm:flex items-center px-3 py-1 rounded-[4px] border border-[var(--accent-green-border)] bg-[var(--accent-green-bg)]">
                        <span className="text-[10px] font-mono font-medium text-[var(--accent-green)] uppercase tracking-wider">RBI DL Compliant</span>
                    </div>

                    {/* User Profile */}
                    <div className="flex items-center gap-3 pl-4 border-l border-[var(--border-subtle)]">
                        <div className="text-right hidden sm:block">
                            <div className="text-[var(--text-primary)] text-[11px] font-mono font-semibold leading-none uppercase">CREDIT OFFICER</div>
                            <div className="text-[var(--text-muted)] text-[10px] font-mono mt-0.5 uppercase">LEVEL 2</div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center">
                            <span className="text-[var(--text-primary)] text-[12px] font-mono font-bold uppercase">VC</span>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}
