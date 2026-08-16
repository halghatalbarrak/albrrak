"use client";
/* eslint-disable @next/next/no-img-element -- شعارٌ من public/ بأبعادٍ ثابتة؛ لا يحتاج next/image. */

import { useState } from "react";
import Link from "next/link";

import { ui, sp } from "./tokens";
import { menuForRoles } from "./nav";

const BRAND = "حلقات الشيخ محمد البراك";

export interface HeaderProps {
  roles: string[];
  userName?: string;
  activeHref?: string;
  logoSrc?: string;
}

/** ترويسة المنصّة (المرحلة ١): شعار + قائمةٌ حسب الدور + اسم الداخل. عرضٌ فقط. */
export function Header({ roles, userName, activeHref, logoSrc = "/png/logo.jpeg" }: HeaderProps) {
  const [logoOk, setLogoOk] = useState(true);
  const items = menuForRoles(roles);
  return (
    <header style={{ background: ui.color.surface, borderBottom: `1px solid ${ui.color.border}`, fontFamily: ui.font }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: `${sp(2)} ${sp(4)}`, display: "flex", alignItems: "center", gap: sp(6) }}>
        <Link href="/" aria-label={BRAND} style={{ display: "flex", alignItems: "center", gap: sp(2), textDecoration: "none", color: ui.color.primary }}>
          {logoOk
            ? <img src={logoSrc} alt={BRAND} style={{ height: "clamp(30px, 6vw, 44px)", width: "auto", display: "block" }} onError={() => setLogoOk(false)} />
            : <span style={{ fontWeight: 700, fontSize: ui.text.lg, color: ui.color.primary }}>{BRAND}</span>}
        </Link>

        <nav style={{ display: "flex", gap: sp(1), flexWrap: "wrap", flex: 1 }}>
          {items.map((it) => {
            const active = activeHref === it.href;
            return (
              <Link key={it.href} href={it.href} style={{
                textDecoration: "none", fontSize: ui.text.xs, fontWeight: 600,
                color: active ? ui.color.primary : ui.color.muted,
                background: active ? "#efe9e2" : "transparent",
                padding: `${sp(1.5)} ${sp(3)}`, borderRadius: ui.radius.full,
              }}>{it.label}</Link>
            );
          })}
        </nav>

        {userName && <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{userName}</span>}
      </div>
    </header>
  );
}
