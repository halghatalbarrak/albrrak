"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

// لوحة اعتماد المدير (الحكم ٧): اقتراحات انتقال المرحلة والتخرّج المعلَّقة — اعتماد/رفض.
// الاعتماد ← ينتقل الطالب / يتخرّج؛ الرفض يستلزم سببًا.

interface Transition {
  approvalId: string;
  studentName: string;
  mainStageLabel: string;
  finalRank: string | null;
}
interface Graduation {
  approvalId: string;
  studentName: string;
}
const RANK: Record<string, string> = { EXCELLENT: "تميّز", PASS: "اجتياز", FAIL: "رسوب" };

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const box: React.CSSProperties = { maxWidth: 820, margin: "0 auto", padding: "1.5rem", fontFamily: "system-ui, sans-serif" };
const card: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: 12 };
const approveBtn: React.CSSProperties = { background: "#1F5C3D", color: "#fff", border: "none", borderRadius: 6, padding: "0.3rem 1rem" };

export default function ApprovalsPage() {
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [graduations, setGraduations] = useState<Graduation[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const headers = { authorization: `Bearer ${t}` };
      const [rt, rg] = await Promise.all([
        fetch("/api/approvals/stage-transitions", { headers }),
        fetch("/api/approvals/graduations", { headers }),
      ]);
      if ([rt.status, rg.status].some((s) => s === 401 || s === 403)) { setStatus("unauth"); return; }
      if (!rt.ok || !rg.ok) { setStatus("error"); return; }
      setTransitions(((await rt.json()) as { items?: Transition[] }).items ?? []);
      setGraduations(((await rg.json()) as { items?: Graduation[] }).items ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(base: string, approvalId: string, decision: "APPROVED" | "REJECTED") {
    setMsg(null);
    const note = notes[approvalId]?.trim();
    if (decision === "REJECTED" && !note) { setMsg("الرفض يستلزم سببًا."); return; }
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`${base}/${approvalId}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) { await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر حسم الاقتراح."); }
  }

  function actions(base: string, approvalId: string) {
    return (
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          placeholder="سبب الرفض (عند الرفض)"
          value={notes[approvalId] ?? ""}
          onChange={(e) => setNotes((n) => ({ ...n, [approvalId]: e.target.value }))}
          style={{ flex: 1, minWidth: 160 }}
        />
        <button type="button" style={approveBtn} onClick={() => void decide(base, approvalId, "APPROVED")}>اعتماد</button>
        <button type="button" onClick={() => void decide(base, approvalId, "REJECTED")}>رفض</button>
      </div>
    );
  }

  if (status === "loading") return <main dir="rtl" style={box}>…جارٍ التحميل</main>;
  if (status === "unauth")
    return <main dir="rtl" style={box}><p>تحتاج دخولًا كمدير.</p><a href="/login" style={{ color: "#1F5C3D" }}>دخول</a></main>;
  if (status === "error")
    return <main dir="rtl" style={box}><p style={{ color: "#b00020" }}>تعذّر التحميل. <button type="button" onClick={() => void load()}>إعادة</button></p></main>;

  return (
    <main dir="rtl" style={box}>
      <h1 style={{ fontSize: "1.4rem" }}>الاعتمادات</h1>
      {msg && <p style={{ color: "#b00020" }}>{msg}</p>}

      <h2 style={{ fontSize: "1.1rem", marginTop: 18 }}>انتقال المرحلة</h2>
      <p style={{ opacity: 0.6, fontSize: "0.85rem", marginTop: -4 }}>اعتمادُك ينقل الطالب للمرحلة الأصلية التالية.</p>
      {transitions.length === 0 && <p style={{ opacity: 0.6 }}>لا اقتراحات انتقالٍ معلَّقة.</p>}
      {transitions.map((it) => (
        <div key={it.approvalId} style={card}>
          <div><strong>{it.studentName}</strong> — {it.mainStageLabel} · المرتبة: {it.finalRank ? RANK[it.finalRank] ?? it.finalRank : "—"}</div>
          {actions("/api/approvals/stage-transitions", it.approvalId)}
        </div>
      ))}

      <h2 style={{ fontSize: "1.1rem", marginTop: 24 }}>التخرّج</h2>
      <p style={{ opacity: 0.6, fontSize: "0.85rem", marginTop: -4 }}>اعتمادُك يخرّج الطالب ويُصدر شهادة الختم.</p>
      {graduations.length === 0 && <p style={{ opacity: 0.6 }}>لا اقتراحات تخرّجٍ معلَّقة.</p>}
      {graduations.map((it) => (
        <div key={it.approvalId} style={card}>
          <div><strong>{it.studentName}</strong> — اكتملت ثلاث جولاتٍ ناجحة</div>
          {actions("/api/approvals/graduations", it.approvalId)}
        </div>
      ))}
    </main>
  );
}
