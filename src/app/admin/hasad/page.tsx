"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

// شاشة الحصاد (م٤ج — §٨٫٧): المُسمِّع (ليس معلمه) يختار طالبًا أُعلنت جاهزيته، يسجّل
// أخطاء القراءة (موضعها بالصفحة، نوعها)، فيُحسب الحدّ (رسوب/نجاح) والصفحات الراسبة.
// حالات صريحة (تحميل/دخول/خطأ/فارغ)، لا انهيار.

interface Ready { studentId: string; name: string; stageId: string; stageLabel: string; hizb: number | null }
interface ErrRow { pageNo: string; errorType: string }
interface Outcome { result: "PASS" | "FAIL"; failedPages: number[]; attemptNo: number }

const ERROR_TYPES: { value: string; label: string }[] = [
  { value: "WORD", label: "كلمة" },
  { value: "LETTER", label: "حرف" },
  { value: "FORGOTTEN_AYAH", label: "نسيان آية" },
];

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const box: React.CSSProperties = { maxWidth: 820, margin: "0 auto", padding: "1.5rem", fontFamily: "system-ui, sans-serif" };
const card: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: 12 };

export default function HasadPage() {
  const [ready, setReady] = useState<Ready[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [pick, setPick] = useState<Ready | null>(null);
  const [rows, setRows] = useState<ErrRow[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch("/api/hasad/ready", { headers: { authorization: `Bearer ${t}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      setReady(((await res.json()) as { students?: Ready[] }).students ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function choose(r: Ready) {
    setPick(r); setRows([]); setOutcome(null); setMsg(null);
  }

  async function submit() {
    if (!pick) return;
    setMsg(null); setOutcome(null);
    const errors = rows
      .filter((r) => r.pageNo.trim() !== "")
      .map((r) => ({ pageNo: Number(r.pageNo), errorType: r.errorType }));
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/students/${pick.studentId}/hasad`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ stageId: pick.stageId, errors }),
    });
    if (res.ok) { setOutcome((await res.json()) as Outcome); await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر تسجيل الحصاد."); }
  }

  if (status === "loading") return <main dir="rtl" style={box}>…جارٍ التحميل</main>;
  if (status === "unauth")
    return <main dir="rtl" style={box}><p>تحتاج دخولًا كمُسمِّع.</p><a href="/login" style={{ color: "#1F5C3D" }}>دخول</a></main>;
  if (status === "error")
    return <main dir="rtl" style={box}><p style={{ color: "#b00020" }}>تعذّر التحميل. <button type="button" onClick={() => void load()}>إعادة</button></p></main>;

  return (
    <main dir="rtl" style={box}>
      <h1 style={{ fontSize: "1.4rem" }}>الحصاد</h1>
      <p style={{ opacity: 0.6, fontSize: "0.9rem", marginTop: -6 }}>
        سجّل أخطاء القراءة: خطآن في صفحةٍ واحدة ← راسب.
      </p>

      {msg && <p style={{ color: "#b00020" }}>{msg}</p>}

      {ready.length === 0 && !pick && <p style={{ opacity: 0.6 }}>لا طلاب جاهزين للحصاد الآن.</p>}

      {!pick && ready.map((r) => (
        <div key={`${r.studentId}-${r.stageId}`} style={card}>
          <strong>{r.name}</strong> — {r.stageLabel}
          {r.hizb != null ? ` · الحزب ${r.hizb}` : ""}
          <button type="button" style={{ marginInlineStart: 12 }} onClick={() => choose(r)}>ابدأ الحصاد</button>
        </div>
      ))}

      {pick && (
        <div style={card}>
          <div style={{ marginBottom: 10 }}>
            <strong>{pick.name}</strong> — {pick.stageLabel}
            <button type="button" style={{ marginInlineStart: 12 }} onClick={() => setPick(null)}>رجوع</button>
          </div>

          {outcome ? (
            <div style={{ padding: "0.5rem", background: outcome.result === "FAIL" ? "#f6dede" : "#DDEAE1", borderRadius: 6 }}>
              النتيجة: <strong>{outcome.result === "FAIL" ? "راسب" : "ناجح"}</strong> · المحاولة {outcome.attemptNo}
              {outcome.result === "FAIL" && (
                <div style={{ marginTop: 4, fontSize: "0.9rem" }}>الصفحات الراسبة: {outcome.failedPages.join("، ")}</div>
              )}
            </div>
          ) : (
            <>
              <table style={{ width: "100%", fontSize: "0.9rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr><th style={{ textAlign: "start" }}>الصفحة</th><th style={{ textAlign: "start" }}>النوع</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <input type="number" min={1} value={r.pageNo} style={{ width: 80 }}
                          onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, pageNo: e.target.value } : x))} />
                      </td>
                      <td>
                        <select value={r.errorType}
                          onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, errorType: e.target.value } : x))}>
                          {ERROR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                      <td><button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>حذف</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setRows((rs) => [...rs, { pageNo: "", errorType: "WORD" }])}>+ خطأ</button>
                <button type="button" style={{ background: "#1F5C3D", color: "#fff", border: "none", borderRadius: 6, padding: "0.3rem 1rem" }} onClick={() => void submit()}>
                  سجّل الحصاد ({rows.filter((r) => r.pageNo.trim() !== "").length} خطأ)
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
