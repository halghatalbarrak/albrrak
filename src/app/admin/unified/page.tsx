"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { makkahDayDate } from "@/lib/makkah-day";
import { useMe } from "@/lib/useMe";
import { arNum, formatAyah } from "@/lib/format";
import { AppShell, Card, Button, Input, Badge, EmptyState, Skeleton, TodayTargetView, type TTData, ui, sp } from "@/components/ui";
import { HifzInput } from "@/components/session/HifzInput";
import { TarseekhInput, MurajaahInput } from "@/components/session/ConsolidationInput";
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

interface Bound { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }
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
}
interface Circle { id: string; nameAr: string }
interface GrantItem { id: string; nameAr: string; value: number; grantSource: string }
type LockState = "OPEN" | "APPROVED" | "AUTO_LOCKED" | "TEMP_OPEN";
interface DayLock { state: LockState; locked: boolean; date: string }

// بيانات لوحة الجلسة (من /api/circles/[id]/session) — للعرض الملخّص في بطاقات الطلاب.
interface BoardStudent {
  studentId: string; name: string; program: string; started: boolean;
  stageLabel: string | null; hizb: number | null;
  yesterday: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number; mastered: boolean } | null;
  todayHifzDone: boolean; tarseekhDone: boolean | null; deferredToday: boolean;
  required: { tarseekhCount: number; khums: number } | null;
  weeklyPercent: number | null; weeklyComplete: boolean; mustRepeat: boolean; nextStep: string;
  today: TTData;
}

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
  const [board, setBoard] = useState<Map<string, BoardStudent>>(new Map());
  const [expanded, setExpanded] = useState<string | null>(null);

  // يقرأ ?view=cards من URL بعد الوصل
  useEffect(() => {
    if (typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("view");
      setViewState(v === "cards" ? "cards" : "list");
    }
  }, []);

  const switchView = (v: "list" | "cards") => {
    setViewState(v);
    setExpanded(null);
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

    // في عرض البطاقات: جلب لوحة الجلسة أيضاً للحصول على المرحلة وأمس والمطلوب والدورة.
    if (view === "cards") {
      const sRes = await fetch(`/api/circles/${cid}/session?date=${date}`, { headers: { authorization: `Bearer ${t}` } });
      if (sRes.ok) {
        const sData = (await sRes.json()) as { students?: BoardStudent[] };
        setBoard(new Map((sData.students ?? []).map((s) => [s.studentId, s])));
      }
    }
  }, [date, view]);

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
          {circles.map((c) => <Button key={c.id} size="sm" variant={c.id === circleId ? "bronze" : "ghost"} onClick={() => { setCircleId(c.id); setSelected(null); setExpanded(null); }}>{c.nameAr}</Button>)}
        </div>
      )}
      {dayLock && <DayLockBar lock={dayLock} circleId={circleId} date={date} post={post} />}
      {absentDefault && <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(2) }}>{tu("absentDefaultNote")}</p>}
      {students && students.length > 0 && programCounts(students) && (
        <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(2) }}>{programCounts(students)}</p>
      )}
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs, marginBottom: sp(2) }}>{msg}</p>}

      {/* تعيين المسارات الناقصة */}
      <AutoAssignMissingBtn students={students} circleId={circleId} onDone={() => void load(circleId)} />

      {/* مفتاح العرض (قائمة | بطاقات) */}
      <div style={{ display: "flex", gap: sp(2), marginBottom: sp(3) }}>
        <Button size="sm" variant={view === "list" ? "primary" : "ghost"} onClick={() => switchView("list")}>{tu("viewList")}</Button>
        <Button size="sm" variant={view === "cards" ? "primary" : "ghost"} onClick={() => switchView("cards")}>{tu("viewCards")}</Button>
      </div>

      {/* فلتر الإعداد — في العرضين */}
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
          {/* اللوحة الجانبيّة: قائمة الطلاب */}
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

          {/* لوحة الطالب */}
          <div style={{ flex: "2 1 420px", minWidth: 300 }}>
            {!cur ? <Card><p style={{ margin: 0, color: ui.color.muted }}>{tu("pickStudent")}</p></Card>
              : <StudentPanel s={cur} circleId={circleId} date={date} items={items} post={post} />}
          </div>
        </div>
      )}

      {view === "cards" && (
        <CardsView
          students={filtered}
          board={board}
          absentDefault={absentDefault}
          circleId={circleId}
          date={date}
          items={items}
          post={post}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      )}
    </Shell>
  );
}

// ═══════════════ عرض البطاقات (بديل الجلسة اليومية) ═══════════════
function CardsView({ students, board, absentDefault, circleId, date, items, post, expanded, setExpanded }: {
  students: Student[];
  board: Map<string, BoardStudent>;
  absentDefault: boolean;
  circleId: string; date: string; items: GrantItem[];
  post: (url: string, body: Record<string, unknown>, okMsg: string) => Promise<void>;
  expanded: string | null; setExpanded: (id: string | null) => void;
}) {
  const range = (r: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }) =>
    formatAyah(r.fromSurah, r.fromAyah, r.toSurah, r.toAyah);

  if (students.length === 0) return <EmptyState title="لا طلاب ضمن هذا الفلتر" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
      {students.map((s) => {
        const b = board.get(s.studentId);
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
                  {b?.deferredToday && <Badge tone="bronze">{tu("deferredTodayBadge")}</Badge>}
                  {s.setupStatus && !s.setupStatus.isComplete && <Badge tone="danger">{tSetup("badgeNeedsSetup")}</Badge>}
                </span>
                <span style={{ display: "flex", gap: sp(2), alignItems: "center" }}>
                  {s.attendanceStatus
                    ? <Badge tone="success">{ATT_LABEL[s.attendanceStatus] ?? s.attendanceStatus}</Badge>
                    : absentDefault ? <Badge tone="danger">{tu("absentNotRaised")}</Badge> : <Badge tone="neutral">{tu("notRaised")}</Badge>}
                  {s.todayHifzDone && <Badge tone="bronze">{tu("hifzDone")}</Badge>}
                </span>
              </div>

              {/* سطر الملخّص: المرحلة · أمس · المطلوب · دورة الأسبوع — للمراقييّن فقط */}
              {b && s.program === "MARAQI" && (
                <div style={{ display: "flex", gap: sp(4), flexWrap: "wrap", fontSize: ui.text.xs, color: ui.color.muted }}>
                  {b.stageLabel && (
                    <span>
                      {tu("stageLabelPrefix")}<strong style={{ color: ui.color.text }}>{b.stageLabel}</strong>
                      {b.hizb != null ? <>{tu("hizbInline")}{arNum(b.hizb)}</> : ""}
                    </span>
                  )}
                  {b.yesterday && (
                    <span>
                      {tu("yesterdayLabel")}<strong style={{ color: ui.color.text }}>{range(b.yesterday)}</strong>
                      {!b.yesterday.mastered ? tu("notMasteredSuffix") : ""}
                    </span>
                  )}
                  {b.required && (
                    <span>
                      {tu("requiredTodayPrefix")}
                      <strong style={{ color: ui.color.text }}>
                        {tu("requiredTarseekhPrefix")}{arNum(b.required.tarseekhCount)}
                        {tu("requiredKhumsPrefix")}{arNum(b.required.khums)}
                      </strong>
                    </span>
                  )}
                  {b.weeklyPercent != null && (
                    <span>{tu("weeklyCyclePrefix")}<strong style={{ color: ui.color.text }}>{arNum(b.weeklyPercent)}٪</strong></span>
                  )}
                </div>
              )}
            </button>

            {/* وجهة اليوم (م٤) للمراقييّن */}
            {b && s.program === "MARAQI" && (
              <div style={{ borderTop: `1px solid ${ui.color.border}`, padding: `${sp(3)} ${sp(4)}` }}>
                <div style={{ fontSize: ui.text.xs, fontWeight: 700, color: ui.color.primary, marginBottom: sp(2) }}>{tu("todayTargetTitle")}</div>
                <TodayTargetView t={b.today} />
              </div>
            )}

            {/* قسم التسجيل (موسَّع) */}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${ui.color.border}`, padding: sp(4), background: ui.color.bg }}>
                {/* زر «مؤجَّل»: حاضرٌ لم يُسمَّع لضيق الوقت */}
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

function StudentPanel({ s, circleId, date, items, post }: {
  s: Student; circleId: string; date: string; items: GrantItem[];
  post: (url: string, body: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const hifzBound = (s.today.newHifz?.kind === "NEW" || s.today.newHifz?.kind === "REPEAT") ? (s.today.newHifz.bound ?? null) : null;

  const sid = s.studentId;
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

      {/* ١) الحضور */}
      <div>
        <h3 style={H3}>الحضور{s.attendanceStatus ? ` — ${ATT_LABEL[s.attendanceStatus] ?? s.attendanceStatus}` : ""}</h3>
        <div style={row}>
          {ATT_BUTTONS.map((b) => <Button key={b.status} size="sm" variant={b.tone} onClick={() => void markAtt(b.status)}>{b.label}</Button>)}
          <Button size="sm" variant="ghost" onClick={excuse}>{tu("excused")}</Button>
        </div>
      </div>

      {/* ٢) القاعدة أو المراقي أو رسالةٌ لغيرهما */}
      {s.qaidah ? <QaidahPanel q={s.qaidah} onEval={qaidahEval} onDefer={qaidahDefer} />
        : s.today.status === "ON_LEAVE" ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: 0 }}>{tu("onStageLeave")}</p>
        : s.today.status !== "ACTIVE" ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: 0 }}>{tu("noDailyTasks")}</p>
        : (
          <>
            <div>
              <h3 style={H3}>{tu("newHifz")}</h3>
              {s.today.newHifz?.kind === "COMPLETED" ? <p style={{ color: ui.color.success, margin: 0 }}>{tu("trackCompleted")}</p>
                : s.today.newHifz?.kind === "NO_TRACK" ? <TrackAssignInline studentId={sid} post={post} />
                : <>
                    <HifzInput
                      bound={hifzBound}
                      hifzKind={s.today.newHifz?.kind ?? null}
                      onSave={(st) => void post(`/api/students/${sid}/session`, { kind: "hifz", date, ...st }, "سُجِّل الحفظ.")}
                    />
                    <div style={{ ...row, marginTop: sp(2) }}>
                      <Button size="sm" variant="ghost" onClick={() => void extra("hifz")}>{tu("addMore")}</Button>
                    </div>
                  </>}
            </div>

            {s.today.hasTarsikh && (
            <div>
              <h3 style={H3}>الترسيخ{s.today.tarseekh.length ? ` (${s.today.tarseekh.length} وحدة)` : ""}</h3>
              <TarseekhInput bounds={s.today.tarseekh} onDone={(done) => void post(`/api/students/${sid}/session`, { kind: "tarseekh", date, done }, "سُجِّل الترسيخ.")} />
              <div style={{ ...row, marginTop: sp(2) }}>
                <Button size="sm" variant="ghost" onClick={() => void extra("tarseekh")}>{tu("addMore")}</Button>
              </div>
            </div>
            )}

            {s.today.hasMuraja && (
            <div>
              <h3 style={H3}>المراجعة{s.today.murajaah?.todaySlice.length ? " — حصّة اليوم" : ""}</h3>
              {s.today.murajaah?.totalStock === 0
                ? <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: `0 0 ${sp(2)}` }}>{tu("noRasikhYet")} <Button size="sm" variant="ghost" onClick={() => { window.location.href = "/admin/tracks"; }}>{tu("setPath")}</Button></p>
                : <MurajaahInput todaySlice={s.today.murajaah?.todaySlice ?? []} onRecord={(count) => void post(`/api/students/${sid}/session`, { kind: "murajaah", date, count }, "سُجِّلت المراجعة.")} />}
              <div style={{ ...row, marginTop: sp(2) }}>
                <Button size="sm" variant="ghost" onClick={() => void extra("murajaah")}>{tu("addMore")}</Button>
              </div>
            </div>
            )}
          </>)}

      {/* ٣) تقدير يدويّ */}
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
        {q.chapterName ? <>{tu("chapterPrefix")}<strong style={{ color: ui.color.text }}>{q.chapterName}</strong> · </> : null}
        الدرس: <strong style={{ color: ui.color.text }}>{q.lessonName ?? "—"}</strong>
        {q.lessonIndexInChapter && q.lessonsInChapter ? ` (${arNum(q.lessonIndexInChapter)}/${arNum(q.lessonsInChapter)})` : ""}
        {" · "}{arNum(q.percent)}٪
        {q.consecutiveDeferrals > 0 ? <> · <Badge tone="bronze">تأجيلات متتالية: {arNum(q.consecutiveDeferrals)}</Badge></> : null}
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
