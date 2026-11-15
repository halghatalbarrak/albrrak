"use client";

import { Card, Button, sp, ui } from "@/components/ui";
import { arNum } from "@/lib/format";
import { HifzInput } from "@/components/session/HifzInput";
import { tUnified as tu } from "@/i18n/ar/unified";
import { QaidahPanel } from "./_QaidahPanel";
import { ConsolidationRow } from "./_ConsolidationRow";
import { TrackAssignInline } from "./_TrackAssignInline";
import type { GrantItem, PostFn, Student } from "./_types";

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

export function StudentPanel({ s, circleId, date, items, post, onNextStudent }: {
  s: Student; circleId: string; date: string; items: GrantItem[];
  post: PostFn;
  onNextStudent?: () => void;
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: sp(2) }}>
        <strong style={{ fontSize: ui.text.lg }}>{s.name}</strong>
        {onNextStudent && (
          <Button size="sm" variant="ghost" onClick={onNextStudent}>{tu("nextStudentBtn")}</Button>
        )}
      </div>

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
                      <Button size="sm" variant="ghost" onClick={() => void extra("hifz")}>{tu("addMoreHifz")}</Button>
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
