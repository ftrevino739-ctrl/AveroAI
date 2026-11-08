import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AveroAI — One space. Every intelligence.",
  description: "A calm, unified workspace for the world's leading AI models."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
