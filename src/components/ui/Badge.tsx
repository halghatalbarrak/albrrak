import type { HTMLAttributes } from "react";

import { ui, sp } from "./tokens";

type Tone = "primary" | "bronze" | "success" | "danger" | "neutral";

const map: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: "#efe9e2", fg: ui.color.primary },
  bronze: { bg: "#f2e8da", fg: ui.color.bronzeHover },
  success: { bg: "#dceae2", fg: ui.color.success },
  danger: { bg: "#f4ddda", fg: ui.color.danger },
  neutral: { bg: "#eee9e0", fg: ui.color.muted },
};

/** وسمٌ حبّيّ (للمراتب/الحالات) — المرحلة ١. */
export function Badge({ tone = "neutral", style, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  const c = map[tone];
  return (
    <span
      {...props}
      style={{
        display: "inline-block",
        fontFamily: ui.font, fontSize: ui.text.xs, fontWeight: 600,
        color: c.fg, background: c.bg,
        borderRadius: ui.radius.full,
        padding: `${sp(1)} ${sp(2.5)}`,
        ...style,
      }}
    />
  );
}
