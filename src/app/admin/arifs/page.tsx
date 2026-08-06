"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

// شاشة العرفاء (الحكم ٨): المعلّم يعيّن طالباً من حلقته عريفاً، أو يعزله. العريف يُسمِّع
// الترسيخ/المراجعة بإسناده، لا الحفظ الجديد ولا الاختبار. حالات صريحة، لا انهيار.

interface Circle { id: string; nameAr: string }
interface Arif { arifUserId: string; name: string }
interface Candidate { userId: string; name: string }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const box: React.CSSProperties = { maxWidth: 760, margin: "0 auto", padding: "1.5rem", fontFamily: "system-ui, sans-serif" };
const row: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  border: "1px solid #ccc", borderRadius: 8, padding: "0.5rem 0.9rem", marginBottom: 8,
};

export default function ArifsPage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState("");
  const [arifs, setArifs] = useState<Arif[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch("/api/attendance/circles", { headers: { authorization: `Bearer ${t}` } });
      if (res.ok) setCircles(((await res.json()) as { circles?: Circle[] }).circles ?? []);
      else if (res.status === 401 || res.status === 403) setStatus("unauth");
    })();
  }, []);

  const load = useCallback(async () => {
    if (!circleId) return;
    setStatus("loading"); setMsg(null);
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch(`/api/circles/${circleId}/arifs`, { headers: { authorization: `Bearer ${t}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      const j = (await res.json()) as { arifs?: Arif[]; candidates?: Candidate[] };
      setArifs(j.arifs ?? []); setCandidates(j.candidates ?? []);
      setStatus("ready");
    } catch { setStatus("error"); }
  }, [circleId]);

  useEffect(() => { void load(); }, [load]);

  async function act(arifUserId: string, action: "appoint" | "dismiss") {
    setMsg(null);
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/circles/${circleId}/arifs`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ arifUserId, action }),
    });
    if (res.ok) { setMsg(action === "appoint" ? "عُيّن عريفًا." : "عُزل."); await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر."); }
  }

  if (status === "unauth")
    return <main dir="rtl" style={box}><p>تحتاج دخولًا.</p><a href="/login" style={{ color: "#1F5C3D" }}>دخول</a></main>;

  return (
    <main dir="rtl" style={box}>
      <h1 style={{ fontSize: "1.4rem" }}>العرفاء</h1>
      <p style={{ opacity: 0.6, fontSize: "0.9rem", marginTop: -6 }}>
        العريف يُسمِّع الترسيخ والمراجعة بإسنادك ومسؤوليتك — لا الحفظ الجديد ولا الاختبار.
      </p>

      <select value={circleId} onChange={(e) => setCircleId(e.target.value)} style={{ marginBottom: 14 }}>
        <option value="">— اختر حلقة —</option>
        {circles.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
      </select>

      {msg && <p style={{ color: "#1F5C3D" }}>{msg}</p>}
      {status === "loading" && <p style={{ opacity: 0.6 }}>…جارٍ التحميل</p>}
      {status === "error" && <p style={{ color: "#b00020" }}>تعذّر التحميل. <button type="button" onClick={() => void load()}>إعادة</button></p>}
      {status === "idle" && <p style={{ opacity: 0.6 }}>اختر حلقةً لإدارة عرفائها.</p>}

      {status === "ready" && (
        <>
          <h2 style={{ fontSize: "1.05rem" }}>العرفاء النشطون</h2>
          {arifs.length === 0 && <p style={{ opacity: 0.6 }}>لا عرفاء بعد.</p>}
          {arifs.map((a) => (
            <div key={a.arifUserId} style={row}>
              <strong>{a.name}</strong>
              <button type="button" onClick={() => void act(a.arifUserId, "dismiss")}>عزل</button>
            </div>
          ))}

          <h2 style={{ fontSize: "1.05rem", marginTop: 16 }}>طلاب الحلقة (للتعيين — أنت تقدّر تقدّمهم)</h2>
          {candidates.length === 0 && <p style={{ opacity: 0.6 }}>لا طلاب متاحين.</p>}
          {candidates.map((c) => (
            <div key={c.userId} style={row}>
              <span>{c.name}</span>
              <button type="button" onClick={() => void act(c.userId, "appoint")}>عيّن عريفًا</button>
            </div>
          ))}
        </>
      )}
    </main>
  );
}
