"use client";

import { useState } from "react";
import { Button, sp, ui } from "@/components/ui";
import { SURAH_AYAH_COUNTS_TANZIL, SURAH_NAMES } from "@/lib/surah-names";
import type { Student } from "./_types";
import { token } from "./_types";
import { tUnified as tu } from "@/i18n/ar/unified";

// ═══════════════════════════════════════════════════════════════
// مساعدات السور
// ═══════════════════════════════════════════════════════════════
const MAX_SURAH = 114;
const surahOptions = Array.from({ length: MAX_SURAH }, (_, i) => ({
  num: i + 1,
  name: SURAH_NAMES[i + 1] ?? "",
}));

function maxAyah(surah: number): number {
  return SURAH_AYAH_COUNTS_TANZIL[surah] ?? 1;
}

// ═══════════════════════════════════════════════════════════════
// نوع حالة بند التصحيح لكل طالب
// ═══════════════════════════════════════════════════════════════
interface CorrRow {
  studentId: string;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
}

// ═══════════════════════════════════════════════════════════════
// select السورة
// ═══════════════════════════════════════════════════════════════
function SurahSelect({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        fontFamily: ui.font,
        fontSize: ui.text.xs,
        padding: `${sp(1)} ${sp(1.5)}`,
        borderRadius: ui.radius.sm,
        border: `1px solid ${ui.color.border}`,
        background: ui.color.surface,
        color: ui.color.text,
        maxWidth: 130,
      }}
    >
      {surahOptions.map((s) => (
        <option key={s.num} value={s.num}>
          {s.num}. {s.name}
        </option>
      ))}
    </select>
  );
}

// ═══════════════════════════════════════════════════════════════
// select الآية
// ═══════════════════════════════════════════════════════════════
function AyahSelect({
  surah,
  value,
  onChange,
}: {
  surah: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const max = maxAyah(surah);
  const opts = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <select
      value={Math.min(value, max)}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        fontFamily: ui.font,
        fontSize: ui.text.xs,
        padding: `${sp(1)} ${sp(1.5)}`,
        borderRadius: ui.radius.sm,
        border: `1px solid ${ui.color.border}`,
        background: ui.color.surface,
        color: ui.color.text,
        width: 68,
      }}
    >
      {opts.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

// ═══════════════════════════════════════════════════════════════
// المكوّن الرئيسي
// ═══════════════════════════════════════════════════════════════
export function BulkCorrectDialog({
  students,
  circleId,
  onDone,
  onClose,
}: {
  students: Student[];
  circleId: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CorrRow[]>(() =>
    students.map((s) => ({
      studentId: s.studentId,
      fromSurah: s.yesterday?.fromSurah ?? 78,
      fromAyah: s.yesterday?.fromAyah ?? 1,
      toSurah: s.yesterday?.toSurah ?? 78,
      toAyah: s.yesterday?.toAyah ?? 10,
    })),
  );
  const [reason, setReason] = useState<
    "INPUT_ERROR" | "LEVEL_TEST" | "OTHER" | ""
  >("");
  const [reasonNote, setReasonNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(
    null,
  );

  function updateRow(idx: number, patch: Partial<CorrRow>) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  async function handleSave() {
    if (!reason) {
      setMsg({ text: tu("bulkCorrectErrorRequired"), kind: "err" });
      return;
    }
    if (reason === "OTHER" && !reasonNote.trim()) {
      setMsg({ text: tu("bulkCorrectErrorNoteRequired"), kind: "err" });
      return;
    }
    setSaving(true);
    setMsg(null);
    const tok = await token();
    if (!tok) {
      setMsg({ text: tu("bulkCorrectSessionEnded"), kind: "err" });
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/circles/${circleId}/bulk-correct-positions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${tok}`,
          },
          body: JSON.stringify({
            corrections: rows,
            reason,
            reasonNote: reasonNote.trim() || undefined,
          }),
        },
      );
      const j = (await res.json()) as {
        corrected?: number;
        errors?: { studentId: string; error: string }[];
        request?: boolean;
      };
      if (j.request) {
        setMsg({ text: tu("bulkCorrectSuccess"), kind: "ok" });
        setTimeout(() => { onDone(); onClose(); }, 1200);
        return;
      }
      const ok = j.corrected ?? 0;
      const fail = (j.errors ?? []).length;
      if (fail === 0) {
        setMsg({ text: `${tu("bulkCorrectSuccess")} (${ok})`, kind: "ok" });
        setTimeout(() => { onDone(); onClose(); }, 900);
      } else {
        setMsg({ text: `${tu("bulkCorrectPartial")} ✓${ok} ✗${fail}`, kind: fail > 0 && ok === 0 ? "err" : "ok" });
      }
    } catch {
      setMsg({ text: tu("bulkCorrectNetworkError"), kind: "err" });
    }
    setSaving(false);
  }

  // ── أنماط ────────────────────────────────────────────────────
  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    zIndex: 1000,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    overflowY: "auto",
    padding: sp(4),
  };
  const dialog: React.CSSProperties = {
    background: ui.color.surface,
    borderRadius: ui.radius.lg,
    border: `1px solid ${ui.color.border}`,
    padding: sp(5),
    width: "100%",
    maxWidth: 860,
    display: "flex",
    flexDirection: "column",
    gap: sp(4),
    marginTop: sp(4),
  };
  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: ui.text.xs,
  };
  const thStyle: React.CSSProperties = {
    textAlign: "start",
    padding: `${sp(1.5)} ${sp(2)}`,
    color: ui.color.muted,
    borderBottom: `1px solid ${ui.color.border}`,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: `${sp(1.5)} ${sp(2)}`,
    borderBottom: `1px solid ${ui.color.border}`,
    verticalAlign: "middle",
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={dialog} role="dialog" aria-modal="true" data-testid="bulk-correct-dialog">
        <h2 style={{ margin: 0, fontSize: ui.text.lg, fontWeight: 700 }}>{tu("bulkCorrectTitle")}</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{tu("bulkCorrectColName")}</th>
                <th style={{ ...thStyle, minWidth: 240 }}>{tu("bulkCorrectColFrom")}</th>
                <th style={{ ...thStyle, minWidth: 240 }}>{tu("bulkCorrectColTo")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const s = students.find((x) => x.studentId === row.studentId);
                return (
                  <tr key={row.studentId}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>{s?.name ?? row.studentId}</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: sp(1.5), alignItems: "center", flexWrap: "wrap" }}>
                        <SurahSelect
                          value={row.fromSurah}
                          onChange={(v) => updateRow(idx, { fromSurah: v, fromAyah: 1 })}
                        />
                        <AyahSelect
                          surah={row.fromSurah}
                          value={row.fromAyah}
                          onChange={(v) => updateRow(idx, { fromAyah: v })}
                        />
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: sp(1.5), alignItems: "center", flexWrap: "wrap" }}>
                        <SurahSelect
                          value={row.toSurah}
                          onChange={(v) => updateRow(idx, { toSurah: v, toAyah: 1 })}
                        />
                        <AyahSelect
                          surah={row.toSurah}
                          value={row.toAyah}
                          onChange={(v) => updateRow(idx, { toAyah: v })}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* السبب */}
        <div style={{ display: "flex", gap: sp(3), flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
            <label style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tu("bulkCorrectReasonLabel")}</label>
            <select
              data-testid="bulk-correct-reason-select"
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              style={{
                fontFamily: ui.font,
                fontSize: ui.text.base,
                padding: `${sp(1.5)} ${sp(2)}`,
                borderRadius: ui.radius.sm,
                border: `1px solid ${ui.color.border}`,
                background: ui.color.surface,
                color: ui.color.text,
                minWidth: 160,
              }}
            >
              <option value="">{tu("bulkCorrectChooseReason")}</option>
              <option value="INPUT_ERROR">{tu("bulkCorrectReasonInputError")}</option>
              <option value="LEVEL_TEST">{tu("bulkCorrectReasonLevelTest")}</option>
              <option value="OTHER">{tu("bulkCorrectReasonOther")}</option>
            </select>
          </div>

          {reason === "OTHER" && (
            <div style={{ display: "flex", flexDirection: "column", gap: sp(1), flex: "1 1 220px" }}>
              <label style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tu("bulkCorrectReasonNote")}</label>
              <input
                type="text"
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="اكتب ملاحظة..."
                style={{
                  fontFamily: ui.font,
                  fontSize: ui.text.base,
                  padding: `${sp(1.5)} ${sp(2)}`,
                  borderRadius: ui.radius.sm,
                  border: `1px solid ${ui.color.border}`,
                  background: ui.color.surface,
                  color: ui.color.text,
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}
        </div>

        {/* رسالة الحالة */}
        {msg && (
          <p
            style={{
              margin: 0,
              fontSize: ui.text.xs,
              color: msg.kind === "ok" ? ui.color.success : ui.color.danger,
            }}
          >
            {msg.text}
          </p>
        )}

        {/* أزرار الحفظ والإلغاء */}
        <div style={{ display: "flex", gap: sp(2), justifyContent: "flex-end" }}>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
            {tu("bulkCorrectCancel")}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void handleSave()}
            disabled={saving}
            data-testid="bulk-correct-save-btn"
          >
            {saving ? tu("bulkCorrectSaving") : tu("bulkCorrectSave")}
          </Button>
        </div>
      </div>
    </div>
  );
}
