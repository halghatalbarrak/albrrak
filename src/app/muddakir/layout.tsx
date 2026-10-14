import type { Metadata, Viewport } from "next";

import { tMuddakir } from "@/i18n/ar/muddakir";

// شاشة الحافظ قابلةٌ للتثبيت وتعمل بلا إنترنت (§٨): manifest + لون السمة + نمط تطبيق iOS.
export const metadata: Metadata = {
  title: tMuddakir("programName"),
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: tMuddakir("programName"), statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#8a6d3b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function MuddakirLayout({ children }: { children: React.ReactNode }) {
  return children;
}
