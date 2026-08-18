"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { AppShell, Button, Card, ui, sp } from "@/components/ui";

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

const centered: React.CSSProperties = {
  minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
  background: ui.color.bg, fontFamily: ui.font, color: ui.color.text,
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

  if (err) return <main dir="rtl" style={centered}>{err}</main>;
  if (!me) return <main dir="rtl" style={centered}>جارٍ التحميل…</main>;

  return (
    <AppShell roles={me.roles} userName={me.name} activeHref="/me"
      title="صفحتي" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "التعلّم" }, { label: "صفحتي" }]}>
      <Card style={{ maxWidth: 480 }}>
        {me.student ? (
          <p style={{ margin: 0 }}>
            حالتك: <strong>{STATE_AR[me.student.state] ?? me.student.state}</strong>
          </p>
        ) : (
          <p style={{ margin: 0 }}>لا سجلّ طالب مرتبط بحسابك.</p>
        )}
      </Card>
      <Button
        variant="ghost"
        style={{ marginTop: sp(4) }}
        onClick={async () => {
          await supabaseBrowser().auth.signOut();
          window.location.href = "/login";
        }}
      >
        خروج
      </Button>
    </AppShell>
  );
}
