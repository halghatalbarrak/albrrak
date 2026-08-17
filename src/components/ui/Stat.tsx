import type { ReactNode } from "react";

import { ui, sp } from "./tokens";

/** بطاقةُ رقمٍ للملخّص (المرحلة ٥): تسمية + قيمةٌ كبيرة + تلميحٌ اختياريّ. */
export function Stat({ label, value, hint, tone = "primary" }: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "primary" | "bronze" | "success" | "danger";
}) {
  const accent = {
    primary: ui.color.primary, bronze: ui.color.bronze,
    success: ui.color.success, danger: ui.color.danger,
  }[tone];
  return (
    <div style={{
      background: ui.color.surface, border: `1px solid ${ui.color.border}`,
      borderRadius: ui.radius.lg, boxShadow: ui.shadowCard,
      padding: sp(5), display: "flex", flexDirection: "column", gap: sp(1),
      borderTop: `3px solid ${accent}`,
    }}>
      <span style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.muted }}>{label}</span>
      <span style={{ fontSize: ui.text.xxl, fontWeight: 700, color: ui.color.text, lineHeight: 1.1 }}>{value}</span>
      {hint && <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{hint}</span>}
    </div>
  );
}
