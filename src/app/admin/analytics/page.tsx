"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useReducer } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, Card, Skeleton, ui, sp } from "@/components/ui";
import { tD } from "@/i18n/ar/dashboard";
import type {
  DashboardData,
  FollowUpStudent,
  TodayCircleCard,
  StudentRow,
  CircleCompRow,
  ChartPoint,
  MuddakirFollowUp,
  FollowUpCode,
} from "@/server/dashboard";

const AnalyticsBar = dynamic(
  () => import("@/components/analytics/AnalyticsBar").then((m) => ({ default: m.AnalyticsBar })),
  { ssr: false },
);

// ─── مساعدات ──────────────────────────────────────────────────────────────────

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${arNum(Math.round(v * 100))}٪`;
}

function reasonLabel(code: FollowUpCode): string {
  const map: Record<FollowUpCode, string> = {
    ABSENT_CONSECUTIVE: tD("reasonAbsent"),
    REPEATED_SECTION: tD("reasonRepeated"),
    NO_HIFZ_PROGRESS: tD("reasonNoProgress"),
    NO_GUARDIAN: tD("reasonNoGuardian"),
    NO_TRACK: tD("reasonNoTrack"),
    AWAITING_PACE: tD("reasonPaceTest"),
    MUDDAKIR_SHORTFALL: tD("reasonMuddakirShortfall"),
    MUDDAKIR_UNCONFIRMED: tD("reasonMuddakirUnconfirmed"),
  };
  return map[code] ?? code;
}

// ─── قسم ١: يحتاجون متابعة ────────────────────────────────────────────────────

const URGENT_CODES = new Set<FollowUpCode>(["ABSENT_CONSECUTIVE", "REPEATED_SECTION"]);

function ReasonBadge({ code }: { code: FollowUpCode }) {
  const urgent = URGENT_CODES.has(code);
  return (
    <span data-testid={`reason-${code}`} style={{
      background: urgent ? ui.color.danger + "22" : ui.color.border,
      color: urgent ? ui.color.danger : ui.color.text,
      borderRadius: ui.radius.sm, padding: `0 ${sp(2)}`, fontSize: ui.text.xs,
    }}>
      {reasonLabel(code)}
    </span>
  );
}

function FollowUpSection({ rows }: { rows: FollowUpStudent[] }) {
  // تجميع الطلاب حسب السبب الأوّل (الأعلى أولويّةً)
  const groups = useMemo(() => {
    const map = new Map<FollowUpCode, FollowUpStudent[]>();
    for (const r of rows) {
      const primary = r.reasons[0];
      if (!primary) continue;
      const list = map.get(primary) ?? [];
      list.push(r);
      map.set(primary, list);
    }
    return [...map.entries()].sort(([a], [b]) => {
      // الأسباب العاجلة أوّلاً
      const au = URGENT_CODES.has(a) ? 0 : 1;
      const bu = URGENT_CODES.has(b) ? 0 : 1;
      return au - bu;
    });
  }, [rows]);

  const [collapsed, toggleGroup] = useReducer((state: Set<string>, code: string) => {
    const next = new Set(state);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  }, new Set<string>());

  return (
    <section data-testid="followup-section" style={{ marginBottom: sp(8) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(4) }}>{tD("s1Title")}</h2>
      {rows.length === 0
        ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{tD("s1Empty")}</p>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
            {groups.map(([code, groupRows]) => {
              const open = !collapsed.has(code);
              return (
                <div key={code} style={{ border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md, overflow: "hidden" }}>
                  {/* رأس المجموعة */}
                  <button
                    data-testid={`group-header-${code}`}
                    onClick={() => toggleGroup(code)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: sp(2),
                      padding: `${sp(2)} ${sp(3)}`,
                      background: URGENT_CODES.has(code) ? ui.color.danger + "11" : ui.color.surface,
                      border: "none", cursor: "pointer", textAlign: "start", fontFamily: ui.font,
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: ui.text.base, color: URGENT_CODES.has(code) ? ui.color.danger : ui.color.text }}>
                      {reasonLabel(code)}
                    </span>
                    <span style={{ fontSize: ui.text.xs, color: ui.color.muted, background: ui.color.border, borderRadius: 99, padding: `0 ${sp(2)}` }}>
                      {arNum(groupRows.length)}
                    </span>
                    <span style={{ marginRight: "auto", fontSize: ui.text.xs, color: ui.color.muted }}>{open ? "▴" : "▾"}</span>
                  </button>
                  {/* صفوف الطلاب */}
                  {open && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", fontSize: ui.text.xs, borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {[tD("colName"), tD("colCircle"), tD("colTeacher"), tD("colReasons"), ""].map((h) => (
                              <th key={h} style={{ padding: `${sp(2)} ${sp(2)}`, textAlign: "start", color: ui.color.muted, borderBottom: `1px solid ${ui.color.border}`, fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {groupRows.map((r) => (
                            <tr key={r.studentId} data-testid={`followup-row-${r.studentId}`}>
                              <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}`, fontWeight: 600 }} data-testid="followup-name">{r.name}</td>
                              <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{r.circleName}</td>
                              <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{r.teacherName}</td>
                              <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: sp(1) }}>
                                  {r.reasons.map((c) => <ReasonBadge key={c} code={c} />)}
                                </div>
                              </td>
                              <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>
                                <a
                                  href={`/admin/unified?circle=${r.circleId}&student=${r.studentId}`}
                                  style={{ color: ui.color.primary, textDecoration: "none", fontSize: ui.text.xs }}
                                >
                                  {tD("btnOpen")} ←
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </section>
  );
}

// ─── قسم ٢: اليوم في الحلقات ────────────────────────────────────────────────

function TodayCirclesSection({ cards }: { cards: TodayCircleCard[] }) {
  return (
    <section style={{ marginBottom: sp(8) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(4) }}>{tD("s2Title")}</h2>
      {cards.length === 0
        ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{tD("s2Empty")}</p>
        : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: sp(3) }}>
            {cards.map((c) => (
              <Card key={c.circleId} style={{ flex: "1 1 220px", minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: ui.text.base, marginBottom: sp(2) }}>{c.circleName}</div>
                <div style={{ fontSize: ui.text.xs, color: ui.color.muted, marginBottom: sp(3) }}>{c.teacherName}</div>
                {!c.opened
                  ? <div style={{ color: ui.color.muted, fontSize: ui.text.xs, fontStyle: "italic" }}>{tD("cardNotOpened")}</div>
                  : (
                    <div style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
                      <div style={{ fontSize: ui.text.xs }}>
                        {tD("cardPresent")}: <strong>{arNum(c.present)}</strong> / {arNum(c.total)}
                      </div>
                      <div style={{ fontSize: ui.text.xs }}>
                        {tD("cardRecited")}: <strong>{arNum(c.recited)}</strong>
                        {c.notRecited > 0 && <span style={{ color: ui.color.muted }}> · {tD("cardNotRecited")}: {arNum(c.notRecited)}</span>}
                      </div>
                    </div>
                  )}
                <a href={`/circles/${c.circleId}`} style={{ marginTop: sp(3), display: "inline-block", color: ui.color.primary, fontSize: ui.text.xs }}>
                  {tD("btnCircle")} ←
                </a>
              </Card>
            ))}
          </div>
        )}
    </section>
  );
}

// ─── قسم ٣: جدول الطلاب ─────────────────────────────────────────────────────

function StudentsSection({ rows }: { rows: StudentRow[] }) {
  const [search, setSearch] = useState("");
  const [circleFilter, setCircleFilter] = useState("__all__");
  const [sortKey, setSortKey] = useState<keyof StudentRow>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const circles = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((r) => { if (seen.has(r.circleId)) return false; seen.add(r.circleId); return true; })
      .map((r) => ({ id: r.circleId, name: r.circleName }));
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (circleFilter !== "__all__") r = r.filter((s) => s.circleId === circleFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((s) => s.name.toLowerCase().includes(q));
    }
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? null;
      const bv = b[sortKey] ?? null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv), "ar") * sortDir;
    });
  }, [rows, search, circleFilter, sortKey, sortDir]);

  const toggleSort = (k: keyof StudentRow) => {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
  };

  const th = (label: string, k: keyof StudentRow) => (
    <th
      key={k}
      onClick={() => toggleSort(k)}
      style={{
        padding: `${sp(2)} ${sp(2)}`, textAlign: "start", color: ui.color.muted, borderBottom: `1px solid ${ui.color.border}`,
        fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
        ...(sortKey === k ? { color: ui.color.primary } : {}),
      }}
    >
      {label}{sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <section data-testid="students-section" style={{ marginBottom: sp(8) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(4) }}>{tD("s3Title")}</h2>
      {/* أدوات البحث والتصفية */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: sp(3), marginBottom: sp(4) }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tD("searchPlaceholder")}
          style={{
            flex: "1 1 200px", padding: `${sp(2)} ${sp(3)}`, fontSize: ui.text.xs,
            border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md,
            background: ui.color.surface, color: ui.color.text, outline: "none",
          }}
        />
        <select
          value={circleFilter}
          onChange={(e) => setCircleFilter(e.target.value)}
          style={{
            padding: `${sp(2)} ${sp(3)}`, fontSize: ui.text.xs,
            border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md,
            background: ui.color.surface, color: ui.color.text,
          }}
        >
          <option value="__all__">{tD("filterAll")}</option>
          {circles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {rows.length === 0
        ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{tD("s3Empty")}</p>
        : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: ui.text.xs, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {th(tD("colName"), "name")}
                  {th(tD("colCircle"), "circleName")}
                  {th(tD("colPos"), "currentSurahName")}
                  {th(tD("colStage"), "maraqiStage")}
                  {th(tD("colMonthlyHifz"), "monthlyLines")}
                  {th(tD("colTransition"), "transitionRate")}
                  {th(tD("colAttPct"), "attendancePct")}
                  {th(tD("colMasteryPct"), "masteryFirstAttemptPct")}
                  <th style={{ padding: `${sp(2)} ${sp(2)}`, textAlign: "start", color: ui.color.muted, borderBottom: `1px solid ${ui.color.border}`, fontWeight: 600 }}>{tD("colKhatm")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const avg = s.circleAvgTransitionRate;
                  const tr = s.transitionRate;
                  const arrow = tr !== null && avg !== null
                    ? tr > avg + 0.05 ? " ↑" : tr < avg - 0.05 ? " ↓" : ""
                    : "";
                  const pos = s.currentSurahName
                    ? `${s.currentSurahName} ${arNum(s.currentAyahNum ?? 1)}`
                    : tD("noPosition");
                  return (
                    <tr key={s.studentId} style={{ cursor: "pointer" }}
                      onClick={() => window.location.href = `/circles/${s.circleId}?date=today&student=${s.studentId}`}
                    >
                      <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}`, fontWeight: 600 }}>{s.name}</td>
                      <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{s.circleName}</td>
                      <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{pos}</td>
                      <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{s.maraqiStage ?? tD("noStage")}</td>
                      <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>
                        {s.monthlyLines > 0 ? `${arNum(s.monthlyLines)} ${tD("unitLines")}` : "—"}
                      </td>
                      <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>
                        {tr !== null ? `${pct(tr)}${arrow}` : "—"}
                      </td>
                      <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{pct(s.attendancePct)}</td>
                      <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{pct(s.masteryFirstAttemptPct)}</td>
                      <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{s.khatmDateIso ?? tD("noKhatm")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}

// ─── قسم ٤: مقارنة الحلقات ───────────────────────────────────────────────────

function CircleCompSection({ rows }: { rows: CircleCompRow[] }) {
  return (
    <section style={{ marginBottom: sp(8) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(4) }}>{tD("s4Title")}</h2>
      {rows.length === 0
        ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{tD("s4Empty")}</p>
        : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: ui.text.xs, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[tD("colCircleName"), tD("colTeacher"), tD("colStudents"), tD("colAttendance"), tD("colHifz"), tD("colAvgTransition"), tD("colMastery"), tD("colStruggling")].map((h) => (
                    <th key={h} style={{ padding: `${sp(2)} ${sp(2)}`, textAlign: "start", color: ui.color.muted, borderBottom: `1px solid ${ui.color.border}`, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.circleId} style={{ cursor: "pointer" }} onClick={() => window.location.href = `/circles/${r.circleId}`}>
                    <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}`, fontWeight: 600 }}>{r.circleName}</td>
                    <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{r.teacherName}</td>
                    <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{arNum(r.studentCount)}</td>
                    <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{pct(r.attendancePct)}</td>
                    <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>
                      {r.monthlyMasteredSessions > 0 ? arNum(r.monthlyMasteredSessions) : "—"}
                    </td>
                    <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{pct(r.avgTransitionRate)}</td>
                    <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{pct(r.masteryPct)}</td>
                    <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{arNum(r.struggling)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}

// ─── قسم ٥: الرسوم البيانيّة ─────────────────────────────────────────────────

function ChartsSection({ points }: { points: ChartPoint[] }) {
  if (points.length === 0) {
    return (
      <section style={{ marginBottom: sp(8) }}>
        <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(4) }}>{tD("s5Title")}</h2>
        <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{tD("noChartData")}</p>
      </section>
    );
  }

  const attSeries = points.map((p) => ({
    label: p.hijriLabel,
    [tD("chartPresent")]: p.present,
    [tD("chartTotal")]: p.total,
  }));
  const hifzSeries = points.map((p) => ({
    label: p.hijriLabel,
    [tD("chartMastered")]: p.mastered,
  }));

  return (
    <section style={{ marginBottom: sp(8) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(4) }}>{tD("s5Title")}</h2>
      <Card style={{ marginBottom: sp(4) }}>
        <div style={{ fontWeight: 600, fontSize: ui.text.base, marginBottom: sp(3) }}>{tD("chartAttTitle")}</div>
        <AnalyticsBar
          data={attSeries}
          bars={[
            { key: tD("chartPresent"), label: tD("chartPresent"), color: ui.color.primary },
            { key: tD("chartTotal"), label: tD("chartTotal"), color: ui.color.border },
          ]}
          height={160}
        />
      </Card>
      <Card>
        <div style={{ fontWeight: 600, fontSize: ui.text.base, marginBottom: sp(3) }}>{tD("chartHifzTitle")}</div>
        <AnalyticsBar
          data={hifzSeries}
          bars={[{ key: tD("chartMastered"), label: tD("chartMastered"), color: "var(--color-bronze, #C29A6F)" }]}
          height={140}
        />
      </Card>
    </section>
  );
}

// ─── قسم المدّكِر ────────────────────────────────────────────────────────────

function MuddakirSection({ rows }: { rows: MuddakirFollowUp[] }) {
  if (rows.length === 0) return null;
  return (
    <section data-testid="muddakir-section" style={{ marginBottom: sp(8) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(4) }}>{tD("muddTitle")}</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: ui.text.xs, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[tD("colHafiz"), tD("colSupervisor"), tD("colMuddReasons")].map((h) => (
                <th key={h} style={{ padding: `${sp(2)} ${sp(2)}`, textAlign: "start", color: ui.color.muted, borderBottom: `1px solid ${ui.color.border}`, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}`, fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>{r.supervisorName ?? "—"}</td>
                <td style={{ padding: `${sp(2)} ${sp(2)}`, borderBottom: `1px solid ${ui.color.border}` }}>
                  <div style={{ display: "flex", gap: sp(1), flexWrap: "wrap" }}>
                    {r.reasons.map((code) => (
                      <span key={code} style={{ background: ui.color.border, borderRadius: ui.radius.sm, padding: `0 ${sp(2)}` }}>
                        {code === "SHORTFALL" ? tD("reasonMuddakirShortfall") : tD("reasonMuddakirUnconfirmed")}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── الصفحة الرئيسيّة ────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { me } = useMe();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: { session } } = await supabaseBrowser().auth.getSession();
      if (!session) { window.location.href = "/login"; return; }
      const res = await fetch("/api/admin/dashboard", {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { setErr(tD("errLoad")); setLoading(false); return; }
      setData(await res.json() as DashboardData);
    } catch {
      setErr(tD("errLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!me) {
    return (
      <AppShell roles={[]} userName="" activeHref="/admin/analytics" title={tD("pageTitle")}>
        <div style={{ padding: sp(6) }}><Skeleton /></div>
      </AppShell>
    );
  }

  return (
    <AppShell
      roles={me.roles}
      userName={me.name ?? ""}
      activeHref="/admin/analytics"
      title={tD("pageTitle")}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: tD("pageTitle") }]}
    >
      <div style={{ padding: `${sp(4)} ${sp(4)}`, maxWidth: 1100, margin: "0 auto" }}>

        {/* ترويسة + زر طباعة */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: sp(3), marginBottom: sp(6), justifyContent: "space-between" }}>
          <p style={{ margin: 0, color: ui.color.muted, fontSize: ui.text.xs }}>{tD("pageSubtitle")}</p>
          <button
            onClick={() => window.print()}
            style={{
              padding: `${sp(2)} ${sp(4)}`, fontSize: ui.text.xs, background: ui.color.surface,
              border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md, cursor: "pointer",
              color: ui.color.text,
            }}
          >
            {tD("btnPrint")}
          </button>
        </div>

        {loading && <div data-testid="dashboard-loading"><Skeleton /></div>}
        {err && <p style={{ color: ui.color.danger }} data-testid="dashboard-error">{err}</p>}

        {data && !loading && (
          <div data-testid="dashboard-content">
            {data.donorMode
              ? (
                <>
                  <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(6) }}>{tD("donorNote")}</p>
                  <ChartsSection points={data.charts} />
                </>
              )
              : (
                <>
                  <FollowUpSection rows={data.followUp} />
                  <TodayCirclesSection cards={data.todayCircles} />
                  <StudentsSection rows={data.students} />
                  <CircleCompSection rows={data.circleComparison} />
                  <ChartsSection points={data.charts} />
                  {data.muddakirFollowUp.length > 0 && <MuddakirSection rows={data.muddakirFollowUp} />}
                </>
              )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
