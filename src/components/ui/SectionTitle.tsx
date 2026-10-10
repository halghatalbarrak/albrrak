import type { ReactNode, CSSProperties } from "react";

import { ui, sp } from "./tokens";

// عنوان قسم بهوية البراك (م١): نجمةٌ ذهبيّة صغيرة + العنوان + فاصلٌ ذهبيٌّ متلاشٍ. زخرفيٌّ — عرضٌ فقط.

/** نجمةٌ رباعيّةٌ ذهبيّة صغيرة (زخرفة). */
export function BrandStar({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 1 L14 10 L23 12 L14 14 L12 23 L10 14 L1 12 L10 10 Z" fill={ui.color.goldLine} />
    </svg>
  );
}

export function SectionTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: sp(2), margin: `${sp(5)} 0 ${sp(3)}`, ...style }}>
      <BrandStar />
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, color: ui.color.text, margin: 0, whiteSpace: "nowrap" }}>{children}</h2>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${ui.color.goldLine}, transparent)` }} />
    </div>
  );
}
