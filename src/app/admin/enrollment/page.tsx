"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

// شاشة الإسناد: المدير يسند الطالب المقبول إلى حلقة، أو ينقله (بسجلٍّ تاريخي).
// بها تعمل شاشة الحضور فعليًّا — طلابٌ في حلقات.

interface StudentRow {
  id: string;
  name: string;
  state: string;
  circle: string | null;
}
interface CircleRow {
  id: string;
  nameAr: string;
  programKey: string;
}
interface HistoryRow {
  id: string;
  circleNameAr: string;
  startedAt: string;
  endedAt: string | null;
}

async function token(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
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
  marginBottom: 12,
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

export default function EnrollmentPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [circles, setCircles] = useState<CircleRow[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) {
      setErr("تحتاج دخولًا.");
      return;
    }
    const auth = { authorization: `Bearer ${t}` };
    const [rs, rc] = await Promise.all([
      fetch("/api/admin/students", { headers: auth }),
      fetch("/api/admin/circles", { headers: auth }),
    ]);
    if (rs.ok) setStudents(((await rs.json()) as { students?: StudentRow[] }).students ?? []);
    if (rc.ok) setCircles(((await rc.json()) as { circles?: CircleRow[] }).circles ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(studentId: string) {
    setMsg(null);
    setErr(null);
    const circleId = pick[studentId];
    if (!circleId) {
      setErr("اختر حلقة أولًا.");
      return;
    }
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${studentId}/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ circleId }),
    });
    if (res.ok) {
      setMsg("تمّ الإسناد/النقل.");
      await load();
    } else {
      const j = (await res.json()) as { error?: string };
      setErr(j.error ?? "تعذّر الإسناد.");
    }
  }

  async function showHistory(studentId: string) {
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${studentId}/enroll`, {
      headers: { authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const j = (await res.json()) as { history?: HistoryRow[] };
      setHistory((h) => ({ ...h, [studentId]: j.history ?? [] }));
    }
  }

  return (
    <main dir="rtl" style={box}>
      <h1 style={{ fontSize: "1.4rem" }}>إسناد الطلاب للحلقات</h1>
      {msg && <p style={{ color: "#1F5C3D" }}>{msg}</p>}
      {err && <p style={{ color: "#b00020" }}>{err}</p>}
      {students.length === 0 && <p style={{ opacity: 0.6 }}>لا طلاب.</p>}
      {students.map((s) => (
        <div key={s.id} style={card}>
          <strong>{s.name}</strong>
          <span style={{ opacity: 0.6 }}>الحلقة: {s.circle ?? "—"}</span>
          <select
            value={pick[s.id] ?? ""}
            onChange={(e) => setPick((p) => ({ ...p, [s.id]: e.target.value }))}
          >
            <option value="">— اختر حلقة —</option>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameAr}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void assign(s.id)}>
            {s.circle ? "نقل" : "إسناد"}
          </button>
          <button type="button" onClick={() => void showHistory(s.id)}>
            السجلّ
          </button>
          {history[s.id] && (
            <ul style={{ width: "100%", margin: 0, fontSize: "0.85rem", opacity: 0.8 }}>
              {history[s.id].map((h) => (
                <li key={h.id}>
                  {h.circleNameAr} — من {new Date(h.startedAt).toLocaleDateString("ar")}
                  {h.endedAt ? ` إلى ${new Date(h.endedAt).toLocaleDateString("ar")}` : " (نشط)"}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </main>
  );
}
