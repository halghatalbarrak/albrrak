"use client";

import { useEffect, useState } from "react";
import { Card, Button, Skeleton, sp, ui } from "@/components/ui";
import { arNum } from "@/lib/format";
import { HifzInput } from "@/components/session/HifzInput";
import { tUnified as tu } from "@/i18n/ar/unified";
import { QaidahPanel } from "./_QaidahPanel";
import { ConsolidationRow } from "./_ConsolidationRow";
import { TrackAssignInline } from "./_TrackAssignInline";
import type { GrantItem, PanelDetail, PostFn, Student } from "./_types";

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

export function StudentPanel({ s, circleId, date, items, post, detail, detailLoading, onNextStudent, grantManual }: {
  s: Student; circleId: string; date: string; items: GrantItem[];
  post: PostFn;
  detail: PanelDetail | null;
  detailLoading?: boolean;
  onNextStudent?: () => void;
  grantManual?: (studentId: string, pointItemId: string) => Promise<{ granted: boolean } | null>;
}) {
  const sid = s.studentId;
  const [localGranted, setLocalGranted] = useState<Set<string>>(new Set(detail?.manualGranted ?? []));

  useEffect(() => {
    setLocalGranted(new Set(detail?.manualGranted ?? []));
  }, [detail?.manualGranted]);

  const markAtt = (st: string) => post(`/api/circles/${circleId}/mark-attendance`, { studentId: sid, status: st, date }, "سُجِّل الحضور.");
  const excuse = () => {
    const reason = window.prompt("سبب الاستئذان/العذر:");
    if (reason?.trim()) void post("/api/attendance/excuse", { studentId: sid, date, reason, kind: "EXCUSE" }, "قُدِّم طلب العذر — بانتظار اعتماد صاحب الصلاحية.");
  };
  const extra = (kind: string) => post(`/api/students/${sid}/extra`, { kind, date }, "سُجِّلت الزيادة.", sid);
  const qaidahEval = (mastered: boolean) => post(`/api/students/${sid}/qaidah-session`, { mastered }, "سُجِّل التقييم.", sid);
  const qaidahDefer = () => post(`/api/students/${sid}/qaidah-session`, { defer: true }, "سُجِّل التأجيل.", sid);

  const handleToggle = async (pointItemId: string) => {
    if (!grantManual) return;
    const wasGranted = localGranted.has(pointItemId);
    setLocalGranted((prev) => { const n = new Set(prev); wasGranted ? n.delete(pointItemId) : n.add(pointItemId); return n; });
    const result = await grantManual(sid, pointItemId);
    if (!result) {
      setLocalGranted((prev) => { const n = new Set(prev); wasGranted ? n.add(pointItemId) : n.delete(pointItemId); return n; });
    }
  };

  const H3: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` };
  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };

  const posItems = items.filter((i) => i.value > 0);
  const negItems = items.filter((i) => i.value < 0);

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
      {!detail
        ? (detailLoading ? <Skeleton height={80} /> : <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: 0 }}>{tu("pickStudent")}</p>)
        : detail.qaidah ? <QaidahPanel q={detail.qaidah} onEval={qaidahEval} onDefer={qaidahDefer} />
        : detail.today.status === "ON_LEAVE" ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: 0 }}>{tu("onStageLeave")}</p>
        : detail.today.status !== "ACTIVE" ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: 0 }}>{tu("noDailyTasks")}</p>
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
              {detail.today.newHifz?.kind === "COMPLETED" ? <p style={{ color: ui.color.success, margin: 0 }}>{tu("trackCompleted")}</p>
                : detail.today.newHifz?.kind === "NO_TRACK" ? <TrackAssignInline studentId={sid} post={post} />
                : (
                  <>
                    <HifzInput
                      bound={(detail.today.newHifz?.kind === "NEW" || detail.today.newHifz?.kind === "REPEAT") ? (detail.today.newHifz.bound ?? null) : null}
                      hifzKind={detail.today.newHifz?.kind ?? null}
                      onSave={(st) => void post(`/api/students/${sid}/session`, { kind: "hifz", date, ...st }, "سُجِّل الحفظ.", sid)}
                    />
                    <div style={{ ...row, marginTop: sp(2) }}>
                      <Button size="sm" variant="ghost" onClick={() => void extra("hifz")}>{tu("addMoreHifz")}</Button>
                    </div>
                  </>
                )}
            </div>

            {/* رسّخ */}
            {detail.today.hasTarsikh && (
              <ConsolidationRow
                label={tu("tarseekhSectionLabel")}
                bounds={detail.today.tarseekh}
                studentId={sid}
                date={date}
                onDone={(done) => void post(`/api/students/${sid}/session`, { kind: "tarseekh", date, done }, "سُجِّل الترسيخ.", sid)}
                onExtra={() => void extra("tarseekh")}
              />
            )}

            {/* راجِع */}
            {detail.today.hasMuraja && (
              detail.today.murajaah?.totalStock === 0
                ? <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: 0 }}>{tu("noRasikhYet")} <Button size="sm" variant="ghost" onClick={() => { window.location.href = "/admin/tracks"; }}>{tu("setPath")}</Button></p>
                : <ConsolidationRow
                    label={tu("murajaahSectionLabel")}
                    bounds={detail.today.murajaah?.todaySlice ?? []}
                    studentId={sid}
                    date={date}
                    onDone={(done) => void post(`/api/students/${sid}/session`, { kind: "murajaah", date, count: done ? (detail.today.murajaah?.todaySlice.length ?? 0) : 0 }, "سُجِّلت المراجعة.", sid)}
                    onExtra={() => void extra("murajaah")}
                  />
            )}
          </>
        )}

      {/* نقاط اليوم — toggle */}
      {items.length > 0 && (
        <div>
          <h3 style={H3}>{tu("dayPoints")}</h3>
          {posItems.length > 0 && (
            <div style={{ ...row, marginBottom: negItems.length ? sp(2) : 0 }}>
              {posItems.map((it) => {
                const active = localGranted.has(it.id);
                return (
                  <Button
                    key={it.id}
                    size="sm"
                    variant={active ? "primary" : "ghost"}
                    onClick={() => void handleToggle(it.id)}
                  >
                    {it.nameAr} (+{it.value}){active ? " ✓" : ""}
                  </Button>
                );
              })}
            </div>
          )}
          {negItems.length > 0 && (
            <div style={row}>
              {negItems.map((it) => {
                const active = localGranted.has(it.id);
                return (
                  <Button
                    key={it.id}
                    size="sm"
                    variant={active ? "danger" : "ghost"}
                    onClick={() => void handleToggle(it.id)}
                  >
                    {it.nameAr} ({it.value}){active ? " ✓" : ""}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
