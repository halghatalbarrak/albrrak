"use client";

import { sp, ui } from "@/components/ui";
import { arNum } from "@/lib/format";
import { SURAH_AYAH_COUNTS_TANZIL, SURAH_NAMES } from "@/lib/surah-names";

// ═══════════════════════════════════════════════════════════════
// مكوّنات مشتركة: اختيار السورة والآية — تُستخدم في النموذج الفردي
// والتصحيح الجماعي. الأرقام مشرقية (arNum).
// ═══════════════════════════════════════════════════════════════

const MAX_SURAH = 114;
const surahOptions = Array.from({ length: MAX_SURAH }, (_, i) => ({
  num: i + 1,
  name: SURAH_NAMES[i + 1] ?? "",
}));

export function maxAyah(surah: number): number {
  return SURAH_AYAH_COUNTS_TANZIL[surah] ?? 1;
}

const selectStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: ui.font,
  fontSize: ui.text.xs,
  padding: `${sp(1)} ${sp(1.5)}`,
  borderRadius: ui.radius.sm,
  border: `1px solid ${ui.color.border}`,
  background: ui.color.surface,
  color: ui.color.text,
  ...extra,
});

export function SurahSelect({
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
      style={selectStyle({ maxWidth: 150 })}
      data-testid="surah-select"
    >
      {surahOptions.map((s) => (
        <option key={s.num} value={s.num}>
          {arNum(s.num)}. {s.name}
        </option>
      ))}
    </select>
  );
}

export function AyahSelect({
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
      style={selectStyle({ width: 68 })}
      data-testid="ayah-select"
    >
      {opts.map((n) => (
        <option key={n} value={n}>
          {arNum(n)}
        </option>
      ))}
    </select>
  );
}
