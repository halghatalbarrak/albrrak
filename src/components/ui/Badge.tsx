import type { HTMLAttributes } from "react";

import { ui, sp } from "./tokens";

type Tone = "primary" | "bronze" | "success" | "danger" | "neutral";

// اللون الأماميّ لكل نبرة (متغيّرٌ يتبع الوضع)، والخلفيّة تُشتقّ منه شفّافةً — فتصلح
// للفاتح والداكن معًا بلا قيمٍ ثابتة (الفكرة ٦).
const fgOf: Record<Tone, string> = {
  primary: ui.color.primary, bronze: ui.color.bronzeHover,
  success: ui.color.success, danger: ui.color.danger, neutral: ui.color.muted,
};

/** وسمٌ حبّيّ (للمراتب/الحالات) — المرحلة ١. */
export function Badge({ tone = "neutral", style, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  const fg = fgOf[tone];
  return (
    <span
      {...props}
      style={{
        display: "inline-block",
        fontFamily: ui.font, fontSize: ui.text.xs, fontWeight: 600,
        color: fg, background: `color-mix(in srgb, ${fg} 16%, transparent)`,
        borderRadius: ui.radius.full,
        padding: `${sp(1)} ${sp(2.5)}`,
        ...style,
      }}
    />
  );
}
