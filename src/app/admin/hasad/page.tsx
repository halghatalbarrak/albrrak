"use client";
/* eslint-disable @next/next/no-img-element -- صورة الوجه أصلٌ ثابتٌ من CDN (WebP دقّة منخفضة)؛ لا يحتاج تحسين next/image. */

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { gradeHizbHarvest } from "@/server/hasad-grading";

// شاشة الحصاد الكاملة (الحكم ٧ — نموذج محمد): صورة الوجه + تظليل الآية من المضلّعات،
// زرّا «خطأ/تردّد»، عدّاد أخطاءٍ تراكميّ على الحزب، عدّاد تردّدٍ على الوجه (يُصفَّر بالانتقال)،
// زرّ «الوجه التالي»، والمرتبة لحظةً بلحظة (النظام يحكم). خطأ ⟵ قائمة آيات الوجه فيُختار.

interface Ready { studentId: string; name: string; stageId: string; stageLabel: string; hizb: number | null }
interface Ayah { surah: number; ayah: number }
interface FaceData { page: number; imageUrl: string; ayahs: Ayah[]; polygonsUrl: string; polygonViewBox: { width: number; height: number } }
interface Polygon { surahNumber: number; ayahNumber: number; polygon: string }
interface Err { pageNo: number; errorType: "WORD" | "LETTER" | "FORGOTTEN_AYAH"; surah: number; ayah: number }

const RANK: Record<string, string> = { EXCELLENT: "تميّز", PASS: "اجتياز", FAIL: "رسوب" };
const RANK_BG: Record<string, string> = { EXCELLENT: "#1F5C3D", PASS: "#8a6d1f", FAIL: "#b00020" };
const ETYPE: { v: Err["errorType"]; l: string }[] = [
  { v: "WORD", l: "كلمة" }, { v: "LETTER", l: "حرف" }, { v: "FORGOTTEN_AYAH", l: "نسيان آية" },
];

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const box: React.CSSProperties = { maxWidth: 520, margin: "0 auto", padding: "1rem", fontFamily: "system-ui, sans-serif" };
const card: React.CSSProperties = { border: "1px solid #ccc", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: 10 };
const chip: React.CSSProperties = { padding: "0.25rem 0.6rem", borderRadius: 999, fontSize: "0.85rem", color: "#fff", fontWeight: 700 };
const btn: React.CSSProperties = { padding: "0.5rem 1rem", borderRadius: 8, border: "1px solid #1F5C3D", background: "#fff", cursor: "pointer" };

export default function HasadPage() {
  const [ready, setReady] = useState<Ready[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [pick, setPick] = useState<Ready | null>(null);
  const [pages, setPages] = useState<number[]>([]);
  const [faceIdx, setFaceIdx] = useState(0);
  const [face, setFace] = useState<FaceData | null>(null);
  const [polys, setPolys] = useState<Polygon[]>([]);
  const [errors, setErrors] = useState<Err[]>([]);
  const [hesitations, setHesitations] = useState<{ faceNo: number }[]>([]);
  const [picking, setPicking] = useState(false);
  const [etype, setEtype] = useState<Err["errorType"]>("WORD");
  const [outcome, setOutcome] = useState<{ rank: string; totalErrors: number } | null>(null);
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
    } catch { setStatus("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadFace = useCallback(async (page: number) => {
    setFace(null); setPolys([]); setPicking(false);
    const t = await token(); if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/mushaf/faces/${page}`, { headers: { authorization: `Bearer ${t}` } });
    if (!res.ok) { setMsg("تعذّر تحميل الوجه."); return; }
    const fd = (await res.json()) as FaceData;
    setFace(fd);
    try { setPolys((await (await fetch(fd.polygonsUrl)).json()) as Polygon[]); } catch { setPolys([]); }
  }, []);

  async function choose(r: Ready) {
    setMsg(null); setOutcome(null); setErrors([]); setHesitations([]); setFaceIdx(0); setPick(r);
    const t = await token(); if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/hasad/faces/${r.stageId}`, { headers: { authorization: `Bearer ${t}` } });
    if (!res.ok) { setMsg("تعذّر تحميل أوجه الحزب."); setPick(null); return; }
    const hf = (await res.json()) as { pages: number[] };
    setPages(hf.pages);
    if (hf.pages.length) await loadFace(hf.pages[0]);
  }

  function reset() { setPick(null); setPages([]); setFace(null); setPolys([]); setErrors([]); setHesitations([]); setOutcome(null); setPicking(false); }

  const page = pages[faceIdx];
  const grade = gradeHizbHarvest({
    errors: errors.map((e) => ({ faceNo: e.pageNo, surah: e.surah, ayah: e.ayah, errorType: e.errorType })),
    hesitations,
  });
  const faceHes = hesitations.filter((h) => h.faceNo === page).length;
  const shaded = new Set(errors.filter((e) => e.pageNo === page).map((e) => `${e.surah}:${e.ayah}`));

  function addError(a: Ayah) {
    setErrors((es) => [...es, { pageNo: page, errorType: etype, surah: a.surah, ayah: a.ayah }]);
    setPicking(false);
  }
  function addHesitation() { setHesitations((hs) => [...hs, { faceNo: page }]); }

  async function next() {
    if (faceIdx < pages.length - 1) { const i = faceIdx + 1; setFaceIdx(i); await loadFace(pages[i]); }
    else await submit();
  }
  async function submit() {
    if (!pick) return;
    const t = await token(); if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/students/${pick.studentId}/hasad`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ stageId: pick.stageId, errors, hesitations }),
    });
    if (res.ok) { const o = await res.json() as { rank: string; totalErrors: number }; setOutcome(o); await load(); }
    else { const j = await res.json() as { error?: string }; setMsg(j.error ?? "تعذّر تسجيل الحصاد."); }
  }

  if (status === "loading") return <main dir="rtl" style={box}>…جارٍ التحميل</main>;
  if (status === "unauth") return <main dir="rtl" style={box}><p>تحتاج دخولًا كمُسمِّع.</p><a href="/login" style={{ color: "#1F5C3D" }}>دخول</a></main>;
  if (status === "error") return <main dir="rtl" style={box}><p style={{ color: "#b00020" }}>تعذّر التحميل. <button type="button" onClick={() => void load()}>إعادة</button></p></main>;

  // نتيجة نهائية
  if (outcome) return (
    <main dir="rtl" style={box}>
      <h1 style={{ fontSize: "1.3rem" }}>نتيجة الحصاد</h1>
      <div style={{ ...card, background: RANK_BG[outcome.rank], color: "#fff" }}>
        المرتبة: <strong>{RANK[outcome.rank]}</strong> · مجموع الأخطاء: {outcome.totalErrors}
      </div>
      <button type="button" style={btn} onClick={reset}>حصادٌ جديد</button>
    </main>
  );

  // اختيار الطالب
  if (!pick) return (
    <main dir="rtl" style={box}>
      <h1 style={{ fontSize: "1.3rem" }}>الحصاد</h1>
      {msg && <p style={{ color: "#b00020" }}>{msg}</p>}
      {ready.length === 0 && <p style={{ opacity: 0.6 }}>لا طلاب جاهزين للحصاد الآن.</p>}
      {ready.map((r) => (
        <div key={`${r.studentId}-${r.stageId}`} style={card}>
          <strong>{r.name}</strong> — {r.stageLabel}{r.hizb != null ? ` · الحزب ${r.hizb}` : ""}
          <button type="button" style={{ ...btn, marginInlineStart: 12 }} onClick={() => void choose(r)}>ابدأ</button>
        </div>
      ))}
    </main>
  );

  // شاشة الحصاد
  const vb = face?.polygonViewBox ?? { width: 345, height: 550 };
  return (
    <main dir="rtl" style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
        <div><strong>{pick.name}</strong> · {pick.stageLabel}{pick.hizb != null ? ` · حزب ${pick.hizb}` : ""}</div>
        <span style={{ ...chip, background: RANK_BG[grade.rank] }}>{RANK[grade.rank]}</span>
      </div>
      <div style={{ display: "flex", gap: 10, fontSize: "0.9rem", marginBottom: 8, flexWrap: "wrap" }}>
        <span>الوجه {faceIdx + 1} من {pages.length}{page != null ? ` (ص${page})` : ""}</span>
        <span>· أخطاء الحزب: <strong>{grade.totalErrors}</strong></span>
        <span>· تردّد الوجه: <strong>{faceHes}</strong>{faceHes >= 3 ? " (=خطأ)" : ""}</span>
      </div>
      {msg && <p style={{ color: "#b00020" }}>{msg}</p>}

      {/* صورة الوجه + طبقة تظليل الآيات */}
      <div style={{ position: "relative", width: "min(92vw, 400px)", margin: "0 auto", border: "1px solid #999", background: "#fff" }}>
        {face
          ? <img src={face.imageUrl} alt={`وجه ${page}`} style={{ width: "100%", display: "block" }} />
          : <div style={{ padding: "3rem", textAlign: "center", opacity: 0.5 }}>…تحميل الوجه</div>}
        {face && (
          <svg viewBox={`0 0 ${vb.width} ${vb.height}`} preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {polys.filter((p) => shaded.has(`${p.surahNumber}:${p.ayahNumber}`)).map((p, i) => (
              <path key={i} d={p.polygon} fill="rgba(220,0,0,0.32)" stroke="rgba(200,0,0,0.7)" strokeWidth={0.6} />
            ))}
          </svg>
        )}
      </div>

      {/* قائمة آيات الوجه عند «خطأ» */}
      {picking && face && (
        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {ETYPE.map((t) => (
              <button key={t.v} type="button" onClick={() => setEtype(t.v)}
                style={{ ...btn, padding: "0.2rem 0.6rem", background: etype === t.v ? "#1F5C3D" : "#fff", color: etype === t.v ? "#fff" : "#000" }}>{t.l}</button>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {face.ayahs.map((a) => (
              <button key={`${a.surah}:${a.ayah}`} type="button" style={{ ...btn, padding: "0.25rem 0.6rem" }} onClick={() => addError(a)}>
                {a.surah}:{a.ayah}
              </button>
            ))}
          </div>
          <button type="button" style={{ ...btn, marginTop: 8, padding: "0.2rem 0.7rem" }} onClick={() => setPicking(false)}>إلغاء</button>
        </div>
      )}

      {/* الأزرار */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" style={{ ...btn, borderColor: "#b00020", color: "#b00020" }} onClick={() => setPicking((v) => !v)} disabled={!face}>خطأ</button>
        <button type="button" style={{ ...btn, borderColor: "#8a6d1f", color: "#8a6d1f" }} onClick={addHesitation} disabled={!face}>تردّد</button>
        <button type="button" style={{ ...btn, marginInlineStart: "auto", background: "#1F5C3D", color: "#fff", borderColor: "#1F5C3D" }} onClick={() => void next()} disabled={!face}>
          {faceIdx < pages.length - 1 ? "الوجه التالي ⟵" : "إنهاء الحصاد"}
        </button>
      </div>
      <button type="button" style={{ ...btn, marginTop: 10, padding: "0.2rem 0.7rem", fontSize: "0.85rem" }} onClick={reset}>إلغاء الحصاد</button>
    </main>
  );
}
