import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import "./legacy.css";
import { ImpersonationBar } from "@/components/ImpersonationBar";
import { RegisterSW } from "@/components/pwa/RegisterSW";
import { InstallButton } from "@/components/pwa/InstallButton";
import { LOCALE_COOKIE, resolveLocale, dirFor } from "@/lib/locale";

export const metadata: Metadata = {
  title: "منصة حلقات البراك",
  description: "منصة إدارة حلقات التحفيظ",
  manifest: "/app.webmanifest",
  appleWebApp: { capable: true, title: "حلقات البراك", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/png/logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#5B3E96",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // يضبط الوضع قبل الرسم (بلا وميض): تفضيلٌ محفوظ، وإلا تلقائيّاً بحسب الوقت
  // (المغرب/العشاء ⟵ داكن). الفكرة ٦.
  const themeInit = `(function(){try{var p=localStorage.getItem('albrrak.theme')||'auto';var dark=p==='dark'||(p==='auto'&&new Date().getHours()>=17);document.documentElement.dataset.theme=dark?'dark':'light';}catch(e){}})();`;
  // التوطين (PR-1): اللغة والاتّجاه من cookie اللغة (العربية افتراضيّاً RTL) — خادميّاً بلا وميض.
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <RegisterSW />
        <ImpersonationBar />
        {children}
        <InstallButton />
      </body>
    </html>
  );
}
