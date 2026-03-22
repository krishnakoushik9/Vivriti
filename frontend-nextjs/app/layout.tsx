import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/lib/theme";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "IntelliCredit | Vivriti Capital — Hybrid Credit Decision Intelligence Engine",
  description:
    "AI-powered Credit Appraisal Memo generation with Hybrid ML Risk Scoring, Anomaly Detection, and Deterministic Policy Engine. Built for Vivriti Capital IITH Hackathon.",
  keywords: ["credit", "CAM", "AI", "machine learning", "Vivriti Capital", "NBFC", "fintech", "risk"],
  authors: [{ name: "Vivriti Capital IntelliCredit Team" }],
  openGraph: {
    title: "IntelliCredit — Hybrid Credit Decision Intelligence Engine",
    description: "Automate Credit Appraisal Memos with AI-powered risk scoring aligned with RBI Digital Lending Guidelines.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
