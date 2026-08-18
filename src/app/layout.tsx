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
  // يضبط الوضع قبل الرسم (بلا وميض): تفضيلٌ محفوظ، وإلا تلقائيّاً بحسب الوقت
  // (المغرب/العشاء ⟵ داكن). الفكرة ٦.
  const themeInit = `(function(){try{var p=localStorage.getItem('albrrak.theme')||'auto';var dark=p==='dark'||(p==='auto'&&new Date().getHours()>=17);document.documentElement.dataset.theme=dark?'dark':'light';}catch(e){}})();`;
  return (
    <html lang="ar" dir="rtl">
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
