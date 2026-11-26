"use client";

import { useState } from "react";

import { surahName } from "@/lib/surah-names";
import { arNum } from "@/lib/format";
import { tDailyRecorder as t } from "@/i18n/ar/daily-recorder";
import { ui, sp } from "@/components/ui";
import type { TTBound } from "@/components/ui";

// مكوّن تسجيل الحفظ — المقرّر نصٌ ثابتٌ لا يُعدَّل (قرار المدير).
// «أتقن ✓» / «لم يتقن» + المحاولات ١/٢/٣ فقط.

export interface HifzSave {
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  attempts: number;
  mastered: boolean;
}

interface HifzInputProps {
  /** الحد المقترح من وجهة اليوم (newHifz.bound). */
  bound: TTBound | null;
  /** نوع الحفظ — REPEAT يظهر تنبيه «يعيد مقطع أمس». */
  hifzKind?: "NEW" | "REPEAT" | "COMPLETED" | "NO_TRACK" | null;
  /** الحكم ١: هل يجب إعادة نفس المقطع؟ */
  mustRepeat?: boolean;
  mustRepeatBound?: TTBound | null;
  /** ما سُجِّل فعلاً اليوم (للعرض فقط). */
  savedToday?: { toSurah: number; toAyah: number; attempts: number; mastered: boolean } | null;
  /** رسالة خطأ تظهر داخل البطاقة بعد فشل الحفظ. */
  saveError?: string | null;
  /** true أثناء إرسال الطلب — يُعطَّل الزر. */
  saving?: boolean;
  onSave: (s: HifzSave) => void | Promise<void>;
}

const btnStyle = (active: boolean, saved = false): React.CSSProperties => ({
  minWidth: 44, minHeight: 44,
  background: saved ? ui.color.success : active ? ui.color.surface : ui.color.surface,
  color: saved ? "#fff" : ui.color.text,
  border: `1px solid ${saved ? ui.color.success : active ? ui.color.primary : ui.color.border}`,
  borderRadius: ui.radius.md,
  fontFamily: ui.font,
  fontSize: ui.text.base,
  fontWeight: saved ? 700 : 400,
  cursor: "pointer",
  padding: `${sp(1)} ${sp(2.5)}`,
  outline: active && !saved ? `2px solid ${ui.color.primary}` : "none",
  outlineOffset: "1px",
});

export function HifzInput({ bound, hifzKind, mustRepeat, mustRepeatBound, savedToday, saveError, saving, onSave }: HifzInputProps) {
  const activeBound = mustRepeat && mustRepeatBound ? mustRepeatBound : bound;
  const [attempts, setAttempts] = useState(1);

  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };

  const buildSave = (mastered: boolean): HifzSave => ({
    fromSurah: activeBound?.fromSurah ?? 1,
    fromAyah: activeBound?.fromAyah ?? 1,
    toSurah: activeBound?.toSurah ?? 1,
    toAyah: activeBound?.toAyah ?? 1,
    attempts,
    mastered,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
      {/* تنبيه الحكم ١ */}
      {mustRepeat && mustRepeatBound && (
        <p style={{ margin: 0, padding: `${sp(2)} ${sp(3)}`, background: "var(--color-warn-bg,#fffbe6)", borderRadius: ui.radius.md, fontSize: ui.text.xs }}>
          {t("hifzGateWarning")}{t("hifzGateRangeOpen")}{surahName(mustRepeatBound.fromSurah)} {arNum(mustRepeatBound.fromAyah)} ← {surahName(mustRepeatBound.toSurah)} {arNum(mustRepeatBound.toAyah)}{t("hifzGateSuffix")}
        </p>
      )}
      {!mustRepeat && hifzKind === "REPEAT" && (
        <p style={{ margin: 0, fontSize: ui.text.xs, color: ui.color.danger }}>{t("repeatWarning")}</p>
      )}

      {/* المقرّر نصاً ثابتاً */}
      {activeBound && (
        <p style={{ margin: 0, fontSize: ui.text.base, fontWeight: 600 }}>
          {surahName(activeBound.fromSurah)} {arNum(activeBound.fromAyah)} ← {surahName(activeBound.toSurah)} {arNum(activeBound.toAyah)}
        </p>
      )}

      {/* أزرار المحاولات — ٣ فقط (الحكم ١) */}
      <div style={row}>
        <span style={{ fontSize: ui.text.xs }}>{t("attemptsLabel")}</span>
        {([1, 2, 3] as const).map((n, i) => {
          const isSelected = attempts === n;
          const isSaved = !!savedToday && savedToday.attempts === n;
          return (
            <button key={n} style={btnStyle(isSelected, isSaved)} onClick={() => !savedToday && setAttempts(n)}>
              {isSaved ? `✓ ${["١", "٢", "٣"][i]}` : ["١", "٢", "٣"][i]}
            </button>
          );
        })}
      </div>

      {saveError && (
        <p style={{ margin: 0, fontSize: ui.text.xs, color: ui.color.danger, padding: `${sp(1.5)} ${sp(2)}`, background: "var(--color-danger-bg,#fff0f0)", borderRadius: ui.radius.sm }}>
          {saveError}
        </p>
      )}
      <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap" }}>
        <button
          disabled={saving || !!savedToday}
          data-testid="hifz-btn-mastered"
          data-saved={savedToday?.mastered === true ? "true" : undefined}
          style={{
            flex: "1 1 44%", minHeight: 52, borderRadius: ui.radius.md, fontFamily: ui.font, fontSize: ui.text.base, fontWeight: 700, cursor: (saving || savedToday) ? "default" : "pointer", padding: `${sp(2)} ${sp(3)}`, opacity: saving ? 0.7 : 1,
            background: savedToday?.mastered === true ? ui.color.success : ui.color.surface,
            color: savedToday?.mastered === true ? "#fff" : ui.color.text,
            border: `1px solid ${savedToday?.mastered === true ? ui.color.success : ui.color.border}`,
          }}
          onClick={() => { if (!saving && !savedToday) void onSave(buildSave(true)); }}
        >
          {saving ? "جارٍ التسجيل…" : savedToday?.mastered === true ? `✓ ${t("masteredBtn")}` : t("masteredBtn")}
        </button>
        <button
          disabled={saving || !!savedToday}
          data-testid="hifz-btn-not-mastered"
          data-saved={savedToday?.mastered === false ? "true" : undefined}
          style={{
            flex: "1 1 44%", minHeight: 52, borderRadius: ui.radius.md, fontFamily: ui.font, fontSize: ui.text.base, fontWeight: 600, cursor: (saving || savedToday) ? "default" : "pointer", padding: `${sp(2)} ${sp(3)}`, opacity: saving ? 0.7 : 1,
            background: savedToday?.mastered === false ? ui.color.success : ui.color.surface,
            color: savedToday?.mastered === false ? "#fff" : ui.color.text,
            border: `1px solid ${savedToday?.mastered === false ? ui.color.success : ui.color.border}`,
          }}
          onClick={() => { if (!saving && !savedToday) void onSave(buildSave(false)); }}
        >
          {savedToday?.mastered === false ? `✓ ${t("notMasteredBtn")}` : t("notMasteredBtn")}
        </button>
      </div>

      {savedToday && (
        <p style={{ margin: 0, fontSize: ui.text.xs, color: ui.color.muted }}>
          ✓ {surahName(savedToday.toSurah)} {arNum(savedToday.toAyah)} · {arNum(savedToday.attempts)} مح · {savedToday.mastered ? t("masteredToggle") : t("notMasteredToggle")}
        </p>
      )}
    </div>
  );
}
