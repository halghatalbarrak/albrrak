"use client";

import { Badge, Button, sp, ui } from "@/components/ui";
import { attendanceLockAr as tLock } from "@/i18n/ar/attendance-lock";
import type { DayLock, LockState, PostFn } from "./_types";

const LOCK_LABEL: Record<LockState, string> = {
  OPEN: tLock.stateOpen, APPROVED: tLock.stateApproved, AUTO_LOCKED: tLock.stateAutoLocked, TEMP_OPEN: tLock.stateTempOpen,
};
const LOCK_TONE: Record<LockState, "success" | "danger" | "bronze" | "neutral"> = {
  OPEN: "success", APPROVED: "bronze", AUTO_LOCKED: "danger", TEMP_OPEN: "bronze",
};

export function DayLockBar({ lock, circleId, date, post }: {
  lock: DayLock; circleId: string; date: string; post: PostFn;
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
