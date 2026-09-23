"use client";
/* eslint-disable @next/next/no-img-element -- صورة الوجه أصلٌ ثابتٌ من CDN (WebP)؛ كنمط شاشة الحصاد. */

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { gradeHizbHarvest, aggregateExamRanks, type HizbRank } from "@/server/hasad-grading";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, EmptyState, ui, sp } from "@/components/ui";

// شاشة اختبار المرحلة (البند ١): على قالب الحصاد، لكن على **كامل المحفوظ** حزبًا حزبًا.
// المختبِر المحايد يرصد لكل حزبٍ الأخطاء (كلمة/حرف/نسيان) والترددات (بالوجه)، والتقدير اللحظيّ
// عبر aggregateExamRanks (رسوب حزبٍ = رسوب الكلّ، والأدنى مرتبةً). ويرى المعلّم إجازات طلابه ويؤجّل.

interface MemHizb { stageId: string; hizbNumber: number | null; label: string }
interface Ready { studentId: string; name: string; mainStageId: string; mainStageLabel: string; effectiveEndsOn: string; hizbs: MemHizb[] }
interface OnLeave { studentId: string; name: string; mainStageId: string; mainStageLabel: string; startedOn: string; effectiveEndsOn: string; teacherDeferredOnce: boolean; adminDeferrals: number; canDefer: boolean }
interface Ayah { surah: number; ayah: number }
interface FaceData { page: number; imageUrl: string; ayahs: Ayah[]; polygonsUrl: string; polygonViewBox: { width: number; height: number } }
interface Polygon { surahNumber: number; ayahNumber: number; polygon: string }
interface Err { pageNo: number; errorType: "WORD" | "LETTER" | "FORGOTTEN_AYAH"; surah: number; ayah: number }
interface Hes { faceNo: number }

const RANK: Record<string, string> = { EXCELLENT: "تميّز", PASS: "اجتياز", FAIL: "رسوب" };
const RANK_BG: Record<string, string> = { EXCELLENT: ui.color.success, PASS: ui.color.bronzeHover, FAIL: ui.color.danger };
const ETYPE: { v: Err["errorType"]; l: string }[] = [
  { v: "WORD", l: "كلمة" }, { v: "LETTER", l: "حرف" }, { v: "FORGOTTEN_AYAH", l: "نسيان آية" },
];

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const column: React.CSSProperties = { maxWidth: 560, margin: "0 auto" };
const chip: React.CSSProperties = { padding: "0.25rem 0.6rem", borderRadius: ui.radius.full, fontSize: ui.text.xs, color: "#fff", fontWeight: 700 };
const CRUMBS = [{ label: "الرئيسة", href: "/" }, { label: "اختبار المرحلة" }];

export default function StageExamPage() {
  const { me } = useMe();
  const [ready, setReady] = useState<Ready[]>([]);
  const [onLeave, setOnLeave] = useState<OnLeave[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [msg, setMsg] = useState<string | null>(null);

  // حالة الاختبار الجارية
  const [pick, setPick] = useState<Ready | null>(null);
  const [hizbIdx, setHizbIdx] = useState(0);
  const [errorsByHizb, setErrorsByHizb] = useState<Record<string, Err[]>>({});
  const [hesByHizb, setHesByHizb] = useState<Record<string, Hes[]>>({});
  const [pages, setPages] = useState<number[]>([]);
  const [faceIdx, setFaceIdx] = useState(0);
  const [face, setFace] = useState<FaceData | null>(null);
  const [polys, setPolys] = useState<Polygon[]>([]);
  const [picking, setPicking] = useState(false);
  const [etype, setEtype] = useState<Err["errorType"]>("WORD");
  const [outcome, setOutcome] = useState<{ status: string; finalRank: string; approvalId: string | null } | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const h = { authorization: `Bearer ${t}` };
      // المختبِر يرى الجاهزين؛ المعلّم يرى الإجازات؛ كلٌّ يتجاوز 403 الآخر بأمان.
      const [rRes, lRes] = await Promise.all([
        fetch("/api/stage-exams/ready", { headers: h }),
        fetch("/api/stage-exams/on-leave", { headers: h }),
      ]);
      if (rRes.status === 401 && lRes.status === 401) { setStatus("unauth"); return; }
      setReady(rRes.ok ? (((await rRes.json()) as { students?: Ready[] }).students ?? []) : []);
      setOnLeave(lRes.ok ? (((await lRes.json()) as { students?: OnLeave[] }).students ?? []) : []);
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

  const loadHizbFaces = useCallback(async (stageId: string) => {
    setPages([]); setFaceIdx(0); setFace(null); setPolys([]);
    const t = await token(); if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/hasad/faces/${stageId}`, { headers: { authorization: `Bearer ${t}` } });
    if (!res.ok) { setMsg("تعذّر تحميل أوجه الحزب."); return; }
    const hf = (await res.json()) as { pages: number[] };
    setPages(hf.pages);
    if (hf.pages.length) await loadFace(hf.pages[0]);
  }, [loadFace]);

  async function choose(r: Ready) {
    setMsg(null); setOutcome(null); setErrorsByHizb({}); setHesByHizb({}); setHizbIdx(0); setPick(r);
    if (r.hizbs.length) await loadHizbFaces(r.hizbs[0].stageId);
  }
  function reset() {
    setPick(null); setPages([]); setFace(null); setPolys([]); setErrorsByHizb({}); setHesByHizb({});
    setOutcome(null); setPicking(false); setHizbIdx(0);
  }

  async function defer(studentId: string, mainStageId: string) {
    setMsg(null);
    const t = await token(); if (!t) { setStatus("unauth"); return; }
    const res = await fetch("/api/stage-exams/defer", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ studentId, mainStageId }),
    });
    if (res.ok) await load();
    else { const j = await res.json() as { error?: string }; setMsg(j.error ?? "تعذّر التأجيل."); }
  }

  // ── الاختبار الجاري ──
  const curHizb = pick?.hizbs[hizbIdx];
  const page = pages[faceIdx];
  const curErrors = curHizb ? (errorsByHizb[curHizb.stageId] ?? []) : [];
  const curHes = curHizb ? (hesByHizb[curHizb.stageId] ?? []) : [];
  const curGrade = gradeHizbHarvest({
    errors: curErrors.map((e) => ({ faceNo: e.pageNo, surah: e.surah, ayah: e.ayah, errorType: e.errorType })),
    hesitations: curHes,
  });
  const faceHes = curHes.filter((h) => h.faceNo === page).length;
  const shaded = new Set(curErrors.filter((e) => e.pageNo === page).map((e) => `${e.surah}:${e.ayah}`));
  // التقدير اللحظيّ على المرحلة كاملة: الأدنى مرتبةً، ورسوب حزبٍ = رسوب الكلّ.
  const overall: { status: "PASSED" | "FAILED"; finalRank: HizbRank } | null = pick
    ? aggregateExamRanks(
        pick.hizbs.map((h) =>
          gradeHizbHarvest({
            errors: (errorsByHizb[h.stageId] ?? []).map((e) => ({ faceNo: e.pageNo, surah: e.surah, ayah: e.ayah, errorType: e.errorType })),
            hesitations: hesByHizb[h.stageId] ?? [],
          }).rank,
        ),
      )
    : null;

  function addError(a: Ayah) {
    if (!curHizb) return;
    const id = curHizb.stageId;
    setErrorsByHizb((m) => ({ ...m, [id]: [...(m[id] ?? []), { pageNo: page, errorType: etype, surah: a.surah, ayah: a.ayah }] }));
    setPicking(false);
  }
  function addHesitation() {
    if (!curHizb) return;
    const id = curHizb.stageId;
    setHesByHizb((m) => ({ ...m, [id]: [...(m[id] ?? []), { faceNo: page }] }));
  }

  async function next() {
    if (!pick) return;
    if (faceIdx < pages.length - 1) { const i = faceIdx + 1; setFaceIdx(i); await loadFace(pages[i]); return; }
    if (hizbIdx < pick.hizbs.length - 1) { const i = hizbIdx + 1; setHizbIdx(i); await loadHizbFaces(pick.hizbs[i].stageId); return; }
    await submit();
  }
  async function submit() {
    if (!pick) return;
    const t = await token(); if (!t) { setStatus("unauth"); return; }
    const hizbs = pick.hizbs.map((h) => ({
      stageId: h.stageId,
      errors: errorsByHizb[h.stageId] ?? [],
      hesitations: hesByHizb[h.stageId] ?? [],
    }));
    const res = await fetch(`/api/students/${pick.studentId}/stage-exam`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ mainStageId: pick.mainStageId, startedOn: todayISO(), hizbs }),
    });
    if (res.ok) { setOutcome(await res.json() as { status: string; finalRank: string; approvalId: string | null }); await load(); }
    else { const j = await res.json() as { error?: string }; setMsg(j.error ?? "تعذّر تسجيل الاختبار."); }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/stage-exam" title="اختبار المرحلة" crumbs={CRUMBS}>
      <div style={column}>{children}</div>
    </AppShell>
  );

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا كمختبِرٍ أو معلّم.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );
  if (status === "loading") return <Shell><p style={{ color: ui.color.muted }}>…جارٍ التحميل</p></Shell>;
  if (status === "error") return <Shell><p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" type="button" onClick={() => void load()}>إعادة</Button></p></Shell>;

  // نتيجة نهائية
  if (outcome) return (
    <Shell>
      <Card style={{ background: RANK_BG[outcome.finalRank], color: "#fff", marginBottom: sp(3) }}>
        نتيجة الاختبار: <strong>{outcome.status === "PASSED" ? "ناجح" : "راسب"}</strong> · المرتبة: <strong>{RANK[outcome.finalRank]}</strong>
      </Card>
      {outcome.status === "PASSED" && outcome.approvalId && (
        <Card style={{ marginBottom: sp(3), fontSize: ui.text.xs, color: ui.color.muted }}>
          أُنشئ اقتراح انتقالٍ معلَّق — بانتظار اعتماد المدير.
        </Card>
      )}
      <Button type="button" onClick={reset}>اختبارٌ جديد</Button>
    </Shell>
  );

  // ── القائمة (الجاهزون + في الإجازة) ──
  if (!pick) return (
    <Shell>
      {msg && <p style={{ color: ui.color.danger }}>{msg}</p>}

      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, margin: `${sp(2)} 0` }}>الجاهزون لاختبار المرحلة</h2>
      {ready.length === 0 && <EmptyState title="لا طلاب جاهزين لاختبار المرحلة الآن" />}
      {ready.map((r) => (
        <Card key={`${r.studentId}-${r.mainStageId}`} style={{ marginBottom: sp(2), display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), flexWrap: "wrap" }}>
          <span><strong>{r.name}</strong> — {r.mainStageLabel} · {r.hizbs.length} حزبًا</span>
          <Button size="sm" type="button" onClick={() => void choose(r)}>ابدأ الاختبار</Button>
        </Card>
      ))}

      {onLeave.length > 0 && (
        <>
          <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, margin: `${sp(4)} 0 ${sp(2)}` }}>طلابٌ في إجازة المرحلة</h2>
          {onLeave.map((s) => (
            <Card key={`${s.studentId}-${s.mainStageId}`} style={{ marginBottom: sp(2), display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), flexWrap: "wrap" }}>
              <span style={{ fontSize: ui.text.xs }}>
                <strong>{s.name}</strong> — {s.mainStageLabel}
                <br />
                <span style={{ color: ui.color.muted }}>
                  الإجازة تنتهي {s.effectiveEndsOn}
                  {s.teacherDeferredOnce ? " · أجّلها المعلّم" : ""}
                  {s.adminDeferrals > 0 ? ` · تأجيلات إدارة: ${s.adminDeferrals}` : ""}
                </span>
              </span>
              {s.canDefer
                ? <Button size="sm" variant="ghost" type="button" onClick={() => void defer(s.studentId, s.mainStageId)}>تأجيل أسبوعًا</Button>
                : <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>التأجيل المتكرّر بيد الإدارة</span>}
            </Card>
          ))}
        </>
      )}
    </Shell>
  );

  // ── شاشة الاختبار (حزب←حزب) ──
  const vb = face?.polygonViewBox ?? { width: 345, height: 550 };
  const lastFace = faceIdx >= pages.length - 1;
  const lastHizb = hizbIdx >= pick.hizbs.length - 1;
  const nextLabel = !lastFace ? "الوجه التالي ⟵" : !lastHizb ? "الحزب التالي ⟵" : "إنهاء الاختبار";
  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp(2), flexWrap: "wrap", gap: 6 }}>
        <div><strong>{pick.name}</strong> · {pick.mainStageLabel}</div>
        {overall && <span style={{ ...chip, background: RANK_BG[overall.finalRank] }}>الإجمالي: {RANK[overall.finalRank]}</span>}
      </div>
      <Card style={{ display: "flex", gap: sp(4), fontSize: ui.text.xs, marginBottom: sp(3), flexWrap: "wrap", padding: `${sp(2)} ${sp(4)}` }}>
        <span>الحزب <strong>{hizbIdx + 1}</strong> من {pick.hizbs.length}{curHizb ? ` (${curHizb.label})` : ""}</span>
        <span>الوجه <strong>{faceIdx + 1}</strong> من {pages.length}{page != null ? ` (ص${page})` : ""}</span>
        <span>أخطاء الحزب: <strong style={{ color: ui.color.danger }}>{curGrade.totalErrors}</strong> (<span style={{ background: RANK_BG[curGrade.rank], color: "#fff", padding: "0 6px", borderRadius: ui.radius.full }}>{RANK[curGrade.rank]}</span>)</span>
        <span>تردّد الوجه: <strong>{faceHes}</strong>{faceHes >= 3 ? " (=خطأ)" : ""}</span>
      </Card>
      {msg && <p style={{ color: ui.color.danger }}>{msg}</p>}

      {/* صورة الوجه + طبقة تظليل الآيات (كنمط الحصاد) */}
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
        <Button type="button" style={{ marginInlineStart: "auto" }} onClick={() => void next()} disabled={!face}>{nextLabel}</Button>
      </div>
      <Button variant="ghost" size="sm" type="button" style={{ marginTop: sp(3) }} onClick={reset}>إلغاء الاختبار</Button>
    </Shell>
  );
}
