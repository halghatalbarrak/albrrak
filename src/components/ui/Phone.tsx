"use client";

import { ui } from "./tokens";

/** يعرض رقم هاتف بدون اقتطاع الاتجاه العربي. */
export function Phone({ value, style }: { value: string; style?: React.CSSProperties }) {
  return (
    <span style={{ direction: "ltr", unicodeBidi: "isolate", color: ui.color.muted, ...style }}>
      {value}
    </span>
  );
}
