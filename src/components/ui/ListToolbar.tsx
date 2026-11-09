"use client";

import { useEffect, useRef, useState } from "react";
import { ui, sp } from "./tokens";

interface ListToolbarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
}

/** شريط بحث + فلاتر موحَّد للقوائم الإدارية. الـdebounce 300ms داخلي. */
export function ListToolbar({ value, onChange, placeholder, children }: ListToolbarProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocal(value); }, [value]);

  function handleChange(v: string) {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), 300);
  }

  return (
    <div style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap", marginBottom: sp(4) }}>
      <input
        type="search"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder ?? "ابحث…"}
        style={{
          flex: "1 1 180px",
          minWidth: 0,
          padding: `${sp(2)} ${sp(3)}`,
          border: `1px solid ${ui.color.border}`,
          borderRadius: ui.radius.md,
          background: ui.color.surface,
          color: ui.color.text,
          fontSize: ui.text.xs,
          fontFamily: ui.font,
          direction: "rtl",
          outline: "none",
        }}
      />
      {children}
    </div>
  );
}
