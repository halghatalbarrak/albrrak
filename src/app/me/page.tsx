"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface MyPage {
  userId: string;
  name: string;
  roles: string[];
  student: { id: string; state: string } | null;
}

const STATE_AR: Record<string, string> = {
  APPLIED: "قيد مُقدَّم",
  PENDING_ACCEPTANCE: "بانتظار القبول",
  WAITLISTED: "قائمة الانتظار",
  AWAITING_READING_TEST: "بانتظار اختبار القراءة",
  IN_QAIDAH: "القاعدة المدنية",
  AWAITING_PACE_TEST: "بانتظار اختبار المقطع",
  PACE_RETEST_SCHEDULED: "يُعاد اختباره",
  IN_MARAQI: "مراقي",
  COMPLETED: "أتمّ",
  WITHDRAWN: "منسحب",
};

const box: React.CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  padding: "2rem 1.5rem",
  fontFamily: "system-ui, sans-serif",
};

export default function MePage() {
  const [me, setMe] = useState<MyPage | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabaseBrowser().auth.getSession();
        if (!session) {
          window.location.href = "/login";
          return;
        }
        const res = await fetch("/api/me", {
          headers: { authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          setErr("تعذّر جلب صفحتك.");
          return;
        }
        setMe((await res.json()) as MyPage);
      } catch {
        setErr("تعذّر الاتصال بالخادم.");
      }
    })();
  }, []);

  if (err) return <main style={box}>{err}</main>;
  if (!me) return <main style={box}>جارٍ التحميل…</main>;

  return (
    <main style={box}>
      <h1>مرحبًا، {me.name}</h1>
      {me.student ? (
        <p>
          حالتك: <strong>{STATE_AR[me.student.state] ?? me.student.state}</strong>
        </p>
      ) : (
        <p>لا سجلّ طالب مرتبط بحسابك.</p>
      )}
      <button
        onClick={async () => {
          await supabaseBrowser().auth.signOut();
          window.location.href = "/login";
        }}
        style={{ marginTop: 16, padding: "0.5rem 1rem", cursor: "pointer" }}
      >
        خروج
      </button>
    </main>
  );
}
