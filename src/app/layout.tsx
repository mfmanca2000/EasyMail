import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EasyMail",
  description: "Sort Hotmail into Important and Not Important, with a daily digest of what you skipped.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "EasyMail", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#0f172a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <Toaster richColors position="top-center" />
        <SwRegister />
      </body>
    </html>
  );
}
