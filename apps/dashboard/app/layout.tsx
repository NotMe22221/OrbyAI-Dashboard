import type { Metadata } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import { DashboardShell } from "@/components/DashboardShell";
import { VoiceSessionProvider } from "@/context/VoiceSessionContext";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["400", "500", "700"] });
const body = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-body", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Resident Secretary Dashboard",
  description: "Voice-native command center for Gmail, Calendar, YouTube, Slack, Linear, and Notion.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>
        <VoiceSessionProvider>
          <DashboardShell>{children}</DashboardShell>
        </VoiceSessionProvider>
      </body>
    </html>
  );
}



