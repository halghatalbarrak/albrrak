"use client";

import { useEffect, type ReactNode } from "react";

import { ui, sp } from "./tokens";

/**
 * نافذةٌ منبثقةٌ بهوية المنصّة (React، لا حوارات المتصفّح الأصليّة).
 * تُغلق بالمفتاح Esc أو بالنقر على الخلفيّة. عرضٌ فقط — المنطق للمستدعي.
 */
export function Modal({ open, onClose, title, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      dir="rtl"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(43,38,32,.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: sp(4),
        fontFamily: ui.font,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: ui.color.surface, borderRadius: ui.radius.lg, boxShadow: ui.shadowCard,
          width: "100%", maxWidth: 480, maxHeight: "90dvh", overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: `${sp(4)} ${sp(5)}`, borderBottom: `1px solid ${ui.color.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3) }}>
          <h2 style={{ margin: 0, fontSize: ui.text.lg, fontWeight: 700, color: ui.color.text }}>{title}</h2>
          <button onClick={onClose} aria-label="إغلاق" style={{ border: "none", background: "transparent", fontSize: ui.text.xl, lineHeight: 1, color: ui.color.muted, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: sp(5), overflowY: "auto" }}>{children}</div>
        {footer && <div style={{ padding: `${sp(3)} ${sp(5)}`, borderTop: `1px solid ${ui.color.border}`, display: "flex", gap: sp(2), justifyContent: "flex-start" }}>{footer}</div>}
      </div>
    </div>
  );
}
