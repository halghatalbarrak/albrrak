"use client";
/* eslint-disable @next/next/no-img-element -- شعارٌ من public/ بأبعادٍ ثابتة؛ لا يحتاج next/image. */

import { useState, type ReactNode } from "react";
import Link from "next/link";

import { ui, sp } from "./tokens";
import { navSections } from "./nav";
import { Skeleton } from "./Skeleton";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";

const BRAND = "حلقات الشيخ محمد البراك";
const STAFF_ROLES = ["TEACHER", "CIRCLE_MANAGER", "SUPER_ADMIN", "RECITER", "REGISTRAR"];

export interface Crumb { label: string; href?: string }

export interface AppShellProps {
  roles: string[];
  userName?: string;
  /** مسار الصفحة الحاليّة — لإبراز العنوان النشط وفتح قسمه. */
  activeHref?: string;
  /** عنوان الصفحة في صدر المحتوى. */
  title: string;
  /** مسار التنقّل الصغير (اختياريّ). */
  crumbs?: Crumb[];
  children: ReactNode;
}

/**
 * هيكل اللوحة (قرار محمد): شريطٌ جانبيٌّ على اليمين (الشعار أعلاه، أقسامٌ قابلةٌ
 * للطيّ محكومةٌ بالدور، القسم الحاليّ مفتوح، العنوان النشط برونزيّ)، والمحتوى
 * على اليسار بعنوانه ومساره. على الجوّال يُطوى الشريط ويُفتح بزرّ. عرضٌ فقط.
 */
export function AppShell({ roles, userName, activeHref, title, crumbs, children }: AppShellProps) {
  const sections = navSections(roles);
  const isStaff = roles.some((r) => STAFF_ROLES.includes(r));
  const [drawer, setDrawer] = useState(false); // درج الجوّال
  // القسم الذي فيه الصفحة الحاليّة يبدأ مفتوحاً؛ إن لم يُعرف فالأوّل.
  const activeKey = sections.find((s) => s.items.some((it) => it.href === activeHref))?.key ?? sections[0]?.key;
  // القسم النشط مفتوحٌ افتراضاً، وتوجيه المستخدم يتجاوز الافتراض. يتفاعل مع تأخّر
  // وصول الأدوار (useMe): حين تصل الأقسام يُفتح النشط دون الحاجة لإعادة تهيئة.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const isOpen = (key: string) => overrides[key] ?? key === activeKey;
  const toggle = (key: string) => setOverrides((p) => ({ ...p, [key]: !isOpen(key) }));

  const aside = (
    <aside className={`appshell-aside${drawer ? " open" : ""}`} style={{ background: ui.color.surface, borderInlineStart: `1px solid ${ui.color.border}` }}>
      <div style={{ padding: sp(4), borderBottom: `1px solid ${ui.color.border}`, display: "flex", alignItems: "center", gap: sp(2) }}>
        <Link href="/" aria-label={BRAND} onClick={() => setDrawer(false)} style={{ display: "flex", alignItems: "center", gap: sp(2), textDecoration: "none" }}>
          <img src="/png/logo.jpeg" alt={BRAND} style={{ height: 44, width: "auto", borderRadius: ui.radius.sm }} />
          <span style={{ fontWeight: 700, fontSize: ui.text.base, color: ui.color.primary, lineHeight: 1.2 }}>حلقات الشيخ<br />محمد البراك</span>
        </Link>
      </div>

      <nav style={{ padding: sp(2) }}>
        {/* الدور لم يصل بعد ⟵ هيكلٌ نابض، لا قائمةٌ مفترضة (إصلاح وميض شريط الطالب). */}
        {sections.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: sp(2), padding: sp(2) }}>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={28} />)}
          </div>
        )}
        {sections.map((s) => {
          const open = isOpen(s.key);
          return (
            <div key={s.key} style={{ marginBottom: sp(1) }}>
              <button
                onClick={() => toggle(s.key)}
                aria-expanded={open}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: `${sp(2.5)} ${sp(3)}`, borderRadius: ui.radius.md,
                  fontFamily: ui.font, fontSize: ui.text.xs, fontWeight: 700, color: ui.color.primary,
                }}
              >
                <span>{s.label}</span>
                <span style={{ color: ui.color.muted, fontSize: ui.text.xs, transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }}>▾</span>
              </button>
              {open && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: `${sp(1)} 0` }}>
                  {s.items.map((it) => {
                    const active = it.href === activeHref;
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        onClick={() => setDrawer(false)}
                        style={{
                          textDecoration: "none", fontSize: ui.text.base, fontWeight: active ? 700 : 600,
                          color: active ? "#fff" : ui.color.text,
                          background: active ? ui.color.bronze : "transparent",
                          padding: `${sp(2)} ${sp(3)}`, marginInlineStart: sp(2),
                          borderRadius: ui.radius.md,
                        }}
                      >
                        {it.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );

  return (
    <div dir="rtl" className="appshell" style={{ background: ui.color.bg, fontFamily: ui.font, color: ui.color.text }}>
      {aside}
      {drawer && <div className="appshell-backdrop open" onClick={() => setDrawer(false)} />}

      <main className="appshell-main">
        <div style={{ display: "flex", alignItems: "center", gap: sp(3), padding: `${sp(3)} ${sp(6)}`, borderBottom: `1px solid ${ui.color.border}`, background: ui.color.surface }}>
          <button
            className="appshell-menubtn"
            onClick={() => setDrawer(true)}
            aria-label="فتح القائمة"
            style={{ border: `1px solid ${ui.color.border}`, background: ui.color.surface, borderRadius: ui.radius.md, padding: `${sp(1.5)} ${sp(2.5)}`, cursor: "pointer", fontSize: ui.text.lg, lineHeight: 1, color: ui.color.primary }}
          >
            ☰
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            {crumbs && crumbs.length > 0 && (
              <nav style={{ fontSize: ui.text.xs, color: ui.color.muted, marginBottom: 2 }}>
                {crumbs.map((c, i) => (
                  <span key={i}>
                    {i > 0 && <span style={{ margin: `0 ${sp(1)}` }}>›</span>}
                    {c.href ? <Link href={c.href} style={{ color: ui.color.muted, textDecoration: "none" }}>{c.label}</Link> : c.label}
                  </span>
                ))}
              </nav>
            )}
            <h1 style={{ margin: 0, fontSize: ui.text.xl, fontWeight: 700, color: ui.color.text }}>{title}</h1>
          </div>
          {isStaff && (
            <button
              onClick={() => window.dispatchEvent(new Event("albrrak:search"))}
              aria-label="بحث"
              style={{ display: "flex", alignItems: "center", gap: sp(2), border: `1px solid ${ui.color.border}`, background: ui.color.surface, borderRadius: ui.radius.md, padding: `${sp(1.5)} ${sp(3)}`, cursor: "pointer", color: ui.color.muted, fontFamily: ui.font, fontSize: ui.text.xs, whiteSpace: "nowrap" }}
            >
              بحث <kbd style={{ border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.sm, padding: "0 4px", fontSize: 12 }}>Ctrl K</kbd>
            </button>
          )}
          <ThemeToggle />
          {userName && <span style={{ fontSize: ui.text.xs, color: ui.color.muted, whiteSpace: "nowrap" }}>{userName}</span>}
        </div>

        <div style={{ padding: sp(6), maxWidth: 1080 }}>{children}</div>
      </main>
      {isStaff && <CommandPalette />}
    </div>
  );
}
