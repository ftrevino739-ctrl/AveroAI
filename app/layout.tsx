import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AveroAI — One space. Every intelligence.",
  description: "Un espacio de trabajo para conversar con distintos modelos de inteligencia artificial."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
