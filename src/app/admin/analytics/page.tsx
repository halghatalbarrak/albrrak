"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { hijri } from "@/lib/format";
import { makkahDayDate } from "@/lib/makkah-day";
import { AppShell, Card, Skeleton, ui, sp } from "@/components/ui";
import { tA } from "@/i18n/ar/analytics";
import type { AnalyticsOverview, ASeriesPoint, ACircleRow, AnalyticsPeriod } from "@/server/analytics-overview";

const AnalyticsBar = dynamic(() => import("@/components/analytics/AnalyticsBar").then((m) => ({ default: m.AnalyticsBar })), { ssr: false });

// ─── مكوّنات ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, unit, dim }: { label: string; value: string; unit?: string; dim?: boolean }) {
  return (
    <div style={{
      background: ui.color.surface, border: `1px solid ${ui.color.border}`,
      borderRadius: ui.radius.lg, padding: sp(4), flex: "1 1 150px", minWidth: 130,
    }}>
      <div style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(1) }}>{label}</div>
      <div style={{ fontSize: ui.text.xl, fontWeight: 700, color: dim ? ui.color.muted : ui.color.primary }}>
        {value}
        {unit && <span style={{ fontSize: ui.text.xs, marginRight: sp(1), color: ui.color.muted }}>{unit}</span>}
      </div>
    </div>
  );
}

function PeriodToggle({ value, onChange }: { value: AnalyticsPeriod; onChange: (p: AnalyticsPeriod) => void }) {
  const opts: { v: AnalyticsPeriod; l: string }[] = [
    { v: "day", l: tA("periodDay") },
    { v: "week", l: tA("periodWeek") },
    { v: "month", l: tA("periodMonth") },
  ];
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, overflow: "hidden" }}>
      {opts.map(({ v, l }) => (
        <button
          key={v}
          data-testid={`period-${v}`}
          onClick={() => onChange(v)}
          style={{
            padding: `${sp(2)} ${sp(4)}`, fontSize: ui.text.xs, cursor: "pointer",
            background: value === v ? ui.color.primary : ui.color.surface,
            color: value === v ? "#fff" : ui.color.text,
            border: "none", borderLeft: `1px solid ${ui.color.border}`,
          }}
        >{l}</button>
      ))}
    </div>
  );
}

function CirclesSection({ data, donorMode }: { data: NonNullable<AnalyticsOverview["circles"]>; donorMode: boolean }) {
  const rate = data.attendanceRate != null ? `${arNum(Math.round(data.attendanceRate * 100))}٪` : "—";
  const attSeries = data.series.map((s: ASeriesPoint) => ({ label: s.label, [tA("chartPresent")]: s.present, [tA("chartTotal")]: s.total }));
  const sessSeries = data.series.map((s: ASeriesPoint) => ({ label: s.label, [tA("chartCompleted")]: s.sessions }));

  return (
    <section>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(4) }}>{tA("grpCircles")}</h2>

      {/* KPIs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: sp(3), marginBottom: sp(6) }}>
        <KpiCard label={tA("kpiActiveStudents")} value={arNum(data.activeStudents)} unit={tA("unit_students")} />
        <KpiCard label={tA("kpiAttendanceRate")} value={rate} />
        <KpiCard label={tA("kpiMasteredSessions")} value={arNum(data.masteredSessions)} unit={tA("unit_sessions")} />
        <KpiCard label={tA("kpiKhatm")} value={arNum(data.khatmCount)} unit={tA("unit_students")} />
        <KpiCard label={tA("kpiStruggling")} value={arNum(data.struggling)} dim />
      </div>

      {/* رسم الحضور */}
      <Card style={{ marginBottom: sp(4) }}>
        <div style={{ fontWeight: 600, fontSize: ui.text.base, marginBottom: sp(3) }}>{tA("chartAttendanceTitle")}</div>
        <AnalyticsBar
          data={attSeries}
          bars={[
            { key: tA("chartPresent"), label: tA("chartPresent"), color: ui.color.primary },
            { key: tA("chartTotal"), label: tA("chartTotal"), color: ui.color.border },
          ]}
          height={160}
        />
        {/* جدول تحت الرسم */}
        <div style={{ overflowX: "auto", marginTop: sp(3) }}>
          <table style={{ width: "100%", fontSize: ui.text.xs, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["", tA("chartPresent"), tA("chartTotal"), tA("tableRate")].map((h) => (
                  <th key={h} style={{ padding: `${sp(1)} ${sp(2)}`, textAlign: "start", color: ui.color.muted, borderBottom: `1px solid ${ui.color.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.series.map((s: ASeriesPoint) => {
                const r = s.total > 0 ? Math.round((s.present / s.total) * 100) : null;
                return (
                  <tr key={s.label}>
                    <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{s.label}</td>
                    <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{arNum(s.present)}</td>
                    <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{arNum(s.total)}</td>
                    <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{r !== null ? `${arNum(r)}٪` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* رسم الجلسات */}
      <Card style={{ marginBottom: sp(4) }}>
        <div style={{ fontWeight: 600, fontSize: ui.text.base, marginBottom: sp(3) }}>{tA("chartSessionsTitle")}</div>
        <AnalyticsBar
          data={sessSeries}
          bars={[{ key: tA("chartCompleted"), label: tA("chartCompleted"), color: "var(--color-bronze, #C29A6F)" }]}
          height={140}
        />
        <div style={{ overflowX: "auto", marginTop: sp(3) }}>
          <table style={{ width: "100%", fontSize: ui.text.xs, borderCollapse: "collapse" }}>
            <tbody>
              {data.series.map((s: ASeriesPoint) => (
                <tr key={s.label}>
                  <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{s.label}</td>
                  <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{arNum(s.sessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* جدول مقارنة الحلقات */}
      {!donorMode && data.circles.length > 0 && (
        <Card>
          <div style={{ fontWeight: 600, fontSize: ui.text.base, marginBottom: sp(3) }}>{tA("grpCircles")}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: ui.text.xs, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[tA("tableCircleName"), tA("tableStudents"), tA("tablePresent"), tA("tableTotal"), tA("tableRate"), tA("tableSessions")].map((h) => (
                    <th key={h} style={{ padding: `${sp(1)} ${sp(2)}`, textAlign: "start", color: ui.color.muted, borderBottom: `1px solid ${ui.color.border}`, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.circles.map((c: ACircleRow) => {
                  const cr = c.total > 0 ? Math.round((c.present / c.total) * 100) : null;
                  return (
                    <tr key={c.circleId}>
                      <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{c.name}</td>
                      <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{arNum(c.studentCount)}</td>
                      <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{arNum(c.present)}</td>
                      <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{arNum(c.total)}</td>
                      <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{cr !== null ? `${arNum(cr)}٪` : "—"}</td>
                      <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{arNum(c.sessions)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {donorMode && (
        <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: 0 }}>{tA("donorNote")}</p>
      )}
    </section>
  );
}

function MuddakirSection({ data }: { data: NonNullable<AnalyticsOverview["muddakir"]> }) {
  const muddSeries = data.series.map((s) => ({
    label: s.label,
    [tA("chartCompleted")]: s.completed,
    [tA("chartTotal")]: s.total,
  }));
  return (
    <section style={{ marginTop: sp(8) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(4) }}>{tA("grpMuddakir")}</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: sp(3), marginBottom: sp(6) }}>
        <KpiCard label={tA("kpiActiveHuffaz")} value={arNum(data.activeHuffaz)} unit={tA("unit_students")} />
        <KpiCard label={tA("kpiCompletedDays")} value={arNum(data.completedDaysInPeriod)} unit={tA("unit_days")} />
      </div>
      <Card>
        <div style={{ fontWeight: 600, fontSize: ui.text.base, marginBottom: sp(3) }}>{tA("chartMuddakirTitle")}</div>
        <AnalyticsBar
          data={muddSeries}
          bars={[
            { key: tA("chartCompleted"), label: tA("chartCompleted"), color: ui.color.primary },
            { key: tA("chartTotal"), label: tA("chartTotal"), color: ui.color.border },
          ]}
          height={150}
        />
        <div style={{ overflowX: "auto", marginTop: sp(3) }}>
          <table style={{ width: "100%", fontSize: ui.text.xs, borderCollapse: "collapse" }}>
            <tbody>
              {data.series.map((s) => (
                <tr key={s.label}>
                  <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{s.label}</td>
                  <td style={{ padding: `${sp(1)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{arNum(s.completed)}/{arNum(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

// ─── الصفحة ──────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { me } = useMe();
  const [period, setPeriod] = useState<AnalyticsPeriod>("week");
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (p: AnalyticsPeriod) => {
    setLoading(true);
    setErr(null);
    try {
      const { data: { session } } = await supabaseBrowser().auth.getSession();
      if (!session) { window.location.href = "/login"; return; }
      const res = await fetch(`/api/analytics/overview?period=${p}`, {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { setErr(tA("errLoad")); setLoading(false); return; }
      setData(await res.json() as AnalyticsOverview);
    } catch {
      setErr(tA("errLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(period); }, [period, load]);

  // عنوان الشهر الهجريّ+الميلادي عند اختيار الشهريّ
  const todayIso = makkahDayDate(new Date());
  const hijriMonth = period === "month" ? hijri(todayIso) : null;

  if (!me) {
    return (
      <AppShell roles={[]} userName="" activeHref="/admin/analytics" title={tA("pageTitle")}>
        <div style={{ padding: sp(6) }}><Skeleton /></div>
      </AppShell>
    );
  }

  return (
    <AppShell
      roles={me.roles}
      userName={me.name ?? ""}
      activeHref="/admin/analytics"
      title={tA("pageTitle")}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: tA("pageTitle") }]}
    >
      <div style={{ padding: `${sp(4)} ${sp(4)}`, maxWidth: 960, margin: "0 auto" }}>

        {/* ترويسة + مبدّل */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: sp(3), marginBottom: sp(6), justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, color: ui.color.muted, fontSize: ui.text.xs }}>{tA("pageSubtitle")}</p>
            {hijriMonth && (
              <p style={{ margin: `${sp(1)} 0 0`, fontSize: ui.text.xs, color: ui.color.muted }}>
                {hijriMonth} · {todayIso.slice(0, 7)}
              </p>
            )}
          </div>
          <PeriodToggle value={period} onChange={(p) => { setPeriod(p); }} />
        </div>

        {loading && <div data-testid="analytics-loading"><Skeleton /></div>}
        {err && <p style={{ color: ui.color.danger }}>{err}</p>}

        {data && !loading && (
          <div data-testid="analytics-content">
            {data.circles && <CirclesSection data={data.circles} donorMode={data.donorMode} />}
            {data.muddakir && <MuddakirSection data={data.muddakir} />}
            {!data.circles && !data.muddakir && (
              <p style={{ color: ui.color.muted }}>{tA("noData")}</p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
