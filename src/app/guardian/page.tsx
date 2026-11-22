"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { AppShell, Card, Badge, Skeleton, ui, sp } from "@/components/ui";
import { arNum } from "@/lib/format";
import { tG } from "@/i18n/ar/guardian";
import { useMe } from "@/lib/useMe";
import { makkahDayDate } from "@/lib/makkah-day";

type KhatmKind = "DATE" | "INSUFFICIENT_DATA" | "NO_TRACK" | "COMPLETE";
interface KhatmData {
  kind: KhatmKind;
  date?: string;
  remainingUnits?: number;
  regularityPct?: number;
}

function KhatmEstimate({ studentId, token }: { studentId: string; token: string }) {
  const [data, setData] = useState<KhatmData | null>(null);

  useEffect(() => {
    void fetch(`/api/students/${studentId}/khatm-estimate`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: KhatmData | null) => setData(j))
      .catch(() => null);
  }, [studentId, token]);

  if (!data) return null;
  if (data.kind === "NO_TRACK") return null;

  let text = "";
  if (data.kind === "INSUFFICIENT_DATA") text = tG("khatmInsufficient");
  else if (data.kind === "COMPLETE") text = tG("khatmComplete");
  else if (data.kind === "DATE" && data.date) {
    const d = new Date(data.date);
    text = tG("khatmDate") + d.toLocaleDateString("ar-SA");
  }

  return (
    <div style={{ marginTop: sp(2), fontSize: ui.text.xs, color: ui.color.muted }}>
      {tG("khatmTitle")}: <span style={{ color: ui.color.text }}>{text}</span>
    </div>
  );
}

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

function ChildCard({ child, token }: { child: ChildData; token: string }) {
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
            <span
              style={{
                marginInlineStart: sp(2),
                color: ui.color.muted,
                fontSize: ui.text.xs,
              }}
            >
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
      <KhatmEstimate studentId={child.studentId} token={token} />
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

export default function GuardianPage() {
  const { me } = useMe();
  const todayStr = makkahDayDate(new Date());
  const [date, setDate] = useState<string>(todayStr);
  const [children, setChildren] = useState<ChildData[] | null>(null);
  const [token, setToken] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    async (d: string) => {
      setChildren(null);
      setErr(null);
      try {
        const {
          data: { session },
        } = await supabaseBrowser().auth.getSession();
        if (!session) {
          window.location.href = "/login";
          return;
        }
        setToken(session.access_token);
        const auth = { authorization: `Bearer ${session.access_token}` };
        const qs = d !== todayStr ? `?date=${d}` : "";
        const res = await fetch(`/api/guardian/children${qs}`, { headers: auth });
        if (!res.ok) {
          setErr(tG("errLoad"));
          return;
        }
        setChildren((await res.json()) as ChildData[]);
      } catch {
        setErr(tG("errLoad"));
      }
    },
    [todayStr],
  );

  useEffect(() => {
    void load(date);
  }, [date, load]);

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

  return (
    <AppShell
      roles={me.roles}
      userName={me.name ?? ""}
      activeHref="/guardian"
      title={tG("title")}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: tG("title") }]}
    >
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

      {children === null ? (
        <Skeleton />
      ) : children.length === 0 ? (
        <Card>
          <p style={{ color: ui.color.muted, textAlign: "center", margin: 0 }}>
            {tG("noChildren")}
          </p>
        </Card>
      ) : (
        children.map((child) => <ChildCard key={child.studentId} child={child} token={token} />)
      )}
    </AppShell>
  );
}
