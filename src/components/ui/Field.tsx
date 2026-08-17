import type { CSSProperties, ReactNode } from "react";

import { ui, sp } from "./tokens";

/** نمطُ مدخلٍ موحَّد (input/select) بهوية المنصّة — يُستعمل في النماذج. */
export const inputStyle: CSSProperties = {
  width: "100%",
  padding: `${sp(2.5)} ${sp(3)}`,
  fontSize: ui.text.base,
  fontFamily: ui.font,
  color: ui.color.text,
  background: ui.color.surface,
  border: `1px solid ${ui.color.border}`,
  borderRadius: ui.radius.md,
  boxSizing: "border-box",
};

/** حقلٌ مُعنوَن (تسمية + محتوى) — المحتوى مدخلٌ حرٌّ (input/select/datalist). */
export function Field({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: sp(1), marginBottom: sp(3), ...style }}>
      <span style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.text }}>{label}</span>
      {children}
    </label>
  );
}
