"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { makkahDayDate } from "@/lib/makkah-day";
import { useMe } from "@/lib/useMe";
import { arNum, hijri, formatAyah } from "@/lib/format";
import { tSession as t } from "@/i18n/ar/session";
import { AppShell, Card, Button, Input, Badge, EmptyState, Skeleton, TodayTargetView, type TTData, type TTBound, ui, sp } from "@/components/ui";

// شاشة الجلسة اليومية (م٦ — التشغيل الذكيّ): كل طلاب الحلقة معروضون فوراً بلا اختيار
// تاريخٍ ولا حلقة (الافتراض: حلقة المعلّم واليوم). كلٌّ بحاله (حفظ أمس · المطلوب اليوم ·
// حزبه · مرحلته) والنظام يقترح خطوته التالية. النقر يوسّع بطاقةً للتسجيل. لا مساس بالمنطق.

interface Circle { id: string; nameAr: string }
interface BoardStudent {
  studentId: string; name: string; program: string; started: boolean;
  stageLabel: string | null; hizb: number | null;
  yesterday: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number; mastered: boolean } | null;
  todayHifzDone: boolean; tarseekhDone: boolean | null; deferredToday: boolean;
  required: { tarseekhCount: number; khums: number } | null;
  weeklyPercent: number | null; weeklyComplete: boolean; mustRepeat: boolean; nextStep: string;
  today: TTData; // وجهة اليوم (م٤): الحفظ المقترح + الترسيخ + المراجعة بحدودها
}

// ── تفاصيل الطالب عند التوسيع (التسجيل) — نفس منطق الجلسة السابق ──
interface Position { program: string; started: boolean; current: { stageId: string; label: string; hizb: number | null } | null }
interface SessionToday { hifzFromSurah: number | null; hifzFromAyah: number | null; hifzToSurah: number | null; hifzToAyah: number | null; hifzAttempts: number | null; hifzMastered: boolean | null; tarseekhDone: boolean | null; murajaahCount: number | null }
interface Segment { id: string; fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }
interface Consolidation { tarseekh: { windowSize: number; segments: Segment[] }; review: { stockCount: number; khums: number; segments: Segment[] } }
interface WeeklyReview { required: number; done: number; remaining: number; percent: number; complete: boolean }
interface HifzGate { mustRepeat: boolean; range: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number } | null }
interface SessionView { student: { id: string; name: string }; program: string; position: Position; session: SessionToday | null; consolidation: Consolidation | null; weeklyReview: WeeklyReview | null; hifzGate: HifzGate | null }

function todayISO(): string { return makkahDayDate(new Date()); } // يوم مكّة لا UTC
async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const range = (r: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }) => formatAyah(r.fromSurah, r.fromAyah, r.toSurah, r.toAyah);

// المقترح لملء حقل الحفظ تلقائيًّا: الوحدة التالية أو إعادة أمس (مرن — المعلّم يعدّل).
function suggestedBound(t: TTData): TTBound | null {
  const n = t.newHifz;
  return n && (n.kind === "NEW" || n.kind === "REPEAT") && n.bound ? n.bound : null;
}

function stepTone(step: string): "success" | "danger" | "bronze" | "primary" {
  if (step.includes("اكتملت")) return "success";
  if (step.includes("يعيد")) return "danger";
  if (step.includes("لم يبدأ") || step.includes("القاعدة")) return "bronze";
  return "primary";
}
const num: React.CSSProperties = { width: 72 };

// ── العمل بلا إنترنت (الفكرة ١١) — كنمط الحضور م٢ ──
// الرصد الأساسيّ (حفظ/ترسيخ/مراجعة) يُوجَّه لنقطةٍ واحدة تُحدِّث بمفتاح (الطالب+اليوم)،
// فإعادة المزامنة idempotent بلا أثرٍ مضاعف. إن تعذّر الإرسال يُحفظ محليّاً ويُزامَن لاحقاً.
const QUEUE_KEY = "albrrak.session.queue";
interface QueuedRecord { studentId: string; body: Record<string, unknown> }
function readQueue(): QueuedRecord[] {
  try { const raw = localStorage.getItem(QUEUE_KEY); return raw ? (JSON.parse(raw) as QueuedRecord[]) : []; } catch { return []; }
}
function writeQueue(q: QueuedRecord[]): void { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
/** يُعيد إرسال كل رصدٍ مؤجَّل (idempotent). يعيد عدد ما بقي مؤجَّلاً. */
async function flushQueue(): Promise<number> {
  const q = readQueue();
  if (q.length === 0) return 0;
  const tok = await token();
  if (!tok) return q.length;
  const remain: QueuedRecord[] = [];
  for (const item of q) {
    try {
      const res = await fetch(`/api/students/${item.studentId}/session`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
        body: JSON.stringify(item.body),
      });
      if (!res.ok) remain.push(item); // خطأ خادمٍ (لا شبكة): يبقى للمراجعة.
    } catch {
      remain.push(item); // ما زال بلا اتصال.
    }
  }
  writeQueue(remain);
  return remain.length;
}

export default function DailySessionPage() {
  const { me } = useMe();
  const date = todayISO();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState("");
  const [board, setBoard] = useState<BoardStudent[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  const refreshPending = useCallback(() => setPending(readQueue().length), []);
  const flush = useCallback(async () => { setPending(await flushQueue()); }, []);

  // مزامنةٌ عند التحميل وعند عودة الاتصال (كالحضور م٢).
  useEffect(() => { refreshPending(); void flush(); }, [refreshPending, flush]);
  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  // الحلقات: تُحمَّل مرّةً، وتُختار الأولى تلقائيًّا (بلا اختيارٍ مفروض).
  useEffect(() => {
    void (async () => {
      const tok = await token();
      if (!tok) { setStatus("unauth"); return; }
      const res = await fetch("/api/attendance/circles", { headers: { authorization: `Bearer ${tok}` } });
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
    const tok = await token();
    if (!tok) { setStatus("unauth"); return; }
    const res = await fetch(`/api/circles/${circleId}/session?date=${encodeURIComponent(date)}`, { headers: { authorization: `Bearer ${tok}` } });
    if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
    if (!res.ok) { setStatus("error"); return; }
    setBoard(((await res.json()) as { students?: BoardStudent[] }).students ?? []);
    setStatus("ready");
  }, [circleId, date]);

  useEffect(() => { void loadBoard(); }, [loadBoard]);

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>{t("needLogin")}</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>{t("login")}</a>
      </main>
    );

  const current = circles.find((c) => c.id === circleId);

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/session"
      title={t("pageTitle")} crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbOperation") }, { label: t("crumbSession") }]}>

      {/* مبدّل الحلقة يظهر فقط عند تعدّدها — لا اختيارٌ مفروض */}
      {circles.length > 1 && (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(4) }}>
          {circles.map((c) => (
            <Button key={c.id} size="sm" variant={c.id === circleId ? "bronze" : "ghost"} onClick={() => setCircleId(c.id)}>{c.nameAr}</Button>
          ))}
        </div>
      )}
      {current && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3), flexWrap: "wrap", margin: `0 0 ${sp(4)}` }}>
          <p style={{ color: ui.color.muted, margin: 0, fontSize: ui.text.base }}>{current.nameAr}{t("circleHeaderSuffix")}</p>
          <a href={`/admin/circles/${circleId}/weakness`} style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.primary, textDecoration: "none", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md, padding: `${sp(1.5)} ${sp(3)}` }}>{t("weaknessMapLink")}</a>
        </div>
      )}

      {pending > 0 && (
        <Card style={{ marginBottom: sp(4), borderInlineStart: `4px solid ${ui.color.bronze}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3), flexWrap: "wrap" }}>
          <span>{t("offlinePrefix")}<strong>{pending}</strong>{t("offlineSuffix")}</span>
          <Button variant="bronze" size="sm" onClick={() => void flush()}>{t("syncNow")}</Button>
        </Card>
      )}

      {status === "error" && <p style={{ color: ui.color.danger }}>{t("loadFailed")}<Button variant="ghost" size="sm" onClick={() => void loadBoard()}>{t("retry")}</Button></p>}
      {status === "loading" && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={92} />)}</div>
      )}
      {status === "ready" && circles.length === 0 && <EmptyState title={t("noCircleTitle")} description={t("noCircleDesc")} />}
      {status === "ready" && board && board.length === 0 && <EmptyState title={t("noStudents")} />}

      {status === "ready" && board && board.map((s) => (
        <Card key={s.studentId} style={{ marginBottom: sp(3), padding: 0, overflow: "hidden" }}>
          {/* رأس البطاقة — حال الطالب + خطوته التالية */}
          <button
            onClick={() => setExpanded((e) => (e === s.studentId ? null : s.studentId))}
            style={{ width: "100%", textAlign: "start", background: "transparent", border: "none", cursor: "pointer", fontFamily: ui.font, color: ui.color.text, padding: sp(4), display: "flex", flexDirection: "column", gap: sp(2) }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), flexWrap: "wrap" }}>
              <strong style={{ fontSize: ui.text.base }}>{s.name}</strong>
              <div style={{ display: "flex", gap: sp(2), alignItems: "center" }}>
                {s.deferredToday && <Badge tone="bronze">{t("deferredToday")}</Badge>}
                <Badge tone={stepTone(s.nextStep)}>{s.nextStep}</Badge>
              </div>
            </div>
            <div style={{ display: "flex", gap: sp(4), flexWrap: "wrap", fontSize: ui.text.xs, color: ui.color.muted }}>
              <span>{t("stageLabelPrefix")}<strong style={{ color: ui.color.text }}>{s.stageLabel ?? "—"}</strong>{s.hizb != null ? `${t("hizbInline")}${s.hizb}` : ""}</span>
              <span>{t("yesterdayLabel")}<strong style={{ color: ui.color.text }}>{s.yesterday ? range(s.yesterday) : "—"}</strong>{s.yesterday && !s.yesterday.mastered ? t("notMasteredSuffix") : ""}</span>
              {s.required && <span>{t("requiredTodayPrefix")}<strong style={{ color: ui.color.text }}>{t("requiredTarseekhPrefix")}{s.required.tarseekhCount}{t("requiredKhumsPrefix")}{s.required.khums}</strong></span>}
              {s.weeklyPercent != null && <span>{t("weeklyCyclePrefix")}<strong style={{ color: ui.color.text }}>{s.weeklyPercent}٪</strong></span>}
            </div>
          </button>
          {/* وجهة اليوم (م٤) — المهامّ الثلاث جاهزةً بحدودها، دائمة الظهور */}
          {s.program === "MARAQI" && (
            <div style={{ borderTop: `1px solid ${ui.color.border}`, padding: `${sp(3)} ${sp(4)}` }}>
              <div style={{ fontSize: ui.text.xs, fontWeight: 700, color: ui.color.primary, marginBottom: sp(2) }}>{t("todayTargetTitle")}</div>
              <TodayTargetView t={s.today} />
            </div>
          )}
          {expanded === s.studentId && (
            <div style={{ borderTop: `1px solid ${ui.color.border}`, padding: sp(4), background: ui.color.bg }}>
              <StudentDetail studentId={s.studentId} date={date} suggestion={suggestedBound(s.today)} onSaved={() => { refreshPending(); void loadBoard(); }} />
            </div>
          )}
        </Card>
      ))}
    </AppShell>
  );
}

// ═══════════════ تفاصيل الطالب (التسجيل) — منطق الجلسة السابق كما هو ═══════════════
interface Forecast { hasPace: boolean; pacePerDay: number | null; hizbDoneDate: string | null; graduationDate: string | null }
function StudentDetail({ studentId, date, suggestion, onSaved }: { studentId: string; date: string; suggestion: TTBound | null; onSaved: () => void }) {
  const [view, setView] = useState<SessionView | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  // حقل الحفظ مملوءٌ بالمقترح (وجهة اليوم) وقابلٌ للتعديل — المعلّم يؤكّد أو يغيّر.
  const [hifz, setHifz] = useState({
    fromSurah: suggestion ? String(suggestion.fromSurah) : "", fromAyah: suggestion ? String(suggestion.fromAyah) : "",
    toSurah: suggestion ? String(suggestion.toSurah) : "", toAyah: suggestion ? String(suggestion.toAyah) : "",
    attempts: "1", mastered: false,
  });
  const [reviewCount, setReviewCount] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    const tok = await token();
    if (!tok) { setStatus("error"); return; }
    const res = await fetch(`/api/students/${studentId}/session?date=${encodeURIComponent(date)}`, { headers: { authorization: `Bearer ${tok}` } });
    if (!res.ok) { setStatus("error"); return; }
    setView((await res.json()) as SessionView);
    setStatus("ready");
    try { const fr = await fetch(`/api/students/${studentId}/forecast`, { headers: { authorization: `Bearer ${tok}` } }); if (fr.ok) setForecast((await fr.json()) as Forecast); } catch { /* التقدير إضافةٌ لا تُعطّل */ }
  }, [studentId, date]);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>) {
    setMsg(null);
    const tok = await token();
    if (!tok) return;
    const full = { ...body, date };
    try {
      const res = await fetch(`/api/students/${studentId}/session`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
        body: JSON.stringify(full),
      });
      if (res.ok) { setMsg(t("savedMsg")); await load(); onSaved(); }
      else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? t("saveFailed")); }
    } catch {
      // لا اتصال ⟵ احفظ محليّاً وزامن لاحقاً (كالحضور م٢). idempotent على مفتاح الطالب+اليوم.
      const q = readQueue(); q.push({ studentId, body: full }); writeQueue(q);
      setMsg(t("offlineSavedMsg"));
      onSaved();
    }
  }
  function saveHifz() {
    void post({ kind: "hifz", fromSurah: Number(hifz.fromSurah), fromAyah: Number(hifz.fromAyah), toSurah: Number(hifz.toSurah), toAyah: Number(hifz.toAyah), attempts: Number(hifz.attempts), mastered: hifz.mastered });
  }
  // الترميم وإعلان الجاهزية: رصدٌ غير idempotent (يُلحِق/يغيّر حالة) — لا يُصفّ محليّاً
  // لئلّا يتضاعف؛ يتطلّب اتصالاً، وإلا يُرشَد المعلّم للإعادة متّصلاً.
  async function reviewError(sessionId: string, errorCount: number) {
    setMsg(null);
    const tok = await token();
    if (!tok) return;
    try {
      const res = await fetch(`/api/students/${studentId}/review-error`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
        body: JSON.stringify({ sessionId, errorCount, date }),
      });
      if (res.ok) { const j = (await res.json()) as { reverted: boolean }; setMsg(j.reverted ? t("reviewTwoErrorsMsg") : t("reviewOneErrorMsg")); await load(); onSaved(); }
      else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? t("reviewFailed")); }
    } catch { setMsg(t("reviewNeedsOnline")); }
  }
  async function declareReadiness(stageId: string) {
    setMsg(null);
    const tok = await token();
    if (!tok) return;
    try {
      const res = await fetch(`/api/students/${studentId}/hasad-readiness`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
        body: JSON.stringify({ stageId }),
      });
      if (res.ok) { setMsg(t("readinessDeclaredMsg")); await load(); onSaved(); }
      else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? t("readinessFailed")); }
    } catch { setMsg(t("readinessNeedsOnline")); }
  }

  if (status === "loading") return <p style={{ color: ui.color.muted, margin: 0 }}>{t("detailLoading")}</p>;
  if (status === "error" || !view) return <p style={{ color: ui.color.danger, margin: 0 }}>{t("detailLoadFailed")}</p>;
  if (view.program !== "MARAQI") return <p style={{ color: ui.color.muted, margin: 0 }}>{t("maraqiOnlyNote")}</p>;

  const cur = view.position.current;
  const s = view.session;
  const label: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs, margin: 0 }}>{msg}</p>}
      {forecast?.hasPace && (
        <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: 0 }}>
          {t("forecastPrefix")}{arNum(forecast.pacePerDay ?? 0)}{t("forecastPerDaySuffix")}
          {forecast.hizbDoneDate && <>{t("forecastHizbPrefix")}<strong style={{ color: ui.color.text }}>{hijri(forecast.hizbDoneDate)}</strong>{t("forecastSemicolon")}</>}
          {forecast.graduationDate && <>{t("forecastGraduationPrefix")}<strong style={{ color: ui.color.text }}>{hijri(forecast.graduationDate)}</strong>{t("forecastPeriod")}</>}
        </p>
      )}

      {cur && (
        <Button variant="bronze" size="sm" style={{ alignSelf: "flex-start" }} onClick={() => void declareReadiness(cur.stageId)} title={t("declareReadinessTitle")}>
          {t("declareReadinessBtn")}
        </Button>
      )}

      {/* «مؤجَّل»: حاضرٌ لم يُسمَّع لضيق الوقت — لا يحرّك الموضع ولا يمنح/يخصم. */}
      <Button variant="ghost" size="sm" style={{ alignSelf: "flex-start" }} onClick={() => void post({ kind: "defer" })} title={t("deferTitle")}>
        {t("deferBtn")}
      </Button>

      {/* الحفظ */}
      <div>
        <h3 style={label}>{t("hifzTitle")}</h3>
        {suggestion && !view.hifzGate?.mustRepeat && (
          <p style={{ margin: `0 0 ${sp(2)}`, fontSize: ui.text.xs, color: ui.color.muted }}>
            {t("hifzSuggestionPrefix")}{range(suggestion)}{t("hifzSuggestionSuffix")}
          </p>
        )}
        {view.hifzGate?.mustRepeat && view.hifzGate.range && (
          <p style={{ margin: `0 0 ${sp(2)}`, padding: `${sp(2)} ${sp(3)}`, background: "var(--color-warn-bg)", borderRadius: ui.radius.md, fontSize: ui.text.xs }}>
            {t("hifzGatePrefix")}<strong>{t("hifzGateSameSegment")}</strong>{t("hifzGateRangeOpen")}{range(view.hifzGate.range)}{t("hifzGateSuffix")}
            <Button variant="ghost" size="sm" style={{ marginInlineStart: sp(2) }} onClick={() => setHifz((h) => ({ ...h, fromSurah: String(view.hifzGate!.range!.fromSurah), fromAyah: String(view.hifzGate!.range!.fromAyah), toSurah: String(view.hifzGate!.range!.toSurah), toAyah: String(view.hifzGate!.range!.toAyah) }))}>{t("fillSegment")}</Button>
          </p>
        )}
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center", fontSize: ui.text.xs }}>
          <span>{t("fromSurah")}</span><Input style={num} type="number" value={hifz.fromSurah} onChange={(e) => setHifz({ ...hifz, fromSurah: e.target.value })} />
          <span>{t("ayah")}</span><Input style={num} type="number" value={hifz.fromAyah} onChange={(e) => setHifz({ ...hifz, fromAyah: e.target.value })} />
          <span>{t("toSurah")}</span><Input style={num} type="number" value={hifz.toSurah} onChange={(e) => setHifz({ ...hifz, toSurah: e.target.value })} />
          <span>{t("ayah")}</span><Input style={num} type="number" value={hifz.toAyah} onChange={(e) => setHifz({ ...hifz, toAyah: e.target.value })} />
          <span>{t("attempts")}</span><Input style={num} type="number" min={1} value={hifz.attempts} onChange={(e) => setHifz({ ...hifz, attempts: e.target.value })} />
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={hifz.mastered} onChange={(e) => setHifz({ ...hifz, mastered: e.target.checked })} /> {t("mastered")}</label>
          <Button size="sm" onClick={saveHifz}>{t("save")}</Button>
        </div>
        {s?.hifzFromSurah != null && (
          <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: `${sp(2)} 0 0` }}>{t("recordedTodayPrefix")}{s.hifzFromSurah}:{s.hifzFromAyah} ← {s.hifzToSurah}:{s.hifzToAyah}{t("attemptsMid")}{s.hifzAttempts}{t("masteredSep")}{s.hifzMastered ? t("mastered") : t("notMastered")}</p>
        )}
      </div>

      {/* ما يُسمَّع اليوم */}
      {view.consolidation && (
        <div>
          <h3 style={label}>{t("heardTodayTitle")}</h3>
          <p style={{ margin: "0 0 4px", fontSize: ui.text.xs }}>
            <strong>{t("tarseekhStrong")}</strong>{t("tarseekhWindowPrefix")}{view.consolidation.tarseekh.windowSize}{t("tarseekhWindowSuffix")}
            {view.consolidation.tarseekh.segments.length === 0 ? t("noSegmentsYet") : ""}
          </p>
          <ul style={{ margin: `0 0 ${sp(2)}`, paddingInlineStart: 18, fontSize: ui.text.xs }}>
            {view.consolidation.tarseekh.segments.map((sg, i) => (<li key={i}>{range(sg)}</li>))}
          </ul>
          <p style={{ margin: 0, fontSize: ui.text.xs }}>
            <strong>{t("weeklyReviewStrong")}</strong>{t("weeklyReviewMid")}{view.consolidation.review.stockCount}{t("weeklyReviewStockSuffix")}{view.consolidation.review.khums}
          </p>
          {view.weeklyReview && (
            <div style={{ marginTop: sp(2), fontSize: ui.text.xs }}>
              {t("weeklyCycleDonePrefix")}<strong>{view.weeklyReview.done}</strong>{t("weeklyCycleOf")}<strong>{view.weeklyReview.required}</strong>{t("weeklyCycleRemaining")}<strong>{view.weeklyReview.remaining}</strong>{t("weeklyCyclePercentOpen")}{view.weeklyReview.percent}{t("weeklyCyclePercentClose")}
              {view.weeklyReview.complete && <span style={{ color: ui.color.success }}>{t("weeklyCycleComplete")}</span>}
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
                  <Button variant="ghost" size="sm" onClick={() => void reviewError(sg.id, 1)}>{t("oneError")}</Button>
                  <Button variant="danger" size="sm" onClick={() => void reviewError(sg.id, 2)}>{t("twoErrors")}</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* الترسيخ والمراجعة (تمّ/لم يتم) */}
      <div>
        <h3 style={label}>{t("consolidationTitle")}</h3>
        <div style={{ display: "flex", gap: sp(5), flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp(2) }}>
            <span>{t("tarseekhInlineLabel")}{s?.tarseekhDone == null ? "—" : s.tarseekhDone ? <Badge tone="success">{t("done")}</Badge> : <Badge tone="neutral">{t("notDone")}</Badge>}</span>
            <Button variant="ghost" size="sm" onClick={() => void post({ kind: "tarseekh", done: true })}>{t("done")}</Button>
            <Button variant="ghost" size="sm" onClick={() => void post({ kind: "tarseekh", done: false })}>{t("notDone")}</Button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: sp(2) }}>
            <span>{t("murajaahInlinePrefix")}{s?.murajaahCount ?? "—"}</span>
            <Input type="number" min={0} value={reviewCount} style={num} onChange={(e) => setReviewCount(e.target.value)} />
            <Button size="sm" onClick={() => void post({ kind: "murajaah", count: Number(reviewCount || 0) })}>{t("recordAmount")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
