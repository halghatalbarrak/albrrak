"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface Row {
  id: string;
  name: string;
  age: number;
  gender: string;
  nationality: string;
  schoolStage: string | null;
  guardianPhone: string;
  studentPhone: string | null;
  priorHifzJuz: number | null;
  status: string;
  createdAt: string;
}

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

export default function AdminApplicationsPage() {
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
    const [meRes, appsRes] = await Promise.all([
      fetch("/api/me", { headers: auth }),
      fetch("/api/applications", { headers: auth }),
    ]);
    if (meRes.ok) setRoles(((await meRes.json()) as { roles: string[] }).roles);
    if (appsRes.status === 403) {
      setErr("لا صلاحية — هذه الشاشة للمدير.");
      return;
    }
    if (!appsRes.ok) {
      setErr("تعذّر جلب الطلبات.");
      return;
    }
    const data = (await appsRes.json().catch(() => ({}))) as { applications?: Row[] };
    const list = Array.isArray(data.applications) ? data.applications : [];
    // الاستثناء أولاً: قائمة الانتظار قبل المعلّق، ثم الأقدم.
    const sorted = [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === "WAITLISTED" ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
    setRows(sorted);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: "accept" | "reject" | "waitlist") {
    const t = await token();
    if (!t) return;
    let note: string | undefined;
    if (decision === "reject") {
      note = window.prompt("سبب الرفض (إلزامي):") ?? "";
      if (!note.trim()) return;
    }
    const res = await fetch(`/api/applications/${id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) void load();
    else setErr("تعذّر تنفيذ القرار.");
  }

  async function revealId(id: string) {
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/applications/${id}/reveal-id`, {
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
      <h1>طلبات القيد ({rows.length})</h1>
      {rows.length === 0 && <p>لا طلبات معلّقة.</p>}
      {rows.map((r) => (
        <div key={r.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
            <strong>{r.name}</strong>
            <span style={{ opacity: 0.7 }}>
              {r.status === "WAITLISTED" ? "⏳ قائمة الانتظار" : "طلب جديد"}
            </span>
          </div>
          <div style={{ fontSize: "0.9rem", opacity: 0.85, marginTop: 4 }}>
            العمر {r.age} • {r.gender === "MALE" ? "ذكر" : "أنثى"} • {r.nationality}
            {r.schoolStage ? ` • ${r.schoolStage}` : ""} • ولي الأمر {r.guardianPhone}
            {r.studentPhone ? ` • جوال الطالب ${r.studentPhone}` : ""}
            {r.priorHifzJuz != null ? ` • حفظ ${r.priorHifzJuz} جزء` : ""}
          </div>
          <div style={{ marginTop: 8 }}>
            <button style={btn} onClick={() => decide(r.id, "accept")}>
              قبول
            </button>
            <button style={btn} onClick={() => decide(r.id, "reject")}>
              رفض بسبب
            </button>
            <button style={btn} onClick={() => decide(r.id, "waitlist")}>
              قائمة الانتظار
            </button>
            {canReveal && (
              <button style={btn} onClick={() => revealId(r.id)}>
                {revealed[r.id] ? `الهوية: ${revealed[r.id]}` : "كشف رقم الهوية"}
              </button>
            )}
          </div>
        </div>
      ))}
    </main>
  );
}
