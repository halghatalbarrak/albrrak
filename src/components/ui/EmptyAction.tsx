"use client";

import { ui, sp } from "./tokens";

interface EmptyActionProps {
  message: string;
  actionLabel: string;
  href: string;
  returnTo?: string;
}

export function EmptyAction({ message, actionLabel, href, returnTo }: EmptyActionProps) {
  const url = returnTo ? `${href}?returnTo=${encodeURIComponent(returnTo)}` : href;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: sp(1.5), fontSize: ui.text.xs, color: ui.color.muted }}>
      {message}
      <a href={url} style={{ color: ui.color.primary, textDecoration: "none", fontWeight: 600 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none"; }}>
        {actionLabel}
      </a>
    </span>
  );
}
