"use client";

import { useState } from "react";
import { Button, sp, ui } from "@/components/ui";
import { arNum, count, formatAyah } from "@/lib/format";
import { tUnified as tu } from "@/i18n/ar/unified";
import { token } from "./_types";
import type { Bound } from "./_types";

function boundsRangeLabel(bounds: Bound[]): string {
  if (!bounds.length) return "—";
  const first = bounds[0];
  const last = bounds[bounds.length - 1];
  const outer = formatAyah(first.fromSurah, first.fromAyah, last.toSurah, last.toAyah);
  if (bounds.length === 1) return outer;
  return `${outer} (${count(bounds.length, "وحدة", "وحدتان", "وحدات", "وحدة")})`;
}

export function ConsolidationRow({ label, bounds, studentId, date, onDone, onExtra }: {
  label: string; bounds: Bound[];
  studentId: string; date: string;
  onDone: (done: boolean) => void;
  onExtra: () => void;
}) {
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [unitErrors, setUnitErrors] = useState<Record<number, 0 | 1 | 2 | 3>>(() => {
    const init: Record<number, 0 | 1 | 2 | 3> = {};
    for (let i = 0; i < bounds.length; i++) {
      const e = Math.min(bounds[i].savedErrors ?? 0, 3) as 0 | 1 | 2 | 3;
      if (e > 0) init[i] = e;
    }
    return init;
  });
  const [savedFor, setSavedFor] = useState<number | null>(null);
  const [revertedUnits, setRevertedUnits] = useState<Set<number>>(new Set());

  const rangeText = boundsRangeLabel(bounds);
  const erroredCount = Object.values(unitErrors).filter((e) => e > 0).length;

  const errorLabel = (n: 0 | 1 | 2 | 3): string =>
    n === 0 ? tu("consolidUnitSafe")
    : n === 1 ? tu("consolidUnit1")
    : n === 2 ? tu("consolidUnit2")
    : tu("consolidUnit3");

  const handleTap = async (i: number) => {
    const cur = (unitErrors[i] ?? 0) as 0 | 1 | 2 | 3;
    const next = cur >= 3 ? 0 : (cur + 1) as 0 | 1 | 2 | 3;
    setUnitErrors((prev) => ({ ...prev, [i]: next }));
    if (!bounds[i].sessionId) return;
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${studentId}/unit-errors`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ sessionId: bounds[i].sessionId, errorCount: next, date }),
    });
    if (res.ok) {
      const data = (await res.json()) as { reverted?: boolean; undidRevert?: boolean };
      if (data.undidRevert) {
        setRevertedUnits((prev) => { const s = new Set(prev); s.delete(i); return s; });
        setSavedFor(i);
        setTimeout(() => setSavedFor((v) => (v === i ? null : v)), 2000);
      } else if (data.reverted) {
        setRevertedUnits((prev) => new Set(prev).add(i));
      } else {
        setRevertedUnits((prev) => { const s = new Set(prev); s.delete(i); return s; });
        setSavedFor(i);
        setTimeout(() => setSavedFor((v) => (v === i ? null : v)), 2000);
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
      {/* السطر الأوّل: العنوان + نطاق الوحدات (يملأ العرض كاملاً) */}
      <div style={{ display: "flex", gap: sp(2), alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: ui.text.base, flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: ui.text.xs, color: ui.color.muted, wordBreak: "break-word" }}>{rangeText}</span>
      </div>
      {/* السطر الثاني: الأزرار */}
      <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" }}>
        <Button size="sm" variant="primary" data-testid="consol-btn-done" onClick={() => onDone(true)}>{tu("consolidDone")}</Button>
        <Button size="sm" variant="danger" data-testid="consol-btn-not-done" onClick={() => onDone(false)}>{tu("consolidNotDone")}</Button>
        {bounds.length > 0 && (
          <Button size="sm" variant="ghost" data-testid="consol-btn-errors" onClick={() => setErrorsOpen((v) => !v)}>
            {errorsOpen
              ? tu("consolidHideErrors")
              : `${tu("consolidErrors")}${erroredCount > 0 ? ` ${arNum(erroredCount)}` : ""}`}
          </Button>
        )}
        <Button size="sm" variant="ghost" data-testid="consol-btn-extra" onClick={onExtra}>{tu("addMore")}</Button>
      </div>

      {errorsOpen && bounds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(1), background: ui.color.bg, padding: sp(2), borderRadius: ui.radius.md, border: `1px solid ${ui.color.border}` }}>
          {bounds.map((b, i) => {
            const errs = (unitErrors[i] ?? 0) as 0 | 1 | 2 | 3;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: sp(2) }}>
                <span style={{ flex: 1, fontSize: ui.text.xs }}>{formatAyah(b.fromSurah, b.fromAyah, b.toSurah, b.toAyah)}</span>
                {revertedUnits.has(i) && (
                  <span style={{ fontSize: ui.text.xs, color: ui.color.danger }}>{tu("consolidReverted")}</span>
                )}
                {savedFor === i && !revertedUnits.has(i) && (
                  <span style={{ fontSize: ui.text.xs, color: ui.color.success }}>{tu("consolidSaved")}</span>
                )}
                <button
                  onClick={() => void handleTap(i)}
                  style={{
                    fontSize: ui.text.xs, padding: `${sp(0.5)} ${sp(2.5)}`,
                    borderRadius: ui.radius.sm,
                    border: `1px solid ${errs > 0 ? ui.color.danger : ui.color.border}`,
                    background: errs >= 2 ? ui.color.danger : errs === 1 ? "#fffbe6" : ui.color.surface,
                    color: errs >= 2 ? "#fff" : errs === 1 ? "#b45309" : ui.color.muted,
                    cursor: "pointer", fontFamily: ui.font, minWidth: 90, minHeight: 36,
                  }}
                >
                  {errorLabel(errs)}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
