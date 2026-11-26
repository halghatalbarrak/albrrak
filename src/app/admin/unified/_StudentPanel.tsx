"use client";

import { useEffect, useState } from "react";
import { Card, Button, Skeleton, sp, ui } from "@/components/ui";
import { arNum } from "@/lib/format";
import { HifzInput } from "@/components/session/HifzInput";
import type { HifzSave } from "@/components/session/HifzInput";
import { tUnified as tu } from "@/i18n/ar/unified";
import { QaidahPanel } from "./_QaidahPanel";
import { ConsolidationRow } from "./_ConsolidationRow";
import { TrackAssignInline } from "./_TrackAssignInline";
import type { GrantItem, MarkAttFn, PanelDetail, PostFn, Student } from "./_types";
import { token } from "./_types";
import { AyahSelect, maxAyah, SurahSelect } from "./_SurahAyahSelect";
import { SURAH_NAMES } from "@/lib/surah-names";

const ATT_LABEL: Record<string, string> = {
  PRESENT: "حاضر", LATE: "متأخّر", ABSENT_UNEXCUSED: "غائب", LEFT_NO_PERMISSION: "خرج بلا إذن",
  ABSENT_EXCUSED: "غائب بعذر", PRE_EXCUSED: "مستأذن", LEFT_EARLY: "خرج مبكّرًا",
};
const ATT_BUTTONS: { status: string; label: string }[] = [
  { status: "PRESENT", label: "حاضر" },
  { status: "LATE", label: "متأخّر" },
  { status: "ABSENT_UNEXCUSED", label: "غائب" },
  { status: "LEFT_NO_PERMISSION", label: "خرج بلا إذن" },
];

export function StudentPanel({ s, date, items, post, detail, detailLoading, onNextStudent, grantManual, markAtt: markAttProp, isPending, canCorrectPosition }: {
  s: Student; date: string; items: GrantItem[];
  post: PostFn;
  detail: PanelDetail | null;
  detailLoading?: boolean;
  markAtt: MarkAttFn;
  isPending: boolean;
  onNextStudent?: () => void;
  grantManual?: (studentId: string, pointItemId: string) => Promise<{ granted: boolean } | null>;
  canCorrectPosition?: boolean;
}) {
  const sid = s.studentId;
  const [localGranted, setLocalGranted] = useState<Set<string>>(new Set(detail?.manualGranted ?? []));
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [attSavingStatus, setAttSavingStatus] = useState<string | null>(null);
  const [hifzError, setHifzError] = useState<string | null>(null);
  const [hifzSaving, setHifzSaving] = useState(false);
  const [savedHifzToday, setSavedHifzToday] = useState<HifzSave | null>(null);
  const [savedTarseekh, setSavedTarseekh] = useState<boolean | null>(null);
  const [savedMurajaah, setSavedMurajaah] = useState<boolean | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [corrForm, setCorrForm] = useState({ surah: 78, ayah: 10, reason: "INPUT_ERROR" as "INPUT_ERROR" | "LEVEL_TEST" | "OTHER", reasonNote: "" });
  const [corrPreview, setCorrPreview] = useState<{ startSurah: number; startAyah: number; endSurah: number; endAyah: number } | null | "loading">("loading");
  const [corrSaving, setCorrSaving] = useState(false);
  const [corrError, setCorrError] = useState<string | null>(null);
  const [corrDone, setCorrDone] = useState(false);

  useEffect(() => {
    setLocalGranted(new Set(detail?.manualGranted ?? []));
  }, [detail?.manualGranted]);

  useEffect(() => {
    setSavedHifzToday(null);
    setHifzError(null);
    setShowCorrection(false);
    setCorrDone(false);
    setCorrError(null);
    setGrantingId(null);
    setAttSavingStatus(null);
    setSavedTarseekh(null);
    setSavedMurajaah(null);
  }, [sid]);

  useEffect(() => {
    if (!showCorrection) return;
    setCorrPreview("loading");
    const ctrl = new AbortController();
    void (async () => {
      try {
        const tok = await token();
        const res = await fetch(
          `/api/students/${sid}/position-preview?toSurah=${corrForm.surah}&toAyah=${corrForm.ayah}`,
          { headers: tok ? { Authorization: `Bearer ${tok}` } : {}, signal: ctrl.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { unit: { startSurah: number; startAyah: number; endSurah: number; endAyah: number } | null };
        setCorrPreview(data.unit);
      } catch {
        // المعاينة اختياريّة — لا تعطّل النموذج
      }
    })();
    return () => ctrl.abort();
  }, [sid, corrForm.surah, corrForm.ayah, showCorrection]);

  const handleMarkAtt = async (status: string) => {
    if (isPending) return;
    setAttSavingStatus(status);
    await markAttProp(sid, status);
    setAttSavingStatus(null);
  };

  const excuse = () => {
    const reason = window.prompt("سبب الاستئذان/العذر:");
    if (reason?.trim()) void post("/api/attendance/excuse", { studentId: sid, date, reason, kind: "EXCUSE" }, "قُدِّم طلب العذر — بانتظار اعتماد صاحب الصلاحية.", sid);
  };
  const extra = (kind: string) => post(`/api/students/${sid}/extra`, { kind, date }, "سُجِّلت الزيادة.", sid);
  const qaidahEval = (mastered: boolean) => post(`/api/students/${sid}/qaidah-session`, { mastered }, "سُجِّل التقييم.", sid);
  const qaidahDefer = () => post(`/api/students/${sid}/qaidah-session`, { defer: true }, "سُجِّل التأجيل.", sid);

  const handleToggle = async (pointItemId: string) => {
    if (!grantManual || grantingId) return;
    const wasGranted = localGranted.has(pointItemId);
    setGrantingId(pointItemId);
    setLocalGranted((prev) => { const n = new Set(prev); wasGranted ? n.delete(pointItemId) : n.add(pointItemId); return n; });
    const result = await grantManual(sid, pointItemId);
    setGrantingId(null);
    if (!result) {
      setLocalGranted((prev) => { const n = new Set(prev); wasGranted ? n.add(pointItemId) : n.delete(pointItemId); return n; });
    }
  };

  const H3: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` };
  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };

  const isPresent = s.attendanceStatus === "PRESENT" || s.attendanceStatus === "LATE";
  const posItems = items.filter((i) => i.value > 0 && (!i.requiresPresent || isPresent));
  const negItems = items.filter((i) => i.value < 0 && (!i.requiresPresent || isPresent));
  const todayEarned = posItems.filter((i) => localGranted.has(i.id));
  const todayTotal = todayEarned.reduce((sum, i) => sum + i.value, 0);

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: sp(4) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: sp(2) }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: sp(2) }}>
          <strong style={{ fontSize: ui.text.lg }}>{s.name}</strong>
          <span data-testid="student-points" style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tu("pointsBalance")}{arNum(s.points ?? 0)}</span>
          {items.length > 0 && (
            <span data-testid="today-points" style={{ fontSize: ui.text.xs, color: todayTotal > 0 ? ui.color.success : ui.color.muted }}>
              {tu("dayPoints")}{": "}{todayTotal > 0 ? "+" : ""}{arNum(todayTotal)}
            </span>
          )}
        </div>
        {onNextStudent && (
          <Button size="sm" variant="ghost" onClick={onNextStudent}>{tu("nextStudentBtn")}</Button>
        )}
      </div>

      {/* الحضور */}
      <div>
        <h3 style={H3}>
          {"الحضور"}{s.attendanceStatus ? ` — ${ATT_LABEL[s.attendanceStatus] ?? s.attendanceStatus}` : ""}
          {isPending && <span style={{ fontSize: ui.text.xs, fontWeight: 400, color: ui.color.muted, marginInlineStart: 8 }}>{tu("savingPending")}</span>}
        </h3>
        <div style={row}>
          {ATT_BUTTONS.map((b) => {
            const isActive = b.status === s.attendanceStatus;
            const isSaving = attSavingStatus === b.status;
            return (
              <Button
                key={b.status}
                size="sm"
                variant={isActive ? "success" : "ghost"}
                disabled={isPending}
                data-testid={`att-btn-${b.status}`}
                data-active={isActive ? "true" : undefined}
                data-saving={isSaving ? "true" : undefined}
                onClick={() => void handleMarkAtt(b.status)}
              >{isSaving ? tu("savingPending") : (isActive ? `✓ ${b.label}` : b.label)}</Button>
            );
          })}
          <Button size="sm" variant="ghost" disabled={isPending} onClick={excuse}>{tu("excused")}</Button>
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
              <h3 style={H3}>{tu("hifzSectionLabel")}{(s.todayHifzDone || !!savedHifzToday) && <span style={{ color: ui.color.success, marginInlineStart: 4 }}>✓</span>}</h3>
              {detail.today.newHifz?.kind === "COMPLETED" ? <p style={{ color: ui.color.success, margin: 0 }}>{tu("trackCompleted")}</p>
                : detail.today.newHifz?.kind === "NO_TRACK" ? <TrackAssignInline studentId={sid} post={post} />
                : (
                  <>
                  {hifzError === "STATE_BLOCKED" && (
                    <div data-testid="hifz-state-blocked-error" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 12px", background: "#fff1f0", border: "1px solid #ffa39e", borderRadius: 6, marginBottom: 8 }}>
                      <span style={{ color: "#cf1322", fontSize: ui.text.xs }}>{tu("hifzStateBlockedMsg")}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid="btn-open-placement"
                        onClick={() => window.open(`/admin/students/${sid}/placement`, "_blank")}
                      >{tu("hifzStateBlockedBtn")}</Button>
                    </div>
                  )}
                  <HifzInput
                    bound={(detail.today.newHifz?.kind === "NEW" || detail.today.newHifz?.kind === "REPEAT") ? (detail.today.newHifz.bound ?? null) : null}
                    hifzKind={detail.today.newHifz?.kind ?? null}
                    mustRepeat={detail.today.newHifz?.kind === "REPEAT"}
                    mustRepeatBound={detail.today.newHifz?.kind === "REPEAT" ? (detail.today.newHifz.bound ?? null) : null}
                    savedToday={savedHifzToday}
                    saving={hifzSaving}
                    saveError={hifzError === "STATE_BLOCKED" ? null : hifzError}
                    onSave={async (st) => {
                      setHifzError(null);
                      setHifzSaving(true);
                      const r = await post(`/api/students/${sid}/session`, { kind: "hifz", date, ...st }, "سُجِّل الحفظ.", sid);
                      setHifzSaving(false);
                      if (r.ok) {
                        setSavedHifzToday(st);
                      } else {
                        // خطأ حالة الطالب — اعرض رسالة مع زر لفتح صفحة الإعداد
                        const isStateBlocked =
                          r.key === "hifzStudentStateBlocked" || r.key === "hifzForMaraqiStudent";
                        if (isStateBlocked) {
                          setHifzError("STATE_BLOCKED");
                        } else {
                          setHifzError(r.error ?? tu("hifzSaveFailed"));
                        }
                      }
                    }}
                  />
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
                savedDone={savedTarseekh ?? (s.tarseekhDone != null ? s.tarseekhDone : null)}
                onDone={async (done) => {
                  const r = await post(`/api/students/${sid}/session`, { kind: "tarseekh", date, done }, "سُجِّل الترسيخ.", sid);
                  if (r.ok) setSavedTarseekh(done);
                }}
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
                    savedDone={savedMurajaah}
                    onDone={async (done) => {
                      const r = await post(`/api/students/${sid}/session`, { kind: "murajaah", date, count: done ? (detail.today.murajaah?.todaySlice.length ?? 0) : 0 }, "سُجِّلت المراجعة.", sid);
                      if (r.ok) setSavedMurajaah(done);
                    }}
                    onExtra={() => void extra("murajaah")}
                  />
            )}
          </>
        )}

      {/* تصحيح الموضع — للمشرف العام ومدير الحلقة فقط */}
      {canCorrectPosition && (
        <div>
          {!showCorrection ? (
            <Button size="sm" variant="ghost" data-testid="btn-correct-position" onClick={() => { setShowCorrection(true); setCorrError(null); setCorrDone(false); setCorrPreview("loading"); }}>
              {tu("correctPositionBtn")}
            </Button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: sp(2), padding: sp(3), border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md }}>
              <strong style={{ fontSize: ui.text.base }}>{tu("correctPositionTitle")}</strong>

              {/* آخر ما أتقنه: سورة + آية */}
              <div style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: ui.text.xs, color: ui.color.muted, whiteSpace: "nowrap" }}>{tu("correctPositionLastMastered")}</span>
                <SurahSelect
                  value={corrForm.surah}
                  onChange={(v) => setCorrForm((f) => ({ ...f, surah: v, ayah: Math.min(f.ayah, maxAyah(v)) }))}
                />
                <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tu("correctPositionAyah")}</span>
                <AyahSelect
                  surah={corrForm.surah}
                  value={corrForm.ayah}
                  onChange={(v) => setCorrForm((f) => ({ ...f, ayah: v }))}
                />
              </div>

              {/* معاينة مقرّر اليوم */}
              <div data-testid="correction-preview" style={{ fontSize: ui.text.xs, color: ui.color.muted, padding: `${sp(1.5)} ${sp(2)}`, background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.sm }}>
                {corrPreview === "loading"
                  ? tu("correctPositionPreviewLoading")
                  : corrPreview === null
                  ? tu("correctPositionPreviewNone")
                  : `${tu("correctPositionPreviewLabel")} ${SURAH_NAMES[corrPreview.startSurah] ?? ""} من آية ${arNum(corrPreview.startAyah)} إلى آية ${arNum(corrPreview.endAyah)}`}
              </div>

              {/* السبب */}
              <label style={{ fontSize: ui.text.xs }}>{tu("correctPositionReason")}
                <select value={corrForm.reason} onChange={(e) => setCorrForm((f) => ({ ...f, reason: e.target.value as typeof corrForm.reason }))} style={{ marginInlineStart: 4, padding: `${sp(0.5)} ${sp(1)}`, borderRadius: ui.radius.sm, border: `1px solid ${ui.color.border}`, fontFamily: ui.font }}>
                  <option value="INPUT_ERROR">{tu("correctPositionReasonInputError")}</option>
                  <option value="LEVEL_TEST">{tu("correctPositionReasonLevelTest")}</option>
                  <option value="OTHER">{tu("correctPositionReasonOther")}</option>
                </select>
              </label>
              {corrForm.reason === "OTHER" && (
                <input type="text" placeholder={tu("correctPositionReasonNote")} value={corrForm.reasonNote} onChange={(e) => setCorrForm((f) => ({ ...f, reasonNote: e.target.value }))} style={{ padding: `${sp(1)} ${sp(2)}`, borderRadius: ui.radius.sm, border: `1px solid ${ui.color.border}`, fontFamily: ui.font, fontSize: ui.text.xs }} />
              )}
              {corrError && <p style={{ margin: 0, color: ui.color.danger, fontSize: ui.text.xs }}>{corrError}</p>}
              {corrDone && <p style={{ margin: 0, color: ui.color.success, fontSize: ui.text.xs }}>{tu("correctPositionDone")}</p>}
              <div style={{ display: "flex", gap: sp(2) }}>
                <Button size="sm" variant="primary" disabled={corrSaving} data-testid="btn-correct-position-submit"
                  onClick={async () => {
                    if (corrForm.reason === "OTHER" && !corrForm.reasonNote.trim()) { setCorrError(tu("correctPositionNoteRequired")); return; }
                    setCorrError(null); setCorrSaving(true);
                    const r = await post(
                      `/api/students/${sid}/position-correction`,
                      { fromSurah: corrForm.surah, fromAyah: 1, toSurah: corrForm.surah, toAyah: corrForm.ayah, reason: corrForm.reason, reasonNote: corrForm.reasonNote || undefined },
                      tu("correctPositionDone"),
                      sid,
                    );
                    setCorrSaving(false);
                    if (r.ok) { setCorrDone(true); setShowCorrection(false); }
                    else setCorrError(r.error ?? tu("correctPositionFailed"));
                  }}
                >{corrSaving ? tu("correctPositionSubmitting") : tu("correctPositionSubmit")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCorrection(false)}>{tu("correctPositionCancel")}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* نقاط اليوم — toggle بثلاث حالات (default/loading/saved) */}
      {(posItems.length > 0 || negItems.length > 0) && (
        <div>
          <h3 style={H3}>
            {tu("dayPoints")}
            {todayEarned.length > 0 && (
              <span style={{ fontSize: ui.text.xs, fontWeight: 400, color: ui.color.success, marginInlineStart: 8 }}>
                +{arNum(todayTotal)}
              </span>
            )}
          </h3>
          {posItems.length > 0 && (
            <div style={{ ...row, marginBottom: negItems.length ? sp(2) : 0 }}>
              {posItems.map((it) => {
                const active = localGranted.has(it.id);
                const isLoading = grantingId === it.id;
                return (
                  <Button
                    key={it.id}
                    size="sm"
                    variant={active ? "primary" : "ghost"}
                    disabled={isLoading || !!grantingId}
                    data-testid={`grant-btn-${it.id}`}
                    data-granted={active ? "true" : undefined}
                    data-loading={isLoading ? "true" : undefined}
                    onClick={() => void handleToggle(it.id)}
                  >
                    {isLoading ? tu("savingPending") : `${it.nameAr} (+${arNum(it.value)})${active ? " ✓" : ""}`}
                  </Button>
                );
              })}
            </div>
          )}
          {negItems.length > 0 && (
            <div style={row}>
              {negItems.map((it) => {
                const active = localGranted.has(it.id);
                const isLoading = grantingId === it.id;
                return (
                  <Button
                    key={it.id}
                    size="sm"
                    variant={active ? "danger" : "ghost"}
                    disabled={isLoading || !!grantingId}
                    data-testid={`grant-btn-${it.id}`}
                    data-granted={active ? "true" : undefined}
                    data-loading={isLoading ? "true" : undefined}
                    onClick={() => void handleToggle(it.id)}
                  >
                    {isLoading ? tu("savingPending") : `${it.nameAr} (${it.value})${active ? " ✓" : ""}`}
                  </Button>
                );
              })}
            </div>
          )}
          {/* تفصيل نقاط اليوم (6-ج) */}
          {todayEarned.length > 0 && (
            <div data-testid="today-earned-detail" style={{ fontSize: ui.text.xs, color: ui.color.success, marginTop: sp(2), padding: `${sp(1)} ${sp(2)}`, background: ui.color.surface, borderRadius: ui.radius.sm, border: `1px solid ${ui.color.border}` }}>
              {tu("todayEarnedLabel")}{" "}
              {todayEarned.map((i) => `${i.nameAr} +${arNum(i.value)}`).join(" · ")}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
