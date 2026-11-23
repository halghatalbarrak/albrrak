"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { AppShell, Card, Badge, Skeleton, ui, sp } from "@/components/ui";
import { arNum } from "@/lib/format";
import { tG } from "@/i18n/ar/guardian";
import { useMe } from "@/lib/useMe";
import { makkahDayDate } from "@/lib/makkah-day";
import type { ChildSummary, AttendanceDay } from "@/server/guardian-summary";

const AnalyticsBar = dynamic(
  () => import("@/components/analytics/AnalyticsBar").then((m) => m.AnalyticsBar),
  { ssr: false },
);

// ── أنواع داخليّة ───────────────────────────────────────────────

interface ChildAttendance {
  status: "PRESENT" | "LATE" | "LEFT_EARLY" | "EXCUSED" | "ABSENT" | null;
}

interface ChildSession {
  hifzFromSurah: number | null;
  hifzFromAyah: number | null;
  hifzToSurah: number | null;
  hifzToAyah: number | null;
  tarseekhDone: boolean | null;
  murajaahDone: boolean | null;
}

interface ChildData {
  studentId: string;
  name: string;
  programName: string | null;
  attendance: ChildAttendance;
  session: ChildSession | null;
  points: number;
  nextStationLabel: string | null;
}

// ── مساعدات حضور ────────────────────────────────────────────────

function attendanceLabel(status: ChildAttendance["status"]): string {
  if (!status) return tG("notRecorded");
  const map: Record<NonNullable<ChildAttendance["status"]>, string> = {
    PRESENT: tG("present"),
    LATE: tG("late"),
    LEFT_EARLY: tG("leftEarly"),
    EXCUSED: tG("excused"),
    ABSENT: tG("absent"),
  };
  return map[status];
}

function attendanceTone(
  status: ChildAttendance["status"],
): "success" | "bronze" | "danger" | "neutral" {
  if (status === "PRESENT") return "success";
  if (status === "LATE" || status === "LEFT_EARLY" || status === "EXCUSED") return "bronze";
  if (status === "ABSENT") return "danger";
  return "neutral";
}

// ── خلفيّة مربّع سجل الحضور ────────────────────────────────────

function dayColor(s: AttendanceDay["status"]): string {
  if (!s) return ui.color.border;
  if (s === "PRESENT" || s === "LATE" || s === "LEFT_EARLY") return "#22c55e";
  if (s === "ABSENT_EXCUSED" || s === "PRE_EXCUSED") return "#eab308";
  return "#ef4444";
}

// ── مكوّنات ──────────────────────────────────────────────────────

function SessionLine({ session }: { session: ChildSession | null }) {
  if (!session) return <span style={{ color: ui.color.muted }}>{tG("noSession")}</span>;
  const parts: string[] = [];
  if (session.hifzFromSurah != null && session.hifzToSurah != null) {
    parts.push(
      `${tG("from")} ${tG("surah")} ${arNum(session.hifzFromSurah)}:${arNum(session.hifzFromAyah ?? 1)} ${tG("to")} ${tG("surah")} ${arNum(session.hifzToSurah)}:${arNum(session.hifzToAyah ?? 1)}`,
    );
  }
  if (session.tarseekhDone) parts.push(tG("tarseekhDone"));
  if (session.murajaahDone) parts.push(tG("murajaahDone"));
  if (parts.length === 0) return <span style={{ color: ui.color.muted }}>{tG("noSession")}</span>;
  return <span>{parts.join(" · ")}</span>;
}

function ChildCard({ child }: { child: ChildData }) {
  return (
    <Card style={{ marginBottom: sp(4) }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: sp(2),
        }}
      >
        <div>
          <span style={{ fontWeight: 700, fontSize: ui.text.base }}>{child.name}</span>
          {child.programName && (
            <span style={{ marginInlineStart: sp(2), color: ui.color.muted, fontSize: ui.text.xs }}>
              {child.programName}
            </span>
          )}
        </div>
        <Badge tone={attendanceTone(child.attendance.status)}>
          {attendanceLabel(child.attendance.status)}
        </Badge>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: `${sp(1)} ${sp(3)}`,
          fontSize: ui.text.xs,
        }}
      >
        <span style={{ color: ui.color.muted, fontWeight: 600 }}>{tG("recited")}</span>
        <SessionLine session={child.session} />
        <span style={{ color: ui.color.muted, fontWeight: 600 }}>{tG("points")}</span>
        <span>
          {arNum(child.points)} {tG("pointsUnit")}
        </span>
        <span style={{ color: ui.color.muted, fontWeight: 600 }}>{tG("nextStation")}</span>
        <span>{child.nextStationLabel ?? tG("noNextStation")}</span>
      </div>
    </Card>
  );
}

/** شبكة مربّعات الحضور — ٣٠ خليّة */
function AttendanceGrid({ history }: { history: AttendanceDay[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: sp(2) }}>
      {history.map((d) => (
        <div
          key={d.date}
          title={d.date}
          style={{
            width: 18,
            height: 18,
            borderRadius: 3,
            background: dayColor(d.status),
          }}
        />
      ))}
    </div>
  );
}

/** لوحة ملخّص الابن (تبويب محدَّد) */
function ChildSummaryPanel({ summary }: { summary: ChildSummary }) {
  const pct = (n: number) => `${Math.round(n * 100)}٪`;

  const barData = summary.history.map((d) => ({
    label: d.date.slice(5),
    حاضر: d.status === "PRESENT" || d.status === "LATE" || d.status === "LEFT_EARLY" ? 1 : 0,
  }));

  return (
    <Card style={{ marginBottom: sp(4) }}>
      <div style={{ marginBottom: sp(3), fontWeight: 700, fontSize: ui.text.base }}>
        {tG("attendanceHistory")}
      </div>

      <AttendanceGrid history={summary.history} />

      <AnalyticsBar
        data={barData}
        bars={[{ key: "حاضر", label: tG("present"), color: "#22c55e" }]}
        height={120}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: sp(3),
          marginTop: sp(3),
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: ui.text.lg, fontWeight: 700, color: "#22c55e" }}>
            {arNum(summary.presentCount)}
          </div>
          <div style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tG("statsPresent")}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: ui.text.lg, fontWeight: 700, color: "#ef4444" }}>
            {arNum(summary.absentCount)}
          </div>
          <div style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tG("statsAbsent")}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: ui.text.lg, fontWeight: 700 }}>
            {arNum(summary.totalDays)}
          </div>
          <div style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tG("statsTotal")}</div>
        </div>
      </div>

      {summary.circleAvgRate !== null && (
        <div
          data-testid="circle-avg"
          style={{
            marginTop: sp(3),
            padding: sp(2),
            background: ui.color.surface,
            borderRadius: 6,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>
            {tG("circleAvgLabel")}
          </span>
          <span style={{ fontWeight: 700, fontSize: ui.text.base }}>
            {pct(summary.circleAvgRate)}
          </span>
        </div>
      )}
    </Card>
  );
}

function prevDay(date: string): string {
  const d = new Date(`${date}T12:00:00+03:00`);
  d.setDate(d.getDate() - 1);
  return makkahDayDate(d);
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00+03:00`);
  d.setDate(d.getDate() + 1);
  return makkahDayDate(d);
}

// ── الصفحة الرئيسيّة ─────────────────────────────────────────────

export default function GuardianPage() {
  const { me } = useMe();
  const todayStr = makkahDayDate(new Date());
  const [date, setDate] = useState<string>(todayStr);
  const [children, setChildren] = useState<ChildData[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, ChildSummary>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  const getAuth = useCallback(async () => {
    const {
      data: { session },
    } = await supabaseBrowser().auth.getSession();
    if (!session) {
      window.location.href = "/login";
      return null;
    }
    return { authorization: `Bearer ${session.access_token}` };
  }, []);

  const load = useCallback(
    async (d: string) => {
      setChildren(null);
      setErr(null);
      const auth = await getAuth();
      if (!auth) return;
      try {
        const qs = d !== todayStr ? `?date=${d}` : "";
        const res = await fetch(`/api/guardian/children${qs}`, { headers: auth });
        if (!res.ok) { setErr(tG("errLoad")); return; }
        const list = (await res.json()) as ChildData[];
        setChildren(list);
        if (list.length > 0 && !activeChildId) setActiveChildId(list[0].studentId);
      } catch {
        setErr(tG("errLoad"));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayStr, getAuth],
  );

  const loadSummary = useCallback(
    async (studentId: string) => {
      if (summaries[studentId]) return;
      setSummaryLoading(true);
      setSummaryErr(null);
      const auth = await getAuth();
      if (!auth) return;
      try {
        const res = await fetch(`/api/guardian/children/${studentId}`, { headers: auth });
        if (!res.ok) { setSummaryErr(tG("errLoadSummary")); return; }
        const data = (await res.json()) as ChildSummary;
        setSummaries((prev) => ({ ...prev, [studentId]: data }));
      } catch {
        setSummaryErr(tG("errLoadSummary"));
      } finally {
        setSummaryLoading(false);
      }
    },
    [summaries, getAuth],
  );

  useEffect(() => { void load(date); }, [date, load]);

  useEffect(() => {
    if (activeChildId) void loadSummary(activeChildId);
  }, [activeChildId, loadSummary]);

  const isToday = date === todayStr;

  const centered: React.CSSProperties = {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: ui.color.bg,
    fontFamily: ui.font,
    color: ui.color.text,
  };

  if (err) return <main dir="rtl" style={centered}>{err}</main>;
  if (!me) return <main dir="rtl" style={centered}><Skeleton /></main>;

  const selectedChild = children?.find((c) => c.studentId === activeChildId) ?? null;

  return (
    <AppShell
      roles={me.roles}
      userName={me.name ?? ""}
      activeHref="/guardian"
      title={tG("title")}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: tG("title") }]}
    >
      {children === null ? (
        <Skeleton />
      ) : children.length === 0 ? (
        <Card>
          <p style={{ color: ui.color.muted, textAlign: "center", margin: 0 }}>
            {tG("noChildren")}
          </p>
        </Card>
      ) : (
        <>
          {/* تبويبات الأبناء */}
          {children.length > 1 && (
            <div
              data-testid="child-tabs"
              style={{
                display: "flex",
                gap: sp(2),
                marginBottom: sp(4),
                borderBottom: `1px solid ${ui.color.border}`,
                paddingBottom: sp(2),
              }}
            >
              {children.map((child) => (
                <button
                  key={child.studentId}
                  data-testid={`tab-${child.studentId}`}
                  onClick={() => setActiveChildId(child.studentId)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: `${sp(1)} ${sp(3)}`,
                    cursor: "pointer",
                    fontFamily: ui.font,
                    fontSize: ui.text.xs,
                    fontWeight: activeChildId === child.studentId ? 700 : 400,
                    color:
                      activeChildId === child.studentId ? ui.color.text : ui.color.muted,
                    borderBottom:
                      activeChildId === child.studentId
                        ? `2px solid ${ui.color.text}`
                        : "2px solid transparent",
                  }}
                >
                  {child.name}
                </button>
              ))}
            </div>
          )}

          {/* لوحة ملخّص الابن المحدَّد */}
          {summaryLoading && <Skeleton />}
          {summaryErr && (
            <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{summaryErr}</p>
          )}
          {activeChildId && summaries[activeChildId] && !summaryLoading && (
            <ChildSummaryPanel summary={summaries[activeChildId]} />
          )}

          {/* شريط التنقل بين الأيام */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: sp(3),
              marginBottom: sp(4),
            }}
          >
            <button
              onClick={() => setDate(prevDay(date))}
              style={{
                background: "none",
                border: `1px solid ${ui.color.border}`,
                borderRadius: 6,
                padding: `${sp(1)} ${sp(3)}`,
                cursor: "pointer",
                color: ui.color.text,
              }}
            >
              {tG("prevDay")}
            </button>
            <span style={{ fontWeight: 600, fontSize: ui.text.xs }}>
              {isToday ? tG("today") : date}
            </span>
            <button
              onClick={() => setDate(nextDay(date))}
              disabled={isToday}
              style={{
                background: "none",
                border: `1px solid ${ui.color.border}`,
                borderRadius: 6,
                padding: `${sp(1)} ${sp(3)}`,
                cursor: isToday ? "default" : "pointer",
                color: isToday ? ui.color.muted : ui.color.text,
                opacity: isToday ? 0.5 : 1,
              }}
            >
              {tG("nextDay")}
            </button>
          </div>

          {/* بطاقة الابن المحدَّد (أو الكلّ إن ابنٌ واحد) */}
          {selectedChild ? (
            <ChildCard child={selectedChild} />
          ) : (
            children.map((child) => <ChildCard key={child.studentId} child={child} />)
          )}
        </>
      )}
    </AppShell>
  );
}
