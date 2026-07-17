"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface Row {
  id: string;
  name: string;
  age: number | null;
  state: string;
  circle: string | null;
  guardian: string | null;
}

// تسميات الحالات (StudentState) — عرضٌ عربيّ، لا قاعدة عمل.
const STATE_AR: Record<string, string> = {
  APPLIED: "مُقدَّم",
  PENDING_ACCEPTANCE: "بانتظار القبول",
  WAITLISTED: "قائمة الانتظار",
  REJECTED: "مرفوض",
  AWAITING_READING_TEST: "بانتظار اختبار القراءة",
  IN_QAIDAH: "في القاعدة",
  AWAITING_PACE_TEST: "بانتظار اختبار السرعة",
  PACE_RETEST_SCHEDULED: "إعادة اختبار السرعة",
  IN_MARAQI: "في المراقي",
  COMPLETED: "أتمّ",
  WITHDRAWN: "منسحب",
};

const box: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "1.5rem",
  fontFamily: "system-ui, sans-serif",
};
const card: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: "0.75rem 1rem",
  marginBottom: 10,
};
const btn: React.CSSProperties = { padding: "0.4rem 0.8rem", cursor: "pointer", marginInlineStart: 6 };

async function token(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function AdminStudentsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const t = await token();
    if (!t) {
      window.location.href = "/login";
      return;
    }
    const auth = { authorization: `Bearer ${t}` };
    try {
      const [meRes, stRes] = await Promise.all([
        fetch("/api/me", { headers: auth }),
        fetch("/api/admin/students", { headers: auth }),
      ]);
      if (meRes.ok) {
        const data = (await meRes.json().catch(() => ({}))) as { roles?: string[] };
        setRoles(Array.isArray(data.roles) ? data.roles : []);
      }
      if (stRes.status === 403) {
        setErr("لا صلاحية — هذه الشاشة للكادر الإداري.");
        return;
      }
      if (!stRes.ok) {
        setErr("تعذّر جلب الطلاب.");
        return;
      }
      const data = (await stRes.json().catch(() => ({}))) as { students?: Row[] };
      setRows(Array.isArray(data.students) ? data.students : []);
    } catch {
      setErr("تعذّر الاتصال بالخادم.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revealId(id: string) {
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${id}/reveal-id`, {
      method: "POST",
      headers: { authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const { nationalId } = (await res.json()) as { nationalId: string };
      setRevealed((r) => ({ ...r, [id]: nationalId }));
    } else {
      setErr("تعذّر كشف رقم الهوية.");
    }
  }

  const canReveal = roles.includes("REGISTRAR") || roles.includes("SUPER_ADMIN");

  if (err) return <main style={box}>{err}</main>;
  if (!rows) return <main style={box}>جارٍ التحميل…</main>;

  return (
    <main style={box}>
      <h1>الطلاب المقبولون ({rows.length})</h1>
      {rows.length === 0 && <p>لا طلاب مقبولون بعد.</p>}
      {rows.map((r) => (
        <div key={r.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
            <strong>{r.name}</strong>
            <span style={{ opacity: 0.7 }}>{STATE_AR[r.state] ?? r.state}</span>
          </div>
          <div style={{ fontSize: "0.9rem", opacity: 0.85, marginTop: 4 }}>
            {r.age != null ? `العمر ${r.age}` : "العمر —"}
            {` • الحلقة ${r.circle ?? "لم تُسنَد"}`}
            {` • ولي الأمر ${r.guardian ?? "—"}`}
          </div>
          {canReveal && (
            <div style={{ marginTop: 8 }}>
              <button style={btn} onClick={() => revealId(r.id)}>
                {revealed[r.id] ? `الهوية: ${revealed[r.id]}` : "كشف رقم الهوية"}
              </button>
            </div>
          )}
        </div>
      ))}
    </main>
  );
}
