import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "News Pulse — Topic-Clustered News Timeline",
  description: "Live news articles grouped by topic and visualised as a timeline.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body bg-ink text-paper min-h-screen">
        {children}
      </body>
    </html>
  );
}
