import type { Metadata } from "next";
import "./globals.css";
import "./legacy.css";

export const metadata: Metadata = {
  title: "منصة حلقات البراك",
  description: "منصة إدارة حلقات التحفيظ",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
