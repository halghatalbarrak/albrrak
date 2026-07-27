"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";

// عدّاد الطلبات المعلّقة — ظاهرٌ فوق كل شاشة مدير (ثغرة أول طلب: طلبٌ يصل ولا أحد يعلم).
async function token(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const bar: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "0.5rem 1.5rem",
  fontFamily: "system-ui, sans-serif",
  display: "flex",
  gap: 16,
  alignItems: "center",
  flexWrap: "wrap",
  borderBottom: "1px solid #eee",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<number | null>(null);
  const [oldestDays, setOldestDays] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const t = await token();
      if (!t) return;
      try {
        const res = await fetch("/api/admin/pending-count", {
          headers: { authorization: `Bearer ${t}` },
        });
        if (!res.ok) return;
        const d = (await res.json()) as { pending?: number; oldestPendingAt?: string | null };
        setPending(typeof d.pending === "number" ? d.pending : 0);
        if (d.oldestPendingAt) {
          const days = Math.floor((Date.now() - Date.parse(d.oldestPendingAt)) / 86_400_000);
          setOldestDays(Number.isFinite(days) ? days : null);
        } else {
          setOldestDays(null);
        }
      } catch {
        /* العدّاد إضافةٌ لا تُعطِّل الشاشة إن فشل */
      }
    })();
  }, []);

  return (
    <>
      <nav style={bar}>
        <Link href="/admin/applications" style={{ fontWeight: 700 }}>
          الطلبات المعلّقة{pending !== null ? `: ${pending}` : ""}
        </Link>
        <Link href="/admin/students">الطلاب</Link>
        <Link href="/admin/circles">الحلقات</Link>
        <Link href="/admin/enrollment">الإسناد</Link>
        <Link href="/admin/lists">إدارة القوائم</Link>
        {oldestDays !== null && oldestDays >= 3 && (
          <span style={{ color: "#b00020" }}>⚠ طلبٌ معلّق منذ {oldestDays} أيام</span>
        )}
      </nav>
      {children}
    </>
  );
}
