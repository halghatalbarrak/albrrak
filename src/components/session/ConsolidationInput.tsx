"use client";

import { useState } from "react";

import { formatAyah } from "@/lib/format";
import { tDailyRecorder as t } from "@/i18n/ar/daily-recorder";
import { Button, Input, ui, sp } from "@/components/ui";
import type { TTBound } from "@/components/ui";

// مكوّن الترسيخ والمراجعة المشترَك — المعلّم يؤكّد ولا يكتب.
// الترسيخ: «تمّ كما هو المطلوب» | «لم يتمّ».
// المراجعة: «تمّت كما هو المطلوب» | «لم تتمّ» | «جزء منه» (¼ ½ ¾) | «زيادة» (+١ +٢ +٣) | «مقدار آخر».

interface TarseekhInputProps {
  bounds: TTBound[];
  onDone: (done: boolean) => void;
}

export function TarseekhInput({ bounds, onDone }: TarseekhInputProps) {
  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
      {bounds.length > 0 && (
        <p style={{ margin: 0, fontSize: ui.text.xs, color: ui.color.muted }}>
          {bounds.slice(0, 4).map((b) => formatAyah(b.fromSurah, b.fromAyah, b.toSurah, b.toAyah)).join(" · ")}{bounds.length > 4 ? " …" : ""}
        </p>
      )}
      <div style={row}>
        <button
          style={{ minHeight: 48, flex: "1 1 auto", background: ui.color.primary, color: "#fff", border: "none", borderRadius: ui.radius.md, fontFamily: ui.font, fontSize: ui.text.base, fontWeight: 700, cursor: "pointer", padding: `${sp(1.5)} ${sp(4)}` }}
          onClick={() => onDone(true)}
        >
          {t("tarseekhDoneAsIs")}
        </button>
        <button
          style={{ minHeight: 48, flex: "1 1 auto", background: ui.color.danger, color: "#fff", border: "none", borderRadius: ui.radius.md, fontFamily: ui.font, fontSize: ui.text.base, fontWeight: 700, cursor: "pointer", padding: `${sp(1.5)} ${sp(4)}` }}
          onClick={() => onDone(false)}
        >
          {t("tarseekhNotDone")}
        </button>
      </div>
    </div>
  );
}

interface MurajaahInputProps {
  todaySlice: TTBound[];
  onRecord: (count: number) => void;
}

export function MurajaahInput({ todaySlice, onRecord }: MurajaahInputProps) {
  const count = todaySlice.length;
  const [showPartial, setShowPartial] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [otherCount, setOtherCount] = useState("");

  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };
  const ghostBtn = (active?: boolean): React.CSSProperties => ({
    minHeight: 44,
    background: active ? ui.color.soft : ui.color.surface,
    color: ui.color.text,
    border: `1px solid ${ui.color.border}`,
    borderRadius: ui.radius.md,
    fontFamily: ui.font,
    fontSize: ui.text.base,
    cursor: "pointer",
    padding: `${sp(1)} ${sp(3)}`,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
      {todaySlice.length > 0 && (
        <p style={{ margin: 0, fontSize: ui.text.xs, color: ui.color.muted }}>
          {todaySlice.slice(0, 4).map((b) => formatAyah(b.fromSurah, b.fromAyah, b.toSurah, b.toAyah)).join(" · ")}{todaySlice.length > 4 ? " …" : ""}
        </p>
      )}

      {/* الصفّ الأوّل: تمّت كما هو + لم تتمّ + جزء منه + زيادة */}
      <div style={row}>
        <button
          style={{ minHeight: 48, flex: "1 1 auto", background: ui.color.primary, color: "#fff", border: "none", borderRadius: ui.radius.md, fontFamily: ui.font, fontSize: ui.text.base, fontWeight: 700, cursor: "pointer", padding: `${sp(1.5)} ${sp(3)}` }}
          onClick={() => { onRecord(count); setShowPartial(false); setShowExtra(false); }}
        >
          {t("murajaahDoneAsIs")}
        </button>
        <button
          style={{ minHeight: 48, background: ui.color.danger, color: "#fff", border: "none", borderRadius: ui.radius.md, fontFamily: ui.font, fontSize: ui.text.base, fontWeight: 700, cursor: "pointer", padding: `${sp(1.5)} ${sp(3)}` }}
          onClick={() => { onRecord(0); setShowPartial(false); setShowExtra(false); }}
        >
          {t("murajaahNotDone")}
        </button>
        <button style={ghostBtn(showPartial)} onClick={() => { setShowPartial((v) => !v); setShowExtra(false); }}>
          {t("partial")}
        </button>
        <button style={ghostBtn(showExtra)} onClick={() => { setShowExtra((v) => !v); setShowPartial(false); }}>
          {t("extra")}
        </button>
      </div>

      {/* جزء منه: ¼ ½ ¾ */}
      {showPartial && (
        <div style={row}>
          {[
            { key: "partialQuarter", frac: 0.25 },
            { key: "partialHalf", frac: 0.5 },
            { key: "partialThreeQuarters", frac: 0.75 },
          ].map(({ key, frac }) => (
            <button key={key} style={{ ...ghostBtn(), minWidth: 60 }} onClick={() => { onRecord(Math.max(1, Math.round(count * frac))); setShowPartial(false); }}>
              {t(key as "partialQuarter" | "partialHalf" | "partialThreeQuarters")}
            </button>
          ))}
        </div>
      )}

      {/* زيادة: +١ +٢ +٣ */}
      {showExtra && (
        <div style={row}>
          {[
            { key: "extraUnits1", add: 1 },
            { key: "extraUnits2", add: 2 },
            { key: "extraUnits3", add: 3 },
          ].map(({ key, add }) => (
            <button key={key} style={{ ...ghostBtn(), minWidth: 60 }} onClick={() => { onRecord(count + add); setShowExtra(false); }}>
              {t(key as "extraUnits1" | "extraUnits2" | "extraUnits3")}
            </button>
          ))}
        </div>
      )}

      {/* مقدار آخر */}
      <div style={{ ...row, fontSize: ui.text.xs }}>
        <span style={{ color: ui.color.muted }}>{t("otherAmountLabel")}:</span>
        <Input type="number" min={0} value={otherCount} onChange={(e) => setOtherCount(e.target.value)} placeholder={t("otherAmountPlaceholder")} style={{ width: 80 }} />
        <Button size="sm" variant="ghost" onClick={() => { const n = Number(otherCount); if (!isNaN(n) && n >= 0) { onRecord(n); setOtherCount(""); } }}>{t("otherAmountSave")}</Button>
      </div>
    </div>
  );
}
