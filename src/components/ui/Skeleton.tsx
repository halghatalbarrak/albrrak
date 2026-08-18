import type { CSSProperties } from "react";

import { ui } from "./tokens";

/** كتلةُ تحميلٍ نابضة — بديلٌ مؤقّتٌ ريثما تصل البيانات. */
export function Skeleton({ width = "100%", height = 16, style }: { width?: number | string; height?: number | string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{
        display: "block", width, height,
        borderRadius: ui.radius.sm,
        background: `linear-gradient(90deg, ${ui.color.border} 25%, var(--color-soft) 50%, ${ui.color.border} 75%)`,
        backgroundSize: "200% 100%",
        animation: "albrrak-shimmer 1.2s ease-in-out infinite",
        ...style,
      }}
    />
  );
}
