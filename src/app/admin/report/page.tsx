"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { AppShell, Card, Badge, Skeleton, ui, sp } from "@/components/ui";
import { arNum } from "@/lib/format";
import { tR } from "@/i18n/ar/report";
import { useMe } from "@/lib/useMe";
import { makkahDayDate } from "@/lib/makkah-day";
import type {
  TeacherDailyReport,
  SupervisorDailyReport,
  AdminDailyReport,
  StudentDailyReport,
  MuddakirDailyReport,
} from "@/server/report-daily";

type DailyReport =
  | TeacherDailyReport[]
  | SupervisorDailyReport
  | AdminDailyReport
  | StudentDailyReport
  | MuddakirDailyReport
  | { kind: "none"; date: string };

// ─── مكوّنات العرض ──────────────────────────────────────────────────────────

function AttRow({ label, value, dim }: { label: string; value: number; dim?: boolean }) {
  return (
    <>
      <span style={{ color: dim ? ui.color.muted : ui.color.text }}>{label}</span>
      <span style={{ textAlign: "start", color: dim ? ui.color.muted : ui.color.text }}>
        {arNum(value)}
      </span>
    </>
  );
}

function AttGrid({ att }: { att: { total: number; present: number; late: number; excused: number; absent: number; leftEarly: number; notRecorded: number } }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: `${sp(1)} ${sp(4)}`, fontSize: ui.text.xs, marginBottom: sp(3) }}>
      <AttRow label={tR("total")} value={att.total} />
      <AttRow label={tR("present")} value={att.present} />
      {att.late > 0 && <AttRow label={tR("late")} value={att.late} />}
      {att.excused > 0 && <AttRow label={tR("excused")} value={att.excused} />}
      {att.leftEarly > 0 && <AttRow label={tR("leftEarly")} value={att.leftEarly} />}
      <AttRow label={tR("absent")} value={att.absent} />
      {att.notRecorded > 0 && <AttRow label={tR("notRecorded")} value={att.notRecorded} dim />}
    </div>
  );
}

function TeacherReportView({ reports }: { reports: TeacherDailyReport[] }) {
  if (reports.length === 0)
    return <Card><p style={{ color: ui.color.muted, margin: 0 }}>{tR("noCirclesAssigned")}</p></Card>;

  return (
    <>
      {reports.map((r) => (
        <Card key={r.circleId} style={{ marginBottom: sp(4) }}>
          <h3 style={{ margin: `0 0 ${sp(2)} 0`, fontSize: ui.text.base }}>{r.circleName}</h3>
          <AttGrid att={r.attendance} />

          {/* من لم يُسمَّع */}
          <div style={{ marginBottom: sp(3) }}>
            <div style={{ fontWeight: 600, fontSize: ui.text.xs, marginBottom: sp(1) }}>{tR("notRecitedTitle")}</div>
            {r.notRecited.length === 0
              ? <span style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{tR("noNotRecited")}</span>
              : <div style={{ fontSize: ui.text.xs }}>{r.notRecited.map((s) => s.name).join("، ")}</div>}
          </div>

          {/* مقاطع متكرّرة */}
          {r.repeated.length > 0 && (
            <div style={{ marginBottom: sp(3) }}>
              <div style={{ fontWeight: 600, fontSize: ui.text.xs, marginBottom: sp(1) }}>{tR("repeatedTitle")}</div>
              <div style={{ fontSize: ui.text.xs }}>
                {r.repeated.map((s) => `${s.name} (${arNum(s.hifzAttempts ?? 0)} محاولات)`).join("، ")}
              </div>
            </div>
          )}

          {/* جدول الطلاب */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: ui.text.xs, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${ui.color.border}` }}>
                  {[tR("studentName"), tR("attendanceCol"), tR("hifzCol"), tR("tarseekhCol"), tR("murajaahCol")].map((h) => (
                    <th key={h} style={{ padding: `${sp(1)} ${sp(2)}`, textAlign: "start", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.students.map((s) => (
                  <tr key={s.studentId} style={{ borderBottom: `1px solid ${ui.color.border}` }}>
                    <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{s.name}</td>
                    <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{s.attendanceStatus ?? tR("notRecorded")}</td>
                    <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{s.hifzRange ?? tR("noSession")}</td>
                    <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{s.tarseekhDone ? tR("done") : tR("notDone")}</td>
                    <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{s.murajaahDone ? tR("done") : tR("notDone")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </>
  );
}

function SupervisorReportView({ report }: { report: SupervisorDailyReport }) {
  return (
    <Card>
      <h3 style={{ margin: `0 0 ${sp(2)} 0`, fontSize: ui.text.base }}>{tR("attendanceSummary")}</h3>
      <AttGrid att={report.totals} />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: ui.text.xs, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${ui.color.border}` }}>
              {[tR("circleName"), tR("present"), tR("absent"), tR("sessions")].map((h) => (
                <th key={h} style={{ padding: `${sp(1)} ${sp(2)}`, textAlign: "start", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.circles.map((c) => (
              <tr key={c.circleId} style={{ borderBottom: `1px solid ${ui.color.border}` }}>
                <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{c.circleName}</td>
                <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{arNum(c.present)}</td>
                <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{arNum(c.absent)}</td>
                <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{arNum(c.sessions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AdminReportView({ report }: { report: AdminDailyReport }) {
  return (
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: `${sp(2)} ${sp(6)}`, fontSize: ui.text.xs }}>
        <span style={{ color: ui.color.muted }}>{tR("totalStudents")}</span>
        <span style={{ fontWeight: 700 }}>{arNum(report.totalStudents)}</span>
        <span style={{ color: ui.color.muted }}>{tR("present")}</span>
        <span style={{ fontWeight: 700, color: "var(--color-success, #22c55e)" }}>{arNum(report.present)}</span>
        <span style={{ color: ui.color.muted }}>{tR("absent")}</span>
        <span>{arNum(report.absent)}</span>
        <span style={{ color: ui.color.muted }}>{tR("totalSessions")}</span>
        <span>{arNum(report.sessions)}</span>
        <span style={{ color: ui.color.muted }}>{tR("attendanceRate")}</span>
        <span style={{ fontWeight: 700 }}>{arNum(report.attendanceRate)}%</span>
      </div>
    </Card>
  );
}

function StudentReportView({ report }: { report: StudentDailyReport }) {
  const statusTone = (s: StudentDailyReport["attendanceStatus"]): "success" | "danger" | "bronze" | "neutral" => {
    if (s === "PRESENT") return "success";
    if (s === "ABSENT_UNEXCUSED" || s === "ABSENT_EXCUSED") return "danger";
    if (s === "LATE" || s === "PRE_EXCUSED" || s === "LEFT_EARLY") return "bronze";
    return "neutral";
  };
  return (
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: `${sp(2)} ${sp(6)}`, fontSize: ui.text.xs }}>
        <span style={{ color: ui.color.muted }}>{tR("myAttendance")}</span>
        <span>
          <Badge tone={statusTone(report.attendanceStatus)}>
            {report.attendanceStatus ?? tR("notRecorded")}
          </Badge>
        </span>
        <span style={{ color: ui.color.muted }}>{tR("mySession")}</span>
        <span>{report.hifzRange ?? tR("noSession")}</span>
        <span style={{ color: ui.color.muted }}>{tR("myPoints")}</span>
        <span>{arNum(report.pointsToday)} {tR("pointsUnit")}</span>
      </div>
    </Card>
  );
}

function MuddakirReportView({ report }: { report: MuddakirDailyReport }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: sp(3) }}>
        <span style={{ fontWeight: 700 }}>{tR("muddakirTitle")}</span>
        <span style={{ color: ui.color.muted, fontSize: ui.text.xs }}>
          {tR("muddakirCompleted")}: {arNum(report.completed)}/{arNum(report.total)}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: ui.text.xs, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${ui.color.border}` }}>
              {[tR("studentName"), tR("newPagesCol"), tR("ribatCol"), tR("reviewCol")].map((h) => (
                <th key={h} style={{ padding: `${sp(1)} ${sp(2)}`, textAlign: "start", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.studentId} style={{ borderBottom: `1px solid ${ui.color.border}` }}>
                <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{r.name}</td>
                <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{r.newPages ?? tR("notDone")}</td>
                <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{r.ribatDone ? tR("done") : tR("notDone")}</td>
                <td style={{ padding: `${sp(1)} ${sp(2)}` }}>{r.reviewDone ? tR("done") : tR("notDone")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReportContent({ report }: { report: DailyReport }) {
  if (Array.isArray(report)) return <TeacherReportView reports={report} />;
  if (report.kind === "supervisor") return <SupervisorReportView report={report} />;
  if (report.kind === "admin") return <AdminReportView report={report} />;
  if (report.kind === "student") return <StudentReportView report={report} />;
  if (report.kind === "muddakir") return <MuddakirReportView report={report} />;
  return <Card><p style={{ color: ui.color.muted, margin: 0 }}>{tR("noReport")}</p></Card>;
}

// ─── الصفحة الرئيسية ─────────────────────────────────────────────────────────

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

export default function DailyReportPage() {
  const { me } = useMe();
  const todayStr = makkahDayDate(new Date());
  const [date, setDate] = useState(todayStr);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setReport(null);
    setErr(null);
    try {
      const { data: { session } } = await supabaseBrowser().auth.getSession();
      if (!session) { window.location.href = "/login"; return; }
      const qs = d !== todayStr ? `?date=${d}` : "";
      const res = await fetch(`/api/report/daily${qs}`, {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { setErr(tR("errLoad")); return; }
      setReport(await res.json() as DailyReport);
    } catch {
      setErr(tR("errLoad"));
    }
  }, [todayStr]);

  useEffect(() => { void load(date); }, [date, load]);

  const isToday = date === todayStr;

  const centered: React.CSSProperties = {
    minHeight: "100dvh", display: "flex", alignItems: "center",
    justifyContent: "center", background: ui.color.bg, fontFamily: ui.font, color: ui.color.text,
  };

  if (err) return <main dir="rtl" style={centered}>{err}</main>;
  if (!me) return <main dir="rtl" style={centered}><Skeleton /></main>;

  return (
    <AppShell roles={me.roles} userName={me.name ?? ""} activeHref="/admin/report"
      title={tR("title")}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: tR("title") }]}>

      {/* شريط التنقل */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: sp(3), marginBottom: sp(4) }}>
        <button onClick={() => setDate(prevDay(date))}
          style={{ background: "none", border: `1px solid ${ui.color.border}`, borderRadius: 6, padding: `${sp(1)} ${sp(3)}`, cursor: "pointer", color: ui.color.text }}>
          {tR("prevDay")}
        </button>
        <span style={{ fontWeight: 600, fontSize: ui.text.xs }}>
          {isToday ? tR("today") : date}
        </span>
        <button onClick={() => setDate(nextDay(date))} disabled={isToday}
          style={{ background: "none", border: `1px solid ${ui.color.border}`, borderRadius: 6, padding: `${sp(1)} ${sp(3)}`, cursor: isToday ? "default" : "pointer", color: isToday ? ui.color.muted : ui.color.text, opacity: isToday ? 0.5 : 1 }}>
          {tR("nextDay")}
        </button>
      </div>

      {report === null ? <Skeleton /> : <ReportContent report={report} />}
    </AppShell>
  );
}
