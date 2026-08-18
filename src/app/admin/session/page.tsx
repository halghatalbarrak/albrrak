"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Input, Badge, EmptyState, Skeleton, ui, sp } from "@/components/ui";

// شاشة الجلسة اليومية (م٦ — التشغيل الذكيّ): كل طلاب الحلقة معروضون فوراً بلا اختيار
// تاريخٍ ولا حلقة (الافتراض: حلقة المعلّم واليوم). كلٌّ بحاله (حفظ أمس · المطلوب اليوم ·
// حزبه · مرحلته) والنظام يقترح خطوته التالية. النقر يوسّع بطاقةً للتسجيل. لا مساس بالمنطق.

interface Circle { id: string; nameAr: string }
interface BoardStudent {
  studentId: string; name: string; program: string; started: boolean;
  stageLabel: string | null; hizb: number | null;
  yesterday: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number; mastered: boolean } | null;
  todayHifzDone: boolean; tarseekhDone: boolean | null;
  required: { tarseekhCount: number; khums: number } | null;
  weeklyPercent: number | null; weeklyComplete: boolean; mustRepeat: boolean; nextStep: string;
}

// ── تفاصيل الطالب عند التوسيع (التسجيل) — نفس منطق الجلسة السابق ──
interface Position { program: string; started: boolean; current: { stageId: string; label: string; hizb: number | null } | null }
interface SessionToday { hifzFromSurah: number | null; hifzFromAyah: number | null; hifzToSurah: number | null; hifzToAyah: number | null; hifzAttempts: number | null; hifzMastered: boolean | null; tarseekhDone: boolean | null; murajaahCount: number | null }
interface Segment { id: string; fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }
interface Consolidation { tarseekh: { windowSize: number; segments: Segment[] }; review: { stockCount: number; khums: number; segments: Segment[] } }
interface WeeklyReview { required: number; done: number; remaining: number; percent: number; complete: boolean }
interface HifzGate { mustRepeat: boolean; range: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number } | null }
interface SessionView { student: { id: string; name: string }; program: string; position: Position; session: SessionToday | null; consolidation: Consolidation | null; weeklyReview: WeeklyReview | null; hifzGate: HifzGate | null }

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const ayah = (s: number, a: number) => `${s}:${a}`;
const range = (r: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }) => `${ayah(r.fromSurah, r.fromAyah)} ← ${ayah(r.toSurah, r.toAyah)}`;

function stepTone(step: string): "success" | "danger" | "bronze" | "primary" {
  if (step.includes("اكتملت")) return "success";
  if (step.includes("يعيد")) return "danger";
  if (step.includes("لم يبدأ") || step.includes("القاعدة")) return "bronze";
  return "primary";
}
const num: React.CSSProperties = { width: 72 };

export default function DailySessionPage() {
  const { me } = useMe();
  const date = todayISO();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState("");
  const [board, setBoard] = useState<BoardStudent[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [expanded, setExpanded] = useState<string | null>(null);

  // الحلقات: تُحمَّل مرّةً، وتُختار الأولى تلقائيًّا (بلا اختيارٍ مفروض).
  useEffect(() => {
    void (async () => {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch("/api/attendance/circles", { headers: { authorization: `Bearer ${t}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      const cs = ((await res.json()) as { circles?: Circle[] }).circles ?? [];
      setCircles(cs);
      if (cs.length) setCircleId(cs[0].id);
      else setStatus("ready"); // لا حلقات
    })();
  }, []);

  const loadBoard = useCallback(async () => {
    if (!circleId) return;
    setStatus("loading"); setExpanded(null);
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/circles/${circleId}/session?date=${encodeURIComponent(date)}`, { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
    if (!res.ok) { setStatus("error"); return; }
    setBoard(((await res.json()) as { students?: BoardStudent[] }).students ?? []);
    setStatus("ready");
  }, [circleId, date]);

  useEffect(() => { void loadBoard(); }, [loadBoard]);

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );

  const current = circles.find((c) => c.id === circleId);

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/session"
      title="الجلسة اليومية" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "التشغيل" }, { label: "الجلسة اليومية" }]}>

      {/* مبدّل الحلقة يظهر فقط عند تعدّدها — لا اختيارٌ مفروض */}
      {circles.length > 1 && (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(4) }}>
          {circles.map((c) => (
            <Button key={c.id} size="sm" variant={c.id === circleId ? "bronze" : "ghost"} onClick={() => setCircleId(c.id)}>{c.nameAr}</Button>
          ))}
        </div>
      )}
      {current && <p style={{ color: ui.color.muted, margin: `0 0 ${sp(4)}`, fontSize: ui.text.base }}>{current.nameAr} — طلابها اليوم، كلٌّ بحاله وخطوته التالية.</p>}

      {status === "error" && <p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" onClick={() => void loadBoard()}>إعادة</Button></p>}
      {status === "loading" && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={92} />)}</div>
      )}
      {status === "ready" && circles.length === 0 && <EmptyState title="لم تُسنَد إليك حلقة" description="راجِع الحلقات لإسناد حلقةٍ إليك." />}
      {status === "ready" && board && board.length === 0 && <EmptyState title="لا طلاب في هذه الحلقة" />}

      {status === "ready" && board && board.map((s) => (
        <Card key={s.studentId} style={{ marginBottom: sp(3), padding: 0, overflow: "hidden" }}>
          {/* رأس البطاقة — حال الطالب + خطوته التالية */}
          <button
            onClick={() => setExpanded((e) => (e === s.studentId ? null : s.studentId))}
            style={{ width: "100%", textAlign: "start", background: "transparent", border: "none", cursor: "pointer", fontFamily: ui.font, color: ui.color.text, padding: sp(4), display: "flex", flexDirection: "column", gap: sp(2) }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), flexWrap: "wrap" }}>
              <strong style={{ fontSize: ui.text.base }}>{s.name}</strong>
              <Badge tone={stepTone(s.nextStep)}>{s.nextStep}</Badge>
            </div>
            <div style={{ display: "flex", gap: sp(4), flexWrap: "wrap", fontSize: ui.text.xs, color: ui.color.muted }}>
              <span>مرحلته: <strong style={{ color: ui.color.text }}>{s.stageLabel ?? "—"}</strong>{s.hizb != null ? ` · حزب ${s.hizb}` : ""}</span>
              <span>حفظ أمس: <strong style={{ color: ui.color.text }}>{s.yesterday ? range(s.yesterday) : "—"}</strong>{s.yesterday && !s.yesterday.mastered ? " (لم يُتقن)" : ""}</span>
              {s.required && <span>المطلوب اليوم: <strong style={{ color: ui.color.text }}>ترسيخ {s.required.tarseekhCount} · خُمس ≈ {s.required.khums}</strong></span>}
              {s.weeklyPercent != null && <span>دورة الأسبوع: <strong style={{ color: ui.color.text }}>{s.weeklyPercent}٪</strong></span>}
            </div>
          </button>
          {expanded === s.studentId && (
            <div style={{ borderTop: `1px solid ${ui.color.border}`, padding: sp(4), background: ui.color.bg }}>
              <StudentDetail studentId={s.studentId} date={date} onSaved={() => void loadBoard()} />
            </div>
          )}
        </Card>
      ))}
    </AppShell>
  );
}

// ═══════════════ تفاصيل الطالب (التسجيل) — منطق الجلسة السابق كما هو ═══════════════
function StudentDetail({ studentId, date, onSaved }: { studentId: string; date: string; onSaved: () => void }) {
  const [view, setView] = useState<SessionView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [hifz, setHifz] = useState({ fromSurah: "", fromAyah: "", toSurah: "", toAyah: "", attempts: "1", mastered: false });
  const [reviewCount, setReviewCount] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    const t = await token();
    if (!t) { setStatus("error"); return; }
    const res = await fetch(`/api/students/${studentId}/session?date=${encodeURIComponent(date)}`, { headers: { authorization: `Bearer ${t}` } });
    if (!res.ok) { setStatus("error"); return; }
    setView((await res.json()) as SessionView);
    setStatus("ready");
  }, [studentId, date]);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>) {
    setMsg(null);
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${studentId}/session`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ ...body, date }),
    });
    if (res.ok) { setMsg("حُفظ."); await load(); onSaved(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر الحفظ."); }
  }
  function saveHifz() {
    void post({ kind: "hifz", fromSurah: Number(hifz.fromSurah), fromAyah: Number(hifz.fromAyah), toSurah: Number(hifz.toSurah), toAyah: Number(hifz.toAyah), attempts: Number(hifz.attempts), mastered: hifz.mastered });
  }
  async function reviewError(sessionId: string, errorCount: number) {
    setMsg(null);
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${studentId}/review-error`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ sessionId, errorCount, date }),
    });
    if (res.ok) { const j = (await res.json()) as { reverted: boolean }; setMsg(j.reverted ? "خطآن — عاد المقطع حفظًا جديدًا." : "خطأٌ واحد — تنبيهٌ، يبقى راسخًا."); await load(); onSaved(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر الرصد."); }
  }
  async function declareReadiness(stageId: string) {
    setMsg(null);
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${studentId}/hasad-readiness`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ stageId }),
    });
    if (res.ok) { setMsg("أُعلنت الجاهزية للحصاد."); await load(); onSaved(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر إعلان الجاهزية."); }
  }

  if (status === "loading") return <p style={{ color: ui.color.muted, margin: 0 }}>…جارٍ التحميل</p>;
  if (status === "error" || !view) return <p style={{ color: ui.color.danger, margin: 0 }}>تعذّر تحميل الجلسة.</p>;
  if (view.program !== "MARAQI") return <p style={{ color: ui.color.muted, margin: 0 }}>الجلسة اليومية لطلاب مراقي. هذا الطالب في القاعدة المدنية.</p>;

  const cur = view.position.current;
  const s = view.session;
  const label: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs, margin: 0 }}>{msg}</p>}

      {cur && (
        <Button variant="bronze" size="sm" style={{ alignSelf: "flex-start" }} onClick={() => void declareReadiness(cur.stageId)} title="الحصاد يُجريه مُسمِّعٌ ليس معلمه — أنت تُعلن الجاهزية فقط">
          أعلن الجاهزية للحصاد
        </Button>
      )}

      {/* الحفظ */}
      <div>
        <h3 style={label}>الحفظ (المعلم وحده)</h3>
        {view.hifzGate?.mustRepeat && view.hifzGate.range && (
          <p style={{ margin: `0 0 ${sp(2)}`, padding: `${sp(2)} ${sp(3)}`, background: "#fdf0d5", borderRadius: ui.radius.md, fontSize: ui.text.xs }}>
            ⚠️ الحكم ١: يعيد <strong>نفس المقطع</strong> ({range(view.hifzGate.range)})، لا حفظ جديد.
            <Button variant="ghost" size="sm" style={{ marginInlineStart: sp(2) }} onClick={() => setHifz((h) => ({ ...h, fromSurah: String(view.hifzGate!.range!.fromSurah), fromAyah: String(view.hifzGate!.range!.fromAyah), toSurah: String(view.hifzGate!.range!.toSurah), toAyah: String(view.hifzGate!.range!.toAyah) }))}>املأ المقطع</Button>
          </p>
        )}
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center", fontSize: ui.text.xs }}>
          <span>من سورة</span><Input style={num} type="number" value={hifz.fromSurah} onChange={(e) => setHifz({ ...hifz, fromSurah: e.target.value })} />
          <span>آية</span><Input style={num} type="number" value={hifz.fromAyah} onChange={(e) => setHifz({ ...hifz, fromAyah: e.target.value })} />
          <span>إلى سورة</span><Input style={num} type="number" value={hifz.toSurah} onChange={(e) => setHifz({ ...hifz, toSurah: e.target.value })} />
          <span>آية</span><Input style={num} type="number" value={hifz.toAyah} onChange={(e) => setHifz({ ...hifz, toAyah: e.target.value })} />
          <span>المحاولات</span><Input style={num} type="number" min={1} value={hifz.attempts} onChange={(e) => setHifz({ ...hifz, attempts: e.target.value })} />
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={hifz.mastered} onChange={(e) => setHifz({ ...hifz, mastered: e.target.checked })} /> أتقن</label>
          <Button size="sm" onClick={saveHifz}>حفظ</Button>
        </div>
        {s?.hifzFromSurah != null && (
          <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: `${sp(2)} 0 0` }}>مُسجَّل اليوم: {s.hifzFromSurah}:{s.hifzFromAyah} ← {s.hifzToSurah}:{s.hifzToAyah} · محاولات {s.hifzAttempts} · {s.hifzMastered ? "أتقن" : "لم يُتقن"}</p>
        )}
      </div>

      {/* ما يُسمَّع اليوم */}
      {view.consolidation && (
        <div>
          <h3 style={label}>ما يُسمَّع اليوم</h3>
          <p style={{ margin: "0 0 4px", fontSize: ui.text.xs }}>
            <strong>الترسيخ</strong> (آخر {view.consolidation.tarseekh.windowSize} مقاطع):
            {view.consolidation.tarseekh.segments.length === 0 ? " — لا مقاطع بعد" : ""}
          </p>
          <ul style={{ margin: `0 0 ${sp(2)}`, paddingInlineStart: 18, fontSize: ui.text.xs }}>
            {view.consolidation.tarseekh.segments.map((sg, i) => (<li key={i}>{range(sg)}</li>))}
          </ul>
          <p style={{ margin: 0, fontSize: ui.text.xs }}>
            <strong>المراجعة الأسبوعية</strong>: الراسخ {view.consolidation.review.stockCount} مقطعًا · خُمس اليوم ≈ {view.consolidation.review.khums}
          </p>
          {view.weeklyReview && (
            <div style={{ marginTop: sp(2), fontSize: ui.text.xs }}>
              دورة الأسبوع: أُنجِز <strong>{view.weeklyReview.done}</strong> من <strong>{view.weeklyReview.required}</strong> — المتبقّي <strong>{view.weeklyReview.remaining}</strong> ({view.weeklyReview.percent}٪)
              {view.weeklyReview.complete && <span style={{ color: ui.color.success }}> · اكتملت ✓</span>}
              <div style={{ height: 6, background: ui.color.border, borderRadius: ui.radius.sm, marginTop: 4 }}>
                <div style={{ width: `${view.weeklyReview.percent}%`, height: "100%", background: ui.color.success, borderRadius: ui.radius.sm }} />
              </div>
            </div>
          )}
          {view.consolidation.review.segments.length > 0 && (
            <ul style={{ margin: `${sp(2)} 0 0`, paddingInlineStart: 0, listStyle: "none", fontSize: ui.text.xs }}>
              {view.consolidation.review.segments.map((sg) => (
                <li key={sg.id} style={{ display: "flex", gap: sp(2), alignItems: "center", marginBottom: 3 }}>
                  <span>{range(sg)}</span>
                  <Button variant="ghost" size="sm" onClick={() => void reviewError(sg.id, 1)}>خطأ واحد</Button>
                  <Button variant="danger" size="sm" onClick={() => void reviewError(sg.id, 2)}>خطآن ← ترميم</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* الترسيخ والمراجعة (تمّ/لم يتم) */}
      <div>
        <h3 style={label}>الترسيخ والمراجعة</h3>
        <div style={{ display: "flex", gap: sp(5), flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp(2) }}>
            <span>الترسيخ: {s?.tarseekhDone == null ? "—" : s.tarseekhDone ? <Badge tone="success">تمّ</Badge> : <Badge tone="neutral">لم يتم</Badge>}</span>
            <Button variant="ghost" size="sm" onClick={() => void post({ kind: "tarseekh", done: true })}>تمّ</Button>
            <Button variant="ghost" size="sm" onClick={() => void post({ kind: "tarseekh", done: false })}>لم يتم</Button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: sp(2) }}>
            <span>المراجعة اليوم (مقاطع): {s?.murajaahCount ?? "—"}</span>
            <Input type="number" min={0} value={reviewCount} style={num} onChange={(e) => setReviewCount(e.target.value)} />
            <Button size="sm" onClick={() => void post({ kind: "murajaah", count: Number(reviewCount || 0) })}>رصد المقدار</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
