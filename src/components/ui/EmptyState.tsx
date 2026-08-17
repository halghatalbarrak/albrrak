import type { ReactNode } from "react";

import { ui, sp } from "./tokens";

/** حالةُ فراغٍ موحَّدة — حين لا بيانات: عنوانٌ ووصفٌ وإجراءٌ اختياريّ. */
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
      gap: sp(2), padding: `${sp(12)} ${sp(4)}`, color: ui.color.muted,
      background: ui.color.surface, border: `1px dashed ${ui.color.border}`, borderRadius: ui.radius.lg,
    }}>
      <p style={{ margin: 0, fontSize: ui.text.lg, fontWeight: 700, color: ui.color.text }}>{title}</p>
      {description && <p style={{ margin: 0, fontSize: ui.text.base, maxWidth: 420 }}>{description}</p>}
      {action && <div style={{ marginTop: sp(2) }}>{action}</div>}
    </div>
  );
}
