import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppToaster } from "@/components/ui/toaster";

const fontSans = Inter({ variable: "--font-sans", subsets: ["latin"] });
const fontMono = Roboto_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Partion — Gestão Logística AV",
  description: "Plataforma de gestão logística e proteção patrimonial para eventos audiovisuais",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fontSans.variable} ${fontMono.variable}`}>
      <body className="antialiased">
        <TooltipProvider>
          {children}
          <AppToaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
