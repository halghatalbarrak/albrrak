"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ui, sp } from "./tokens";

export interface TabItem { label: string; href: string }

/**
 * شريط تبويباتٍ فوق المسارات المتقاربة (تنقّلٌ فقط — لا تغيير منطق). كلّ تبويبٍ رابطٌ لمساره
 * القائم، والنشط يُعرف من المسار الحاليّ. يُعرَض أعلى محتوى الصفحة داخل AppShell.
 */
export function Tabs({ items }: { items: TabItem[] }) {
  const path = usePathname();
  return (
    <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: sp(1), borderBottom: `1px solid ${ui.color.border}`, marginBottom: sp(5) }}>
      {items.map((it) => {
        const active = path === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            role="tab"
            aria-selected={active}
            style={{
              padding: `${sp(2)} ${sp(3)}`, textDecoration: "none", whiteSpace: "nowrap",
              fontFamily: ui.font, fontSize: ui.text.base, fontWeight: active ? 700 : 600,
              color: active ? ui.color.primary : ui.color.muted,
              borderBottom: `2px solid ${active ? ui.color.primary : "transparent"}`, marginBottom: -1,
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
