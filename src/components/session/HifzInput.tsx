"use client";

import { useState } from "react";

import { MARAQI_SURAH_ORDER } from "@/lib/maraqi-order";
import { SURAH_NAMES, surahName } from "@/lib/surah-names";
import { nextInMaraqi, prevInMaraqi } from "@/lib/ayah-nav";
import { tDailyRecorder as t } from "@/i18n/ar/daily-recorder";
import { Button, Input, ui, sp } from "@/components/ui";
import type { TTBound } from "@/components/ui";

// مكوّن تسجيل الحفظ الجديد المشترَك — المعلّم يؤكّد ولا يكتب.
// الوجهة معبّأةٌ مسبقاً؛ «سمّع كما هو» بنقرة. ± آية تعبر السور بترتيب مراقي.

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
  onSave: (s: HifzSave) => void;
}

const btnStyle = (active: boolean): React.CSSProperties => ({
  minWidth: 44, minHeight: 44,
  background: active ? ui.color.primary : ui.color.surface,
  color: active ? "#fff" : ui.color.text,
  border: `1px solid ${active ? ui.color.primary : ui.color.border}`,
  borderRadius: ui.radius.md,
  fontFamily: ui.font,
  fontSize: ui.text.base,
  cursor: "pointer",
  padding: `${sp(1)} ${sp(2.5)}`,
});

export function HifzInput({ bound, hifzKind, mustRepeat, mustRepeatBound, savedToday, onSave }: HifzInputProps) {
  const activeBound = mustRepeat && mustRepeatBound ? mustRepeatBound : bound;
  const [st, setSt] = useState<HifzSave>(() =>
    activeBound
      ? { fromSurah: activeBound.fromSurah, fromAyah: activeBound.fromAyah, toSurah: activeBound.toSurah, toAyah: activeBound.toAyah, attempts: 1, mastered: false }
      : { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 1, attempts: 1, mastered: false },
  );
  const [showSurah, setShowSurah] = useState(false);
  const [surahQ, setSurahQ] = useState("");

  const plusAyah = () => { const n = nextInMaraqi(st.toSurah, st.toAyah); if (n) setSt((s) => ({ ...s, toSurah: n.surah, toAyah: n.ayah })); };
  const minusAyah = () => { const p = prevInMaraqi(st.toSurah, st.toAyah); if (p) setSt((s) => ({ ...s, toSurah: p.surah, toAyah: p.ayah })); };

  const filteredSurahs = MARAQI_SURAH_ORDER.filter((s) => !surahQ.trim() || (SURAH_NAMES[s] ?? "").includes(surahQ.trim()));

  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
      {/* تنبيه الحكم ١ */}
      {mustRepeat && mustRepeatBound && (
        <p style={{ margin: 0, padding: `${sp(2)} ${sp(3)}`, background: "var(--color-warn-bg,#fffbe6)", borderRadius: ui.radius.md, fontSize: ui.text.xs }}>
          {t("hifzGateWarning")}{t("hifzGateRangeOpen")}{surahName(mustRepeatBound.fromSurah)} {mustRepeatBound.fromAyah} ← {surahName(mustRepeatBound.toSurah)} {mustRepeatBound.toAyah}{t("hifzGateSuffix")}
        </p>
      )}
      {!mustRepeat && hifzKind === "REPEAT" && (
        <p style={{ margin: 0, fontSize: ui.text.xs, color: ui.color.danger }}>{t("repeatWarning")}</p>
      )}

      {/* عرض وجهة اليوم */}
      {activeBound && (
        <p style={{ margin: 0, fontSize: ui.text.xs, color: ui.color.muted }}>
          {t("targetLabel")} {surahName(activeBound.fromSurah)} {activeBound.fromAyah} ← {surahName(activeBound.toSurah)} {activeBound.toAyah}
        </p>
      )}

      {/* النهاية الحاليّة + أزرار التعديل */}
      <div style={row}>
        <span style={{ fontSize: ui.text.xs }}>{t("endLabel")}</span>
        <strong style={{ fontSize: ui.text.base }}>{surahName(st.toSurah)} {st.toAyah}</strong>
        <Button size="sm" variant="ghost" onClick={minusAyah}>{t("minusAyah")}</Button>
        <Button size="sm" variant="ghost" onClick={plusAyah}>{t("plusAyah")}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setShowSurah((v) => !v); setSurahQ(""); }}>{t("surahLabel")} ▾</Button>
      </div>

      {/* قائمة السور المنسدلة */}
      {showSurah && (
        <div style={{ marginBottom: sp(1) }}>
          <Input
            value={surahQ}
            onChange={(e) => setSurahQ(e.target.value)}
            placeholder={t("surahSearch")}
            style={{ width: "100%", marginBottom: sp(1) }}
          />
          <div style={{ maxHeight: 180, overflowY: "auto", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md }}>
            {filteredSurahs.map((s) => (
              <button
                key={s}
                style={{ display: "block", width: "100%", textAlign: "start", padding: `${sp(1.5)} ${sp(3)}`, background: s === st.toSurah ? ui.color.soft : "transparent", border: "none", cursor: "pointer", fontFamily: ui.font, color: ui.color.text, fontSize: ui.text.base }}
                onClick={() => { setSt((prev) => ({ ...prev, toSurah: s, toAyah: 1 })); setShowSurah(false); setSurahQ(""); }}
              >
                {surahName(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* أزرار المحاولات */}
      <div style={row}>
        <span style={{ fontSize: ui.text.xs }}>{t("attemptsLabel")}</span>
        {([1, 2, 3] as const).map((n, i) => (
          <button key={n} style={btnStyle(st.attempts === n)} onClick={() => setSt((s) => ({ ...s, attempts: n }))}>
            {["١", "٢", "٣"][i]}
          </button>
        ))}
        <button style={btnStyle(st.attempts >= 4)} onClick={() => setSt((s) => ({ ...s, attempts: Math.max(4, s.attempts) }))}>
          ٤+
        </button>
      </div>

      {/* أزرار الفعل الرئيسيّة: «سمّع كما هو» + «أتقن» */}
      <div style={{ display: "flex", gap: sp(3), flexWrap: "wrap" }}>
        <button
          style={{ flex: "1 1 auto", minHeight: 52, background: ui.color.primary, color: "#fff", border: "none", borderRadius: ui.radius.md, fontFamily: ui.font, fontSize: ui.text.base, fontWeight: 700, cursor: "pointer", padding: `${sp(2)} ${sp(4)}` }}
          onClick={() => onSave(st)}
        >
          {t("sayAsIs")}
        </button>
        <button
          style={{ minHeight: 52, minWidth: 100, background: st.mastered ? ui.color.bronze : ui.color.surface, color: st.mastered ? "#fff" : ui.color.text, border: `1px solid ${st.mastered ? ui.color.bronze : ui.color.border}`, borderRadius: ui.radius.md, fontFamily: ui.font, fontSize: ui.text.base, fontWeight: 600, cursor: "pointer", padding: `${sp(2)} ${sp(4)}` }}
          onClick={() => setSt((s) => ({ ...s, mastered: !s.mastered }))}
        >
          {st.mastered ? t("masteredToggle") : t("notMasteredToggle")}
        </button>
      </div>

      {/* ملخّص ما سُجِّل فعلاً */}
      {savedToday && (
        <p style={{ margin: 0, fontSize: ui.text.xs, color: ui.color.muted }}>
          ✓ {surahName(savedToday.toSurah)} {savedToday.toAyah} · {savedToday.attempts} مح · {savedToday.mastered ? t("masteredToggle") : t("notMasteredToggle")}
        </p>
      )}
    </div>
  );
}
