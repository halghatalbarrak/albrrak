"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { makkahDayDate } from "@/lib/makkah-day";
import { useMe } from "@/lib/useMe";
import { arNum, formatAyah } from "@/lib/format";
import { AppShell, Card, Button, Input, Badge, EmptyState, Skeleton, ui, sp } from "@/components/ui";
import { HifzInput } from "@/components/session/HifzInput";
import { attendanceLockAr as tLock } from "@/i18n/ar/attendance-lock";
import { navAr } from "@/i18n/ar/nav";
import { tSetup } from "@/i18n/ar/setup";
import { tUnified as tu } from "@/i18n/ar/unified";

const PROGRAM_AR: Record<string, string> = {
  QAIDAH_MADANIYYAH: navAr.civilBase, MARAQI: navAr.maraqi, MUDDAKIR: navAr.grpMuddakir, WEEKLY: navAr.weekly,
};
function programCounts(students: { program: string | null }[]): string {
  const by = new Map<string, number>();
  for (const s of students) { const k = s.program ?? ""; if (k) by.set(k, (by.get(k) ?? 0) + 1); }
  return [...by.entries()].map(([k, n]) => `${PROGRAM_AR[k] ?? k} ${arNum(n)}`).join(" · ");
}

interface Bound {
  fromSurah: number; fromAyah: number; toSurah: number; toAyah: number;
  sessionId?: string | null;
  savedErrors?: number;
}
interface NewHifz { kind: "NEW" | "REPEAT" | "COMPLETED" | "NO_TRACK"; bound?: Bound }
interface Target {
  status: "ACTIVE" | "ON_LEAVE" | "NOT_MARAQI" | "INACTIVE";
  newHifz: NewHifz | null;
  tarseekh: Bound[];
  murajaah: { dayNo: number | null; totalStock: number; todaySlice: Bound[] } | null;
  hasTarsikh: boolean;
  hasMuraja: boolean;
}
interface Qaidah {
  started: boolean; graduated: boolean; deferred: boolean;
  todayResult: "MASTERED" | "NOT_MASTERED" | "DEFERRED" | null;
  consecutiveDeferrals: number; locked: boolean;
  chapterName: string | null; lessonName: string | null;
  lessonIndexInChapter: number | null; lessonsInChapter: number | null; percent: number;
}
interface SetupStatus { isComplete: boolean; blockers: { key: string }[]; warnings: { key: string }[] }
interface TrackOption { id: string; nameAr: string; linesPerDay: number; ordinal: number }
interface Student {
  studentId: string; name: string;
  program: string | null;
  attendanceStatus: string | null;
  todayHifzDone: boolean; tarseekhDone: boolean | null;
  today: Target;
  qaidah: Qaidah | null;
  setupStatus?: SetupStatus;
  // من UnifiedStudent/BoardStudentWithTarget — محسوبةٌ من الخادم
  stageLabel: string | null;
  hizb: number | null;
  weeklyPercent: number | null;
  weeklyComplete: boolean;
  deferredToday: boolean;
  mustRepeat: boolean;
  started: boolean;
  yesterday: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number; mastered: boolean } | null;
  required: { tarseekhCount: number; khums: number } | null;
}
interface Circle { id: string; nameAr: string }
interface GrantItem { id: string; nameAr: string; value: number; grantSource: string }
type LockState = "OPEN" | "APPROVED" | "AUTO_LOCKED" | "TEMP_OPEN";
interface DayLock { state: LockState; locked: boolean; date: string }

const LOCK_LABEL: Record<LockState, string> = {
  OPEN: tLock.stateOpen, APPROVED: tLock.stateApproved, AUTO_LOCKED: tLock.stateAutoLocked, TEMP_OPEN: tLock.stateTempOpen,
};
const LOCK_TONE: Record<LockState, "success" | "danger" | "bronze" | "neutral"> = {
  OPEN: "success", APPROVED: "bronze", AUTO_LOCKED: "danger", TEMP_OPEN: "bronze",
};

const ATT_LABEL: Record<string, string> = {
  PRESENT: "حاضر", LATE: "متأخّر", ABSENT_UNEXCUSED: "غائب", LEFT_NO_PERMISSION: "خرج بلا إذن",
  ABSENT_EXCUSED: "غائب بعذر", PRE_EXCUSED: "مستأذن", LEFT_EARLY: "خرج مبكّرًا",
};
const ATT_BUTTONS: { status: string; label: string; tone: "primary" | "bronze" | "danger" }[] = [
  { status: "PRESENT", label: "حاضر", tone: "primary" },
  { status: "LATE", label: "متأخّر", tone: "bronze" },
  { status: "ABSENT_UNEXCUSED", label: "غائب", tone: "danger" },
  { status: "LEFT_NO_PERMISSION", label: "خرج بلا إذن", tone: "danger" },
];

function boundsRangeLabel(bounds: Bound[]): string {
  if (!bounds.length) return "—";
  const first = bounds[0];
  const last = bounds[bounds.length - 1];
  const outer = formatAyah(first.fromSurah, first.fromAyah, last.toSurah, last.toAyah);
  if (bounds.length === 1) return outer;
  return `${outer} (${arNum(bounds.length)} وحدة)`;
}

const todayISO = () => makkahDayDate(new Date());
async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}
const CRUMBS = [{ label: "الرئيسة", href: "/" }, { label: "التشغيل" }, { label: "الشاشة الموحّدة" }];

export default function UnifiedPage() {
  const { me } = useMe();
  const router = useRouter();
  const date = todayISO();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState("");
  const [students, setStudents] = useState<Student[] | null>(null);
  const [absentDefault, setAbsentDefault] = useState(false);
  const [dayLock, setDayLock] = useState<DayLock | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [setupFilter, setSetupFilter] = useState<"ALL" | "NEEDS_SETUP" | "MISSING_DATA">("ALL");
  const [items, setItems] = useState<GrantItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setViewState] = useState<"list" | "cards">("list");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("view");
      setViewState(v === "cards" ? "cards" : "list");
    }
  }, []);

  const switchView = (v: "list" | "cards") => {
    setViewState(v);
    router.push(v === "cards" ? "/admin/unified?view=cards" : "/admin/unified", { scroll: false });
  };

  const load = useCallback(async (cid: string) => {
    const t = await token(); if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/circles/${cid}/unified?date=${date}`, { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
    if (!res.ok) { setStatus("error"); return; }
    const b = (await res.json()) as { students: Student[]; absentDefault?: boolean; dayLock?: DayLock };
    setStudents(b.students); setAbsentDefault(Boolean(b.absentDefault)); setDayLock(b.dayLock ?? null);
    setStatus("ready");
  }, [date]);

  useEffect(() => {
    void (async () => {
      const t = await token(); if (!t) { setStatus("unauth"); return; }
      const [cRes, gRes] = await Promise.all([
        fetch("/api/attendance/circles", { headers: { authorization: `Bearer ${t}` } }),
        fetch("/api/economy/grant", { headers: { authorization: `Bearer ${t}` } }),
      ]);
      if (cRes.ok) {
        const cs = ((await cRes.json()) as { circles?: Circle[] }).circles ?? [];
        setCircles(cs); if (cs.length) setCircleId(cs[0].id); else setStatus("ready");
      } else setStatus("error");
      if (gRes.ok) setItems((((await gRes.json()) as { items?: GrantItem[] }).items ?? []).filter((i) => i.value > 0));
    })();
  }, []);
  useEffect(() => { if (circleId) void load(circleId); }, [circleId, load]);

  async function markAllPresent() {
    if (!students) return;
    const tok = await token(); if (!tok) return;
    const unmark = students.filter((s) => s.attendanceStatus == null);
    if (!unmark.length) return;
    await Promise.all(unmark.map((s) =>
      fetch(`/api/circles/${circleId}/mark-attendance`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
        body: JSON.stringify({ studentId: s.studentId, status: "PRESENT", date }),
      }),
    ));
    setMsg(tu("markAllPresent") + " — سُجِّل.");
    await load(circleId);
  }

  async function post(url: string, body: Record<string, unknown>, okMsg: string) {
    setMsg(null);
    const t = await token(); if (!t) { setStatus("unauth"); return; }
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify(body) });
    if (res.ok) { setMsg(okMsg); await load(circleId); }
    else { const j = await res.json().catch(() => ({})) as { error?: string }; setMsg(j.error ?? "تعذّر التسجيل."); }
  }

  const filtered = (students ?? []).filter((s) => {
    if (setupFilter === "NEEDS_SETUP") return s.setupStatus != null && !s.setupStatus.isComplete;
    if (setupFilter === "MISSING_DATA") return (s.setupStatus?.warnings.length ?? 0) > 0;
    return true;
  });
  const cur = students?.find((s) => s.studentId === selected) ?? null;

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/unified" title="الشاشة الموحّدة" crumbs={CRUMBS}>{children}</AppShell>
  );

  if (status === "unauth") return <Shell><p>{tu("needLoginTeacherAdmin")}</p></Shell>;
  if (status === "loading") return <Shell><Skeleton height={80} /></Shell>;
  if (status === "error") return <Shell><p style={{ color: ui.color.danger }}>{tu("loadFailed")}<Button variant="ghost" size="sm" onClick={() => void load(circleId)}>{tu("retry")}</Button></p></Shell>;
  if (circles.length === 0) return <Shell><EmptyState title="لا حلقات تَرصدها" /></Shell>;

  return (
    <Shell>
      {circles.length > 1 && (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(3) }}>
          {circles.map((c) => <Button key={c.id} size="sm" variant={c.id === circleId ? "bronze" : "ghost"} onClick={() => { setCircleId(c.id); setSelected(null); }}>{c.nameAr}</Button>)}
        </div>
      )}
      {dayLock && <DayLockBar lock={dayLock} circleId={circleId} date={date} post={post} />}
      {absentDefault && <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(2) }}>{tu("absentDefaultNote")}</p>}
      {students && students.length > 0 && programCounts(students) && (
        <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(2) }}>{programCounts(students)}</p>
      )}
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs, marginBottom: sp(2) }}>{msg}</p>}

      <AutoAssignMissingBtn students={students} circleId={circleId} onDone={() => void load(circleId)} />

      {/* مفتاح العرض + خريطة الضعف */}
      <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(3) }}>
        <Button size="sm" variant={view === "list" ? "primary" : "ghost"} onClick={() => switchView("list")}>{tu("viewList")}</Button>
        <Button size="sm" variant={view === "cards" ? "primary" : "ghost"} onClick={() => switchView("cards")}>{tu("viewCards")}</Button>
        {circleId && (
          <Button size="sm" variant="ghost" onClick={() => { window.location.href = `/admin/circles/${circleId}/weakness`; }}>{tu("weaknessMapBtn")}</Button>
        )}
      </div>

      {students && students.length > 0 && (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(2) }}>
          {(["ALL", "NEEDS_SETUP", "MISSING_DATA"] as const).map((f) => (
            <Button key={f} size="sm" variant={setupFilter === f ? "primary" : "ghost"} onClick={() => setSetupFilter(f)}>
              {f === "ALL" ? "الكل" : f === "NEEDS_SETUP" ? "إعداد ناقص" : "بيانات ناقصة"}
            </Button>
          ))}
        </div>
      )}

      {view === "list" && (
        <div style={{ display: "flex", gap: sp(4), alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 240, maxWidth: 360, display: "flex", flexDirection: "column", gap: sp(2) }}>
            {students && students.some((s) => s.attendanceStatus == null) && (
              <Button size="sm" variant="primary" onClick={() => void markAllPresent()}>{tu("markAllPresent")}</Button>
            )}
            {filtered.map((s) => {
              const done = s.attendanceStatus != null;
              return (
                <button key={s.studentId} onClick={() => setSelected(s.studentId)}
                  style={{ textAlign: "start", border: `1px solid ${s.studentId === selected ? ui.color.goldLine : ui.color.border}`, background: s.studentId === selected ? ui.color.soft : ui.color.surface, borderRadius: ui.radius.md, padding: `${sp(2)} ${sp(3)}`, cursor: "pointer", fontFamily: ui.font, color: ui.color.text, display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(2) }}>
                  <span style={{ display: "flex", gap: 4, alignItems: "center", minWidth: 0 }}>
                    <strong style={{ fontSize: ui.text.base }}>{s.name}</strong>
                    {s.program && <Badge tone="neutral">{PROGRAM_AR[s.program] ?? s.program}</Badge>}
                    {s.setupStatus && !s.setupStatus.isComplete && <Badge tone="danger">{tSetup("badgeNeedsSetup")}</Badge>}
                    {s.setupStatus && s.setupStatus.isComplete && s.setupStatus.warnings.length > 0 && <Badge tone="bronze">{tSetup("badgeMissingData")}</Badge>}
                  </span>
                  <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {done ? <Badge tone="success">{ATT_LABEL[s.attendanceStatus!] ?? s.attendanceStatus}</Badge>
                      : absentDefault ? <Badge tone="danger">{tu("absentNotRaised")}</Badge> : <Badge tone="neutral">{tu("notRaised")}</Badge>}
                    {s.todayHifzDone && <Badge tone="bronze">{tu("hifzDone")}</Badge>}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && <EmptyState title={setupFilter === "ALL" ? "لا طلاب في الحلقة" : "لا طلاب ضمن هذا الفلتر"} />}
          </div>

          <div style={{ flex: "2 1 420px", minWidth: 300 }}>
            {!cur ? <Card><p style={{ margin: 0, color: ui.color.muted }}>{tu("pickStudent")}</p></Card>
              : <StudentPanel s={cur} circleId={circleId} date={date} items={items} post={post} />}
          </div>
        </div>
      )}

      {view === "cards" && (
        <CardsView
          students={filtered}
          absentDefault={absentDefault}
          circleId={circleId}
          date={date}
          items={items}
          post={post}
        />
      )}
    </Shell>
  );
}

// ═══════════════ عرض البطاقات ═══════════════
function CardsView({ students, absentDefault, circleId, date, items, post }: {
  students: Student[];
  absentDefault: boolean;
  circleId: string; date: string; items: GrantItem[];
  post: (url: string, body: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (students.length === 0) return <EmptyState title="لا طلاب ضمن هذا الفلتر" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
      {students.map((s) => {
        const isExpanded = expanded === s.studentId;
        return (
          <Card key={s.studentId} style={{ padding: 0, overflow: "hidden" }}>
            <button
              onClick={() => setExpanded(isExpanded ? null : s.studentId)}
              style={{ width: "100%", textAlign: "start", background: "transparent", border: "none", cursor: "pointer", fontFamily: ui.font, color: ui.color.text, padding: sp(4), display: "flex", flexDirection: "column", gap: sp(2) }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), flexWrap: "wrap" }}>
                <span style={{ display: "flex", gap: sp(2), alignItems: "center", minWidth: 0 }}>
                  <strong style={{ fontSize: ui.text.base }}>{s.name}</strong>
                  {s.program && <Badge tone="neutral">{PROGRAM_AR[s.program] ?? s.program}</Badge>}
                  {s.deferredToday && <Badge tone="bronze">{tu("deferredTodayBadge")}</Badge>}
                  {s.setupStatus && !s.setupStatus.isComplete && <Badge tone="danger">{tSetup("badgeNeedsSetup")}</Badge>}
                </span>
                <span style={{ display: "flex", gap: sp(2), alignItems: "center" }}>
                  {s.attendanceStatus
                    ? <Badge tone="success">{ATT_LABEL[s.attendanceStatus] ?? s.attendanceStatus}</Badge>
                    : absentDefault ? <Badge tone="danger">{tu("absentNotRaised")}</Badge> : <Badge tone="neutral">{tu("notRaised")}</Badge>}
                  {s.todayHifzDone && <Badge tone="bronze">{tu("hifzDone")}</Badge>}
                </span>
              </div>

              {/* سطر الملخّص: المرحلة · أمس · المطلوب · دورة الأسبوع */}
              {s.program === "MARAQI" && (
                <div style={{ display: "flex", gap: sp(4), flexWrap: "wrap", fontSize: ui.text.xs, color: ui.color.muted }}>
                  {s.stageLabel && (
                    <span>
                      {tu("stageLabelPrefix")}<strong style={{ color: ui.color.text }}>{s.stageLabel}</strong>
                      {s.hizb != null ? <>{tu("hizbInline")}{arNum(s.hizb)}</> : ""}
                    </span>
                  )}
                  {s.yesterday && (
                    <span>
                      {tu("yesterdayLabel")}<strong style={{ color: ui.color.text }}>{formatAyah(s.yesterday.fromSurah, s.yesterday.fromAyah, s.yesterday.toSurah, s.yesterday.toAyah)}</strong>
                      {!s.yesterday.mastered ? tu("notMasteredSuffix") : ""}
                    </span>
                  )}
                  {s.required && (
                    <span>
                      {tu("requiredTodayPrefix")}
                      <strong style={{ color: ui.color.text }}>
                        {tu("requiredTarseekhPrefix")}{arNum(s.required.tarseekhCount)}
                        {tu("requiredKhumsPrefix")}{arNum(s.required.khums)}
                      </strong>
                    </span>
                  )}
                  {s.weeklyPercent != null && (
                    <span>{tu("weeklyCyclePrefix")}<strong style={{ color: s.weeklyComplete ? ui.color.success : ui.color.text }}>{arNum(s.weeklyPercent)}٪</strong></span>
                  )}
                </div>
              )}
            </button>

            {/* قسم التسجيل (موسَّع) */}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${ui.color.border}`, padding: sp(4), background: ui.color.bg }}>
                {s.program === "MARAQI" && (
                  <div style={{ marginBottom: sp(3) }}>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => void post(`/api/students/${s.studentId}/session`, { kind: "defer", date }, tu("deferDone"))}
                    >
                      {tu("deferBtn")}
                    </Button>
                  </div>
                )}
                <StudentPanel s={s} circleId={circleId} date={date} items={items} post={post} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ═══════════════ شارة حالة اليوم + أزرار الاعتماد/طلب الفتح ═══════════════
function DayLockBar({ lock, circleId, date, post }: {
  lock: DayLock; circleId: string; date: string;
  post: (url: string, body: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const approve = () => { if (window.confirm(tLock.approveConfirm)) void post(`/api/circles/${circleId}/attendance/approve`, { date }, tLock.approved); };
  const requestUnlock = () => {
    const reason = window.prompt(tLock.unlockReasonPrompt);
    if (reason?.trim()) void post(`/api/circles/${circleId}/attendance/unlock-request`, { date, reason }, tLock.unlockRequested);
  };
  return (
    <div style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap", marginBottom: sp(3) }}>
      <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tLock.dayStatus}:</span>
      <Badge tone={LOCK_TONE[lock.state]}>{LOCK_LABEL[lock.state]}</Badge>
      {!lock.locked
        ? <Button size="sm" variant="primary" onClick={approve}>{tLock.approveDay}</Button>
        : <><span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tLock.lockedHint}</span>
            <Button size="sm" variant="ghost" onClick={requestUnlock}>{tLock.requestUnlock}</Button></>}
    </div>
  );
}

// ═══════════════ بطاقة الطالب المبسَّطة (ثلاثة أسطر: احفظ / رسّخ / راجِع) ═══════════════
function StudentPanel({ s, circleId, date, items, post }: {
  s: Student; circleId: string; date: string; items: GrantItem[];
  post: (url: string, body: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const sid = s.studentId;
  const hifzBound = (s.today.newHifz?.kind === "NEW" || s.today.newHifz?.kind === "REPEAT") ? (s.today.newHifz.bound ?? null) : null;

  const markAtt = (st: string) => post(`/api/circles/${circleId}/mark-attendance`, { studentId: sid, status: st, date }, "سُجِّل الحضور.");
  const excuse = () => {
    const reason = window.prompt("سبب الاستئذان/العذر:");
    if (reason?.trim()) void post("/api/attendance/excuse", { studentId: sid, date, reason, kind: "EXCUSE" }, "قُدِّم طلب العذر — بانتظار اعتماد صاحب الصلاحية.");
  };
  const extra = (kind: string) => post(`/api/students/${sid}/extra`, { kind, date }, "سُجِّلت الزيادة.");
  const grant = (pointItemId: string) => post("/api/economy/grant", { studentId: sid, pointItemId }, "مُنح التقدير.");
  const qaidahEval = (mastered: boolean) => post(`/api/students/${sid}/qaidah-session`, { mastered }, "سُجِّل التقييم.");
  const qaidahDefer = () => post(`/api/students/${sid}/qaidah-session`, { defer: true }, "سُجِّل التأجيل.");

  const H3: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` };
  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: sp(4) }}>
      <strong style={{ fontSize: ui.text.lg }}>{s.name}</strong>

      {/* الحضور */}
      <div>
        <h3 style={H3}>{"الحضور"}{s.attendanceStatus ? ` — ${ATT_LABEL[s.attendanceStatus] ?? s.attendanceStatus}` : ""}</h3>
        <div style={row}>
          {ATT_BUTTONS.map((b) => <Button key={b.status} size="sm" variant={b.tone} onClick={() => void markAtt(b.status)}>{b.label}</Button>)}
          <Button size="sm" variant="ghost" onClick={excuse}>{tu("excused")}</Button>
        </div>
      </div>

      {/* محتوى البرنامج */}
      {s.qaidah ? <QaidahPanel q={s.qaidah} onEval={qaidahEval} onDefer={qaidahDefer} />
        : s.today.status === "ON_LEAVE" ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: 0 }}>{tu("onStageLeave")}</p>
        : s.today.status !== "ACTIVE" ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: 0 }}>{tu("noDailyTasks")}</p>
        : (
          <>
            {/* سطر الملخّص: المرحلة · دورة الأسبوع */}
            {(s.stageLabel || s.weeklyPercent != null) && (
              <div style={{ display: "flex", gap: sp(3), flexWrap: "wrap", fontSize: ui.text.xs, color: ui.color.muted }}>
                {s.stageLabel && (
                  <span>
                    {tu("stageLabelPrefix")}<strong style={{ color: ui.color.text }}>{s.stageLabel}</strong>
                    {s.hizb != null ? <>{tu("hizbInline")}{arNum(s.hizb)}</> : ""}
                  </span>
                )}
                {s.weeklyPercent != null && (
                  <span>
                    {tu("weeklyCyclePrefix")}<strong style={{ color: s.weeklyComplete ? ui.color.success : ui.color.text }}>{arNum(s.weeklyPercent)}٪</strong>
                  </span>
                )}
              </div>
            )}

            {/* احفظ */}
            <div>
              <h3 style={H3}>{tu("hifzSectionLabel")}</h3>
              {s.today.newHifz?.kind === "COMPLETED" ? <p style={{ color: ui.color.success, margin: 0 }}>{tu("trackCompleted")}</p>
                : s.today.newHifz?.kind === "NO_TRACK" ? <TrackAssignInline studentId={sid} post={post} />
                : (
                  <>
                    <HifzInput
                      bound={hifzBound}
                      hifzKind={s.today.newHifz?.kind ?? null}
                      onSave={(st) => void post(`/api/students/${sid}/session`, { kind: "hifz", date, ...st }, "سُجِّل الحفظ.")}
                    />
                    <div style={{ ...row, marginTop: sp(2) }}>
                      <Button size="sm" variant="ghost" onClick={() => void extra("hifz")}>{tu("addMore")}</Button>
                    </div>
                  </>
                )}
            </div>

            {/* رسّخ */}
            {s.today.hasTarsikh && (
              <ConsolidationRow
                label={tu("tarseekhSectionLabel")}
                bounds={s.today.tarseekh}
                studentId={sid}
                date={date}
                onDone={(done) => void post(`/api/students/${sid}/session`, { kind: "tarseekh", date, done }, "سُجِّل الترسيخ.")}
                onExtra={() => void extra("tarseekh")}
              />
            )}

            {/* راجِع */}
            {s.today.hasMuraja && (
              s.today.murajaah?.totalStock === 0
                ? <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: 0 }}>{tu("noRasikhYet")} <Button size="sm" variant="ghost" onClick={() => { window.location.href = "/admin/tracks"; }}>{tu("setPath")}</Button></p>
                : <ConsolidationRow
                    label={tu("murajaahSectionLabel")}
                    bounds={s.today.murajaah?.todaySlice ?? []}
                    studentId={sid}
                    date={date}
                    onDone={(done) => void post(`/api/students/${sid}/session`, { kind: "murajaah", date, count: done ? (s.today.murajaah?.todaySlice.length ?? 0) : 0 }, "سُجِّلت المراجعة.")}
                    onExtra={() => void extra("murajaah")}
                  />
            )}
          </>
        )}

      {/* تقدير */}
      {items.length > 0 && (
        <div>
          <h3 style={H3}>{tu("estimate")}</h3>
          <div style={row}>
            {items.map((it) => <Button key={it.id} size="sm" variant="bronze" onClick={() => void grant(it.id)}>{it.nameAr} (+{it.value})</Button>)}
          </div>
        </div>
      )}
    </Card>
  );
}

// ═══════════════ سطر الترسيخ / المراجعة (رسّخ / راجِع) مع [أخطاء…] ═══════════════
function ConsolidationRow({ label, bounds, studentId, date, onDone, onExtra }: {
  label: string; bounds: Bound[];
  studentId: string; date: string;
  onDone: (done: boolean) => void;
  onExtra: () => void;
}) {
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [unitErrors, setUnitErrors] = useState<Record<number, 0 | 1 | 2 | 3>>(() => {
    const init: Record<number, 0 | 1 | 2 | 3> = {};
    for (let i = 0; i < bounds.length; i++) {
      const e = Math.min(bounds[i].savedErrors ?? 0, 3) as 0 | 1 | 2 | 3;
      if (e > 0) init[i] = e;
    }
    return init;
  });
  const [savedFor, setSavedFor] = useState<number | null>(null);
  const [revertedUnits, setRevertedUnits] = useState<Set<number>>(new Set());

  const rangeText = boundsRangeLabel(bounds);
  const erroredCount = Object.values(unitErrors).filter((e) => e > 0).length;

  const errorLabel = (n: 0 | 1 | 2 | 3): string =>
    n === 0 ? tu("consolidUnitSafe")
    : n === 1 ? tu("consolidUnit1")
    : n === 2 ? tu("consolidUnit2")
    : tu("consolidUnit3");

  const handleTap = async (i: number) => {
    const cur = (unitErrors[i] ?? 0) as 0 | 1 | 2 | 3;
    const next = cur >= 3 ? 0 : (cur + 1) as 0 | 1 | 2 | 3;
    setUnitErrors((prev) => ({ ...prev, [i]: next }));
    if (!bounds[i].sessionId) return;
    const t = await token();
    if (!t) return;
    // endpoint مطلق: يضبط العدد مباشرةً (لا تراكميّ) — ٠ يُصفّر اليوم فقط
    const res = await fetch(`/api/students/${studentId}/unit-errors`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ sessionId: bounds[i].sessionId, errorCount: next, date }),
    });
    if (res.ok) {
      const data = (await res.json()) as { reverted?: boolean; undidRevert?: boolean };
      if (data.undidRevert) {
        setRevertedUnits((prev) => { const s = new Set(prev); s.delete(i); return s; });
        setSavedFor(i);
        setTimeout(() => setSavedFor((v) => (v === i ? null : v)), 2000);
      } else if (data.reverted) {
        setRevertedUnits((prev) => new Set(prev).add(i));
      } else {
        setRevertedUnits((prev) => { const s = new Set(prev); s.delete(i); return s; });
        setSavedFor(i);
        setTimeout(() => setSavedFor((v) => (v === i ? null : v)), 2000);
      }
    }
  };

  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
      <div style={row}>
        <span style={{ fontWeight: 700, fontSize: ui.text.base, minWidth: 36 }}>{label}</span>
        <span style={{ fontSize: ui.text.xs, color: ui.color.muted, flex: 1, minWidth: 0 }}>{rangeText}</span>
        <Button size="sm" variant="primary" onClick={() => onDone(true)}>{tu("consolidDone")}</Button>
        <Button size="sm" variant="danger" onClick={() => onDone(false)}>{tu("consolidNotDone")}</Button>
        {bounds.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setErrorsOpen((v) => !v)}>
            {errorsOpen
              ? tu("consolidHideErrors")
              : `${tu("consolidErrors")}${erroredCount > 0 ? ` ${arNum(erroredCount)}` : ""}`}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onExtra}>{tu("addMore")}</Button>
      </div>

      {errorsOpen && bounds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(1), background: ui.color.bg, padding: sp(2), borderRadius: ui.radius.md, border: `1px solid ${ui.color.border}` }}>
          {bounds.map((b, i) => {
            const errs = (unitErrors[i] ?? 0) as 0 | 1 | 2 | 3;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: sp(2) }}>
                <span style={{ flex: 1, fontSize: ui.text.xs }}>{formatAyah(b.fromSurah, b.fromAyah, b.toSurah, b.toAyah)}</span>
                {revertedUnits.has(i) && (
                  <span style={{ fontSize: ui.text.xs, color: ui.color.danger }}>{tu("consolidReverted")}</span>
                )}
                {savedFor === i && !revertedUnits.has(i) && (
                  <span style={{ fontSize: ui.text.xs, color: ui.color.success }}>{tu("consolidSaved")}</span>
                )}
                <button
                  onClick={() => void handleTap(i)}
                  style={{
                    fontSize: ui.text.xs, padding: `${sp(0.5)} ${sp(2.5)}`,
                    borderRadius: ui.radius.sm,
                    border: `1px solid ${errs > 0 ? ui.color.danger : ui.color.border}`,
                    background: errs >= 2 ? ui.color.danger : errs === 1 ? "#fffbe6" : ui.color.surface,
                    color: errs >= 2 ? "#fff" : errs === 1 ? "#b45309" : ui.color.muted,
                    cursor: "pointer", fontFamily: ui.font, minWidth: 90, minHeight: 36,
                  }}
                >
                  {errorLabel(errs)}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// زرّ «تعيين المسارات الناقصة»
function AutoAssignMissingBtn({ students, circleId, onDone }: { students: Student[] | null; circleId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  if (!students) return null;
  const count = students.filter((s) => s.program === "MARAQI" && s.today?.newHifz?.kind === "NO_TRACK").length;
  if (count === 0) return null;

  const run = async () => {
    setBusy(true); setResult(null);
    const t = await token(); if (!t) { setBusy(false); return; }
    const res = await fetch(`/api/circles/${circleId}/auto-assign-missing-tracks`, { method: "POST", headers: { authorization: `Bearer ${t}` } });
    setBusy(false);
    if (res.ok) {
      const j = (await res.json()) as { assigned: number; failed: number };
      setResult(`${tu("autoAssignDone")} ${j.assigned}`);
      onDone();
    }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: sp(2), marginBottom: sp(2) }}>
      <Button size="sm" variant="bronze" disabled={busy} onClick={() => void run()}>
        {busy ? tu("autoAssignProgress") : `${tu("autoAssignMissingBtn")} (${count})`}
      </Button>
      {result && <span style={{ fontSize: ui.text.xs, color: ui.color.success }}>{result}</span>}
    </div>
  );
}

// نموذج تعيين المسار المضمَّن
function TrackAssignInline({ studentId, post }: {
  studentId: string;
  post: (url: string, body: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const [tracks, setTracks] = useState<TrackOption[]>([]);
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    void (async () => {
      const t = await token();
      const res = await fetch(`/api/students/${studentId}/track-suggestion`, { headers: t ? { authorization: `Bearer ${t}` } : {} });
      if (res.ok) {
        const j = (await res.json()) as { suggestedTrackId: string | null; availableTracks: TrackOption[] };
        setTracks(j.availableTracks);
        setSuggestedId(j.suggestedTrackId);
        setSelectedId(j.suggestedTrackId ?? j.availableTracks[0]?.id ?? "");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studentId]);

  const save = () => {
    if (!selectedId) return;
    void post(`/api/students/${studentId}/assign-track`, { trackId: selectedId, ...(note.trim() ? { note: note.trim() } : {}) }, tu("trackAssigned"));
    setOpen(false);
  };

  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };
  if (!open) {
    return (
      <div style={row}>
        <p style={{ color: ui.color.muted, margin: 0, fontSize: ui.text.xs }}>{tu("trackNotSet")}</p>
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>{tu("assignTrackTitle")}</Button>
      </div>
    );
  }

  const isBelowSuggested = suggestedId && tracks.find((t) => t.id === suggestedId)
    ? (tracks.find((t) => t.id === selectedId)?.ordinal ?? 0) < (tracks.find((t) => t.id === suggestedId)!.ordinal)
    : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
      <p style={{ color: ui.color.muted, margin: 0, fontSize: ui.text.xs }}>{tu("trackNotSet")}</p>
      {tracks.length > 0 && (
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
          style={{ fontFamily: ui.font, padding: `${sp(1)} ${sp(2)}`, borderRadius: ui.radius.sm, border: `1px solid ${ui.color.border}`, background: ui.color.surface, color: ui.color.text, direction: "rtl" }}>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>{t.nameAr}{t.id === suggestedId ? ` (${tu("suggestedTrack")})` : ""}</option>
          ))}
        </select>
      )}
      {isBelowSuggested && <Input placeholder={tu("noteRequired")} value={note} onChange={(e) => setNote(e.target.value)} />}
      {!isBelowSuggested && <Input placeholder={tu("noteOptional")} value={note} onChange={(e) => setNote(e.target.value)} />}
      <div style={{ display: "flex", gap: sp(2) }}>
        <Button size="sm" variant="primary" onClick={save} disabled={!selectedId || (isBelowSuggested && !note.trim())}>{tu("saveTrack")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{tu("cancelBtn")}</Button>
      </div>
    </div>
  );
}

// كتلة القاعدة المدنية
function QaidahPanel({ q, onEval, onDefer }: { q: Qaidah; onEval: (mastered: boolean) => void; onDefer: () => void }) {
  const H3: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` };
  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };

  if (q.graduated || q.locked) {
    return (
      <div>
        <h3 style={H3}>{tu("civilBase")}</h3>
        <Badge tone="success">{q.locked ? "تخرّج — التقييم مقفل" : "أتمّ القاعدة المدنية ✓"}</Badge>
      </div>
    );
  }

  const resultLabel = q.todayResult === "MASTERED" ? "متقن"
    : q.todayResult === "NOT_MASTERED" ? "غير متقن"
    : q.todayResult === "DEFERRED" ? "مؤجَّل" : null;

  return (
    <div>
      <h3 style={H3}>{tu("qaidahCurrentLesson")}</h3>
      <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: `0 0 ${sp(2)}` }}>
        {q.chapterName ? <>{tu("chapterPrefix")}<strong style={{ color: ui.color.text }}>{q.chapterName}</strong>{" · "}</> : null}
        {"الدرس: "}<strong style={{ color: ui.color.text }}>{q.lessonName ?? "—"}</strong>
        {q.lessonIndexInChapter && q.lessonsInChapter ? ` (${arNum(q.lessonIndexInChapter)}/${arNum(q.lessonsInChapter)})` : ""}
        {" · "}{arNum(q.percent)}{"٪"}
        {q.consecutiveDeferrals > 0 ? <>{" · "}<Badge tone="bronze">{"تأجيلات متتالية: "}{arNum(q.consecutiveDeferrals)}</Badge></> : null}
        {resultLabel ? <>{tu("todayPrefix")}<strong style={{ color: ui.color.text }}>{resultLabel}</strong></> : null}
      </p>
      <div style={row}>
        <Button size="sm" variant="primary" onClick={() => onEval(true)}>{tu("qaidahMastered")}</Button>
        <Button size="sm" variant="danger" onClick={() => onEval(false)}>{tu("qaidahNotMastered")}</Button>
        <Button size="sm" variant="ghost" onClick={onDefer} title="حاضرٌ لم يُقيَّم لضيق الوقت — لا ينقل الموضع">{tu("qaidahDeferred")}</Button>
      </div>
    </div>
  );
}
