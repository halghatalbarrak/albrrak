"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, ui, sp } from "@/components/ui";
import { tDonor as t } from "@/i18n/ar/donor";
import type { DonorStats, MonthlyPoint } from "@/server/donor-stats";

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

function KpiCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div style={{
      background: ui.color.surface, border: `1px solid ${ui.color.border}`,
      borderRadius: ui.radius.lg, padding: sp(5), flex: "1 1 180px", minWidth: 160,
    }}>
      <div style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(2) }}>{label}</div>
      <div style={{ fontSize: ui.text.xxl, fontWeight: 700, color: ui.color.primary }}>
        {value}
        {unit && <span style={{ fontSize: ui.text.xs, marginRight: sp(1), color: ui.color.muted }}>{unit}</span>}
      </div>
    </div>
  );
}

function TrendTable({ rows }: { rows: MonthlyPoint[] }) {
  const thStyle: React.CSSProperties = {
    padding: `${sp(2)} ${sp(3)}`, textAlign: "right", borderBottom: `1px solid ${ui.color.border}`,
    color: ui.color.muted, fontSize: ui.text.xs, fontWeight: 600,
  };
  const tdStyle: React.CSSProperties = {
    padding: `${sp(2)} ${sp(3)}`, textAlign: "right", borderBottom: `1px solid ${ui.color.border}`,
    fontSize: ui.text.xs,
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>{t("trendColMonth")}</th>
            <th style={thStyle}>{t("trendColAttendance")}</th>
            <th style={thStyle}>{t("trendColPresent")}</th>
            <th style={thStyle}>{t("trendColRate")}</th>
            <th style={thStyle}>{t("trendColSessions")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rate = r.attendanceCount > 0
              ? Math.round((r.presentCount / r.attendanceCount) * 100)
              : null;
            return (
              <tr key={r.month}>
                <td style={tdStyle}>{r.month}</td>
                <td style={tdStyle}>{arNum(r.attendanceCount)}</td>
                <td style={tdStyle}>{arNum(r.presentCount)}</td>
                <td style={tdStyle}>{rate !== null ? `${arNum(rate)}٪` : "—"}</td>
                <td style={tdStyle}>{arNum(r.sessionCount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function DonorPage() {
  const { me } = useMe();
  const [stats, setStats] = useState<DonorStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const tk = await getToken();
    if (!tk) { window.location.href = "/login"; return; }
    const res = await fetch("/api/donor/stats", { headers: { authorization: `Bearer ${tk}` } });
    if (!res.ok) { setErr(t("errLoad")); setLoading(false); return; }
    const data = (await res.json().catch(() => null)) as DonorStats | null;
    setStats(data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rate30 = stats?.attendanceRate30d != null
    ? `${arNum(Math.round(stats.attendanceRate30d * 100))}٪`
    : "—";

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/donor" title={t("pageTitle")}>
      <div style={{ padding: sp(6), maxWidth: 960, margin: "0 auto" }}>
        <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(6) }}>{t("pageSubtitle")}</p>

        {loading && <p style={{ color: ui.color.muted }}>{t("loading")}</p>}
        {err && <p style={{ color: ui.color.danger }}>{err}</p>}

        {stats && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: sp(4), marginBottom: sp(8) }}>
              <KpiCard label={t("cardStudents")} value={arNum(stats.studentCount)} unit={t("unit_students")} />
              <KpiCard label={t("cardCircles")} value={arNum(stats.circleCount)} unit={t("unit_circles")} />
              <KpiCard label={t("cardAttendance30")} value={rate30} />
              <KpiCard label={t("cardMastered30")} value={arNum(stats.masteredSessionCount)} unit={t("unit_sessions")} />
              <KpiCard label={t("cardKhatm")} value={arNum(stats.khatmStudentCount)} unit={t("unit_students")} />
            </div>

            <h2 style={{ fontSize: ui.text.lg, fontWeight: 600, marginBottom: sp(3) }}>{t("trendTitle")}</h2>
            {stats.monthlyTrend.length === 0
              ? <p style={{ color: ui.color.muted }}>{t("noData")}</p>
              : <TrendTable rows={stats.monthlyTrend} />
            }
          </>
        )}
      </div>
    </AppShell>
  );
}
