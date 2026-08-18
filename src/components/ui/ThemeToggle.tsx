"use client";

import { useEffect, useState } from "react";

import { ui, sp } from "./tokens";

// تبديل الوضع الفاتح/الداكن (الفكرة ٦): يحترمه النظام إن اختاره المستعمل (يُحفظ صراحةً).
// الافتراض (بلا اختيار) تلقائيٌّ بحسب الوقت — يُضبط في سكربت layout قبل الرسم.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.dataset.theme === "dark"); }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try { localStorage.setItem("albrrak.theme", next ? "dark" : "light"); } catch { /* تجاهل */ }
  };

  return (
    <button onClick={toggle} aria-label={dark ? "الوضع الفاتح" : "الوضع الداكن"} title={dark ? "الوضع الفاتح" : "الوضع الداكن"}
      style={{ border: `1px solid ${ui.color.border}`, background: ui.color.surface, borderRadius: ui.radius.md, padding: `${sp(1.5)} ${sp(2.5)}`, cursor: "pointer", color: ui.color.muted, fontSize: ui.text.base, lineHeight: 1 }}>
      {dark ? "☀" : "☾"}
    </button>
  );
}
