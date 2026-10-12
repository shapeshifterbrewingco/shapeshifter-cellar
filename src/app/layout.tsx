import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/layout/SiteNav";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/layout/Theme";

// Inter: a modern screen typeface with clear numerals, and the one the sales
// sheet already uses. Served from our own domain, so nothing loads from Google
// at runtime.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Shapeshifter Cellar",
  description: "Cellar management for Shapeshifter Brewing Co",
  applicationName: "Cellar",
  // Name under the icon and full-screen launch when added to an iPhone home screen
  appleWebApp: { capable: true, title: "Cellar", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#09434d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider>
          <SiteNav />
          <div className="md:pl-44 pt-14 md:pt-0 min-h-full">
            {children}
          </div>
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
