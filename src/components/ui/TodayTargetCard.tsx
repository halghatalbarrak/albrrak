import { formatAyah } from "@/lib/format";

import { ui, sp } from "./tokens";
import { Badge } from "./Badge";

// عرض «وجهة اليوم» (م٤): المهامّ الثلاث محسوبةً بحدودها (سورة:آية). مكوّنٌ مشترَكٌ بين لوحة
// الجلسة (المعلّم) وصفحة الطالب — عرضٌ فقط، لا يسجّل. المصطلحات: احفظ · رسّخ · راجِع.

export interface TTBound { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }
export interface TTNewHifz { kind: "NEW" | "REPEAT" | "COMPLETED" | "NO_TRACK"; bound?: TTBound }
export interface TTData {
  status: "ACTIVE" | "ON_LEAVE" | "NOT_MARAQI" | "INACTIVE";
  newHifz: TTNewHifz | null;
  tarseekh: TTBound[];
  murajaah: { dayNo: number | null; totalStock: number; todaySlice: TTBound[] } | null;
}

const bound = (b: TTBound) => formatAyah(b.fromSurah, b.fromAyah, b.toSurah, b.toAyah);

const chip: React.CSSProperties = { display: "inline-block", padding: "2px 8px", borderRadius: ui.radius.full, border: `1px solid ${ui.color.goldLine}`, background: ui.color.surface, fontSize: ui.text.xs, margin: "2px" };
const line: React.CSSProperties = { display: "flex", gap: sp(2), alignItems: "baseline", flexWrap: "wrap", marginBottom: sp(2) };

function Chips({ items }: { items: TTBound[] }) {
  return <span>{items.map((b, i) => <span key={i} style={chip}>{bound(b)}</span>)}</span>;
}

/** بطاقةُ «وجهة اليوم» — تُعرض داخل حاوٍ (Card) خارجيّ. forStudent يبدّل نبرة الرسائل. */
export function TodayTargetView({ t, forStudent = false }: { t: TTData; forStudent?: boolean }) {
  if (t.status === "ON_LEAVE") return <p style={{ margin: 0, color: ui.color.muted, fontSize: ui.text.xs }}>في إجازة اختبار المرحلة — لا وجهةَ اليوم.</p>;
  if (t.status !== "ACTIVE") return <p style={{ margin: 0, color: ui.color.muted, fontSize: ui.text.xs }}>لا وجهةَ اليوم.</p>;

  return (
    <div style={{ fontSize: ui.text.xs }}>
      {/* ١) الحفظ الجديد */}
      <div style={line}>
        <Badge tone="primary">احفظ</Badge>
        {t.newHifz?.kind === "NEW" && t.newHifz.bound && <strong style={{ color: ui.color.text }}>{bound(t.newHifz.bound)}</strong>}
        {t.newHifz?.kind === "REPEAT" && t.newHifz.bound && <span style={{ color: ui.color.danger }}>أعِد مقطع أمس (لم يُتقن): <strong>{bound(t.newHifz.bound)}</strong></span>}
        {t.newHifz?.kind === "COMPLETED" && <span style={{ color: ui.color.success }}>{forStudent ? "أتممتَ محفوظ مسارك — بارك الله فيك 🎉" : "أتمّ محفوظ مساره"}</span>}
        {t.newHifz?.kind === "NO_TRACK" && <span style={{ color: ui.color.muted }}>لم يُحدَّد المسار بعد (اختبار الوتيرة)</span>}
      </div>

      {/* ٢) الترسيخ */}
      <div style={line}>
        <Badge tone="bronze">رسّخ</Badge>
        {t.tarseekh.length === 0 ? <span style={{ color: ui.color.muted }}>لا ترسيخَ بعد</span>
          : <span><span style={{ color: ui.color.muted }}>آخر {t.tarseekh.length} وحدة: </span><Chips items={t.tarseekh} /></span>}
      </div>

      {/* ٣) المراجعة */}
      <div style={{ ...line, marginBottom: 0 }}>
        <Badge tone="bronze">راجِع</Badge>
        {!t.murajaah || t.murajaah.todaySlice.length === 0
          ? <span style={{ color: ui.color.muted }}>{t.murajaah?.dayNo == null ? "لا مراجعةَ اليوم (عطلة)" : "لا راسخَ للمراجعة بعد"}</span>
          : <span><span style={{ color: ui.color.muted }}>حصّة اليوم (الأضعف أوّلاً): </span><Chips items={t.murajaah.todaySlice} /></span>}
      </div>
    </div>
  );
}
