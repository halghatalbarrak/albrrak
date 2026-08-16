import type { HTMLAttributes } from "react";

import { ui, sp } from "./tokens";

/** بطاقةٌ بيضاء بحوافّ ناعمةٍ وظلٍّ خفيف (المرحلة ١). */
export function Card({ style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      style={{
        background: ui.color.surface,
        border: `1px solid ${ui.color.border}`,
        borderRadius: ui.radius.lg,
        boxShadow: ui.shadowCard,
        padding: sp(5),
        color: ui.color.text,
        ...style,
      }}
    />
  );
}
