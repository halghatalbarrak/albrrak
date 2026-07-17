"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface Circle {
  id: string;
  nameAr: string;
  timeSlot: string;
  gender: string;
  location: string | null;
  programKey: string;
  programNameAr: string;
}
interface Program {
  id: string;
  key: string;
  nameAr: string;
}

const box: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "1.5rem",
  fontFamily: "system-ui, sans-serif",
};
const input: React.CSSProperties = { padding: "0.4rem", fontSize: "1rem", fontFamily: "inherit" };
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 };
const btn: React.CSSProperties = { padding: "0.4rem 0.9rem", cursor: "pointer" };

async function token(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const SLOT_AR: Record<string, string> = { ASR: "العصر", MAGHRIB: "المغرب" };

export default function AdminCirclesPage() {
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) {
      window.location.href = "/login";
      return;
    }
    const res = await fetch("/api/admin/circles", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) {
      setErr("لا صلاحية — هذه الشاشة للمدير.");
      return;
    }
    if (!res.ok) {
      setErr("تعذّر جلب الحلقات.");
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { circles?: Circle[]; programs?: Program[] };
    setCircles(Array.isArray(data.circles) ? data.circles : []);
    setPrograms(Array.isArray(data.programs) ? data.programs : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/circles", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    });
    if (res.status === 201) {
      form.reset();
      setErr(null);
      void load();
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "تعذّر إنشاء الحلقة.");
    }
  }

  if (err && !circles) return <main style={box}>{err}</main>;
  if (!circles) return <main style={box}>جارٍ التحميل…</main>;

  return (
    <main style={box}>
      <h1>الحلقات ({circles.length})</h1>

      <form onSubmit={onSubmit} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>حلقة جديدة</h2>
        <label style={field}>
          <span>الاسم</span>
          <input style={input} name="nameAr" required />
        </label>
        <label style={field}>
          <span>البرنامج</span>
          <select style={input} name="programId" required defaultValue="">
            <option value="" disabled>
              اختر…
            </option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameAr}
              </option>
            ))}
          </select>
        </label>
        <label style={field}>
          <span>الوقت</span>
          <select style={input} name="timeSlot" required defaultValue="MAGHRIB">
            <option value="ASR">العصر</option>
            <option value="MAGHRIB">المغرب</option>
          </select>
        </label>
        <label style={field}>
          <span>الجنس</span>
          <select style={input} name="gender" required defaultValue="MALE">
            <option value="MALE">بنون</option>
            <option value="FEMALE">بنات</option>
          </select>
        </label>
        <label style={field}>
          <span>المكان (اختياري)</span>
          <input style={input} name="location" />
        </label>
        {err && <p style={{ color: "#b00020" }}>{err}</p>}
        <button style={{ ...btn, fontWeight: 700 }} type="submit">
          إنشاء
        </button>
      </form>

      {circles.length === 0 && <p>لا حلقات بعد — أنشئ الأولى.</p>}
      {circles.map((c) => (
        <div key={c.id} style={{ borderBottom: "1px solid #eee", padding: "0.5rem 0" }}>
          <strong>{c.nameAr}</strong>
          <span style={{ opacity: 0.8, fontSize: "0.9rem" }}>
            {` — ${c.programNameAr} • ${SLOT_AR[c.timeSlot] ?? c.timeSlot} • ${c.gender === "MALE" ? "بنون" : "بنات"}`}
            {c.location ? ` • ${c.location}` : ""}
          </span>
        </div>
      ))}
    </main>
  );
}
