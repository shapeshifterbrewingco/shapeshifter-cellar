import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteNav } from "@/components/layout/SiteNav";
import { Toaster } from "@/components/ui/sonner";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <SiteNav />
        <div className="md:pl-44 pt-14 md:pt-0 min-h-full">
          {children}
        </div>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
