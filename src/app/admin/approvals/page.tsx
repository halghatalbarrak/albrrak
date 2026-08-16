"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

// لوحة اعتماد المدير (الحكم ٧): اقتراحات انتقال المرحلة المعلَّقة — اعتماد/رفض.
// الاعتماد ← ينتقل الطالب للمرحلة التالية؛ الرفض يستلزم سببًا.

interface Item {
  approvalId: string;
  studentName: string;
  mainStageLabel: string;
  finalRank: string | null;
}
const RANK: Record<string, string> = { EXCELLENT: "تميّز", PASS: "اجتياز", FAIL: "رسوب" };

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const box: React.CSSProperties = { maxWidth: 820, margin: "0 auto", padding: "1.5rem", fontFamily: "system-ui, sans-serif" };
const card: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: 12 };

export default function ApprovalsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch("/api/approvals/stage-transitions", { headers: { authorization: `Bearer ${t}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      setItems(((await res.json()) as { items?: Item[] }).items ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(approvalId: string, decision: "APPROVED" | "REJECTED") {
    setMsg(null);
    const note = notes[approvalId]?.trim();
    if (decision === "REJECTED" && !note) { setMsg("الرفض يستلزم سببًا."); return; }
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/approvals/stage-transitions/${approvalId}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) { await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر حسم الاقتراح."); }
  }

  if (status === "loading") return <main dir="rtl" style={box}>…جارٍ التحميل</main>;
  if (status === "unauth")
    return <main dir="rtl" style={box}><p>تحتاج دخولًا كمدير.</p><a href="/login" style={{ color: "#1F5C3D" }}>دخول</a></main>;
  if (status === "error")
    return <main dir="rtl" style={box}><p style={{ color: "#b00020" }}>تعذّر التحميل. <button type="button" onClick={() => void load()}>إعادة</button></p></main>;

  return (
    <main dir="rtl" style={box}>
      <h1 style={{ fontSize: "1.4rem" }}>اعتماد انتقال المرحلة</h1>
      <p style={{ opacity: 0.6, fontSize: "0.9rem", marginTop: -6 }}>
        اعتمادُك ينقل الطالب للمرحلة الأصلية التالية. الرفض يستلزم سببًا.
      </p>
      {msg && <p style={{ color: "#b00020" }}>{msg}</p>}
      {items.length === 0 && <p style={{ opacity: 0.6 }}>لا اقتراحات معلَّقة الآن.</p>}
      {items.map((it) => (
        <div key={it.approvalId} style={card}>
          <div><strong>{it.studentName}</strong> — {it.mainStageLabel} · المرتبة: {it.finalRank ? RANK[it.finalRank] ?? it.finalRank : "—"}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              placeholder="سبب الرفض (عند الرفض)"
              value={notes[it.approvalId] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [it.approvalId]: e.target.value }))}
              style={{ flex: 1, minWidth: 160 }}
            />
            <button type="button" style={{ background: "#1F5C3D", color: "#fff", border: "none", borderRadius: 6, padding: "0.3rem 1rem" }} onClick={() => void decide(it.approvalId, "APPROVED")}>اعتماد</button>
            <button type="button" onClick={() => void decide(it.approvalId, "REJECTED")}>رفض</button>
          </div>
        </div>
      ))}
    </main>
  );
}
