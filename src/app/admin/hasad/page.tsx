"use client";
/* eslint-disable @next/next/no-img-element -- صورة الوجه أصلٌ ثابتٌ من CDN (WebP دقّة منخفضة)؛ لا يحتاج تحسين next/image. */

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { gradeHizbHarvest } from "@/server/hasad-grading";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, EmptyState, ui, sp } from "@/components/ui";

// شاشة الحصاد الكاملة (الحكم ٧ — نموذج محمد): صورة الوجه + تظليل الآية من المضلّعات،
// زرّا «خطأ/تردّد»، عدّاد أخطاءٍ تراكميّ على الحزب، عدّاد تردّدٍ على الوجه (يُصفَّر بالانتقال)،
// زرّ «الوجه التالي»، والمرتبة لحظةً بلحظة (النظام يحكم). خطأ ⟵ قائمة آيات الوجه فيُختار.

interface Ready { studentId: string; name: string; stageId: string; stageLabel: string; hizb: number | null }
interface Ayah { surah: number; ayah: number }
interface FaceData { page: number; imageUrl: string; ayahs: Ayah[]; polygonsUrl: string; polygonViewBox: { width: number; height: number } }
interface Polygon { surahNumber: number; ayahNumber: number; polygon: string }
interface Err { pageNo: number; errorType: "WORD" | "LETTER" | "FORGOTTEN_AYAH"; surah: number; ayah: number }

const RANK: Record<string, string> = { EXCELLENT: "تميّز", PASS: "اجتياز", FAIL: "رسوب" };
const RANK_BG: Record<string, string> = { EXCELLENT: ui.color.success, PASS: ui.color.bronzeHover, FAIL: ui.color.danger };
const ETYPE: { v: Err["errorType"]; l: string }[] = [
  { v: "WORD", l: "كلمة" }, { v: "LETTER", l: "حرف" }, { v: "FORGOTTEN_AYAH", l: "نسيان آية" },
];

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const column: React.CSSProperties = { maxWidth: 520, margin: "0 auto" };
const chip: React.CSSProperties = { padding: "0.25rem 0.6rem", borderRadius: ui.radius.full, fontSize: ui.text.xs, color: "#fff", fontWeight: 700 };
const CRUMBS = [{ label: "الرئيسة", href: "/" }, { label: "الحصاد" }];

export default function HasadPage() {
  const { me } = useMe();
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

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/hasad" title="الحصاد" crumbs={CRUMBS}>
      <div style={column}>{children}</div>
    </AppShell>
  );

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا كمُسمِّع.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );
  if (status === "loading") return <Shell><p style={{ color: ui.color.muted }}>…جارٍ التحميل</p></Shell>;
  if (status === "error") return <Shell><p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" type="button" onClick={() => void load()}>إعادة</Button></p></Shell>;

  // نتيجة نهائية
  if (outcome) return (
    <Shell>
      <Card style={{ background: RANK_BG[outcome.rank], color: "#fff", marginBottom: sp(3) }}>
        المرتبة: <strong>{RANK[outcome.rank]}</strong> · مجموع الأخطاء: {outcome.totalErrors}
      </Card>
      <Button type="button" onClick={reset}>حصادٌ جديد</Button>
    </Shell>
  );

  // اختيار الطالب
  if (!pick) return (
    <Shell>
      {msg && <p style={{ color: ui.color.danger }}>{msg}</p>}
      {ready.length === 0 && <EmptyState title="لا طلاب جاهزين للحصاد الآن" />}
      {ready.map((r) => (
        <Card key={`${r.studentId}-${r.stageId}`} style={{ marginBottom: sp(2), display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), flexWrap: "wrap" }}>
          <span><strong>{r.name}</strong> — {r.stageLabel}{r.hizb != null ? ` · الحزب ${r.hizb}` : ""}</span>
          <Button size="sm" type="button" onClick={() => void choose(r)}>ابدأ</Button>
        </Card>
      ))}
    </Shell>
  );

  // شاشة الحصاد
  const vb = face?.polygonViewBox ?? { width: 345, height: 550 };
  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp(2), flexWrap: "wrap", gap: 6 }}>
        <div><strong>{pick.name}</strong> · {pick.stageLabel}{pick.hizb != null ? ` · حزب ${pick.hizb}` : ""}</div>
        <span style={{ ...chip, background: RANK_BG[grade.rank] }}>{RANK[grade.rank]}</span>
      </div>
      <Card style={{ display: "flex", gap: sp(4), fontSize: ui.text.xs, marginBottom: sp(3), flexWrap: "wrap", padding: `${sp(2)} ${sp(4)}` }}>
        <span>الوجه <strong>{faceIdx + 1}</strong> من {pages.length}{page != null ? ` (ص${page})` : ""}</span>
        <span>أخطاء الحزب: <strong style={{ color: ui.color.danger }}>{grade.totalErrors}</strong></span>
        <span>تردّد الوجه: <strong>{faceHes}</strong>{faceHes >= 3 ? " (=خطأ)" : ""}</span>
      </Card>
      {msg && <p style={{ color: ui.color.danger }}>{msg}</p>}

      {/* صورة الوجه + طبقة تظليل الآيات */}
      <div style={{ position: "relative", width: "min(92vw, 400px)", margin: "0 auto", border: `1px solid ${ui.color.border}`, background: ui.color.surface }}>
        {face
          ? <img src={face.imageUrl} alt={`وجه ${page}`} style={{ width: "100%", display: "block" }} />
          : <div style={{ padding: "3rem", textAlign: "center", color: ui.color.muted }}>…تحميل الوجه</div>}
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
        <Card style={{ marginTop: sp(2) }}>
          <div style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.muted, marginBottom: sp(2) }}>نوع الخطأ ثمّ الآية:</div>
          <div style={{ display: "flex", gap: sp(2), marginBottom: sp(3), flexWrap: "wrap" }}>
            {ETYPE.map((t) => (
              <Button key={t.v} size="sm" variant={etype === t.v ? "bronze" : "ghost"} type="button" onClick={() => setEtype(t.v)}>{t.l}</Button>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: sp(2) }}>
            {face.ayahs.map((a) => (
              <Button key={`${a.surah}:${a.ayah}`} size="sm" variant="ghost" type="button" onClick={() => addError(a)}>
                {a.surah}:{a.ayah}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="ghost" type="button" style={{ marginTop: sp(3) }} onClick={() => setPicking(false)}>إلغاء</Button>
        </Card>
      )}

      {/* الأزرار */}
      <div style={{ display: "flex", gap: sp(2), marginTop: sp(3), flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="danger" type="button" onClick={() => setPicking((v) => !v)} disabled={!face}>خطأ</Button>
        <Button variant="bronze" type="button" onClick={addHesitation} disabled={!face}>تردّد</Button>
        <Button type="button" style={{ marginInlineStart: "auto" }} onClick={() => void next()} disabled={!face}>
          {faceIdx < pages.length - 1 ? "الوجه التالي ⟵" : "إنهاء الحصاد"}
        </Button>
      </div>
      <Button variant="ghost" size="sm" type="button" style={{ marginTop: sp(3) }} onClick={reset}>إلغاء الحصاد</Button>
    </Shell>
  );
}
