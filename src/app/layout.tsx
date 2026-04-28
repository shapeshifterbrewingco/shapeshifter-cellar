import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "@/components/layout/SiteNav";

export const metadata: Metadata = {
  title: "Shapeshifter Cellar",
  description: "Cellar management for Shapeshifter Brewing Co",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <SiteNav />
        <div className="md:pl-44 pt-20 md:pt-0 min-h-full">
          {children}
        </div>
      </body>
    </html>
  );
}
