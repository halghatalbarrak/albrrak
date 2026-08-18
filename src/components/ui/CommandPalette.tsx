"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { ui, sp } from "./tokens";

interface Hit { label: string; sub?: string; href: string }
interface Results { students: Hit[]; circles: Hit[]; mushaf: Hit[] }

// البحث الموحّد (الفكرة ٨): يُفتح بـCtrl/⌘+K أو بحدث «albrrak:search». طلاب/حلقات/مصحف،
// وينقل مباشرةً للصفحة المقصودة. أداةُ كادرٍ (تُعرض حسب الدور في AppShell).
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setOpen((o) => !o); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("albrrak:search", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("albrrak:search", onOpen); };
  }, []);

  useEffect(() => {
    if (open) { const t = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(t); }
    setQ(""); setRes(null); setActive(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = setTimeout(async () => {
      if (q.trim().length < 2) { setRes(null); return; }
      try {
        const { data: { session } } = await supabaseBrowser().auth.getSession();
        if (!session) return;
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { headers: { authorization: `Bearer ${session.access_token}` } });
        if (r.ok) { setRes((await r.json()) as Results); setActive(0); }
      } catch { /* تجاهل */ }
    }, 200);
    return () => clearTimeout(h);
  }, [q, open]);

  const flat: Hit[] = res ? [...res.students, ...res.circles, ...res.mushaf] : [];
  const go = useCallback((h: Hit) => { setOpen(false); router.push(h.href); }, [router]);

  if (!open) return null;

  const groups: { title: string; items: Hit[] }[] = res ? [
    { title: "الطلاب", items: res.students },
    { title: "الحلقات", items: res.circles },
    { title: "المصحف", items: res.mushaf },
  ].filter((g) => g.items.length > 0) : [];

  let idx = -1;
  return (
    <div dir="rtl" onClick={() => setOpen(false)}
      style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(43,38,32,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh", fontFamily: ui.font }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: ui.color.surface, borderRadius: ui.radius.lg, boxShadow: ui.shadowCard, width: "100%", maxWidth: 560, maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <input
          ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter" && flat[active]) { e.preventDefault(); go(flat[active]); }
          }}
          placeholder="ابحث: اسم طالب · حلقة · «حزب ٥» · «١١٢:١»…"
          style={{ border: "none", borderBottom: `1px solid ${ui.color.border}`, padding: `${sp(4)} ${sp(5)}`, fontSize: ui.text.lg, fontFamily: ui.font, color: ui.color.text, outline: "none" }}
        />
        <div style={{ overflowY: "auto" }}>
          {q.trim().length >= 2 && flat.length === 0 && <p style={{ color: ui.color.muted, padding: sp(5), margin: 0 }}>لا نتائج.</p>}
          {q.trim().length < 2 && <p style={{ color: ui.color.muted, padding: sp(5), margin: 0, fontSize: ui.text.xs }}>اكتب حرفين فأكثر. جرّب: اسم طالب، أو «حزب ٦٠»، أو «١١٤:١».</p>}
          {groups.map((g) => (
            <div key={g.title}>
              <div style={{ fontSize: ui.text.xs, fontWeight: 700, color: ui.color.muted, padding: `${sp(2)} ${sp(5)} 0` }}>{g.title}</div>
              {g.items.map((h) => {
                idx += 1;
                const on = idx === active;
                return (
                  <div key={h.href} onMouseEnter={(() => { const my = flat.indexOf(h); return () => setActive(my); })()} onClick={() => go(h)}
                    style={{ padding: `${sp(2.5)} ${sp(5)}`, cursor: "pointer", background: on ? "#efe9e2" : "transparent", display: "flex", justifyContent: "space-between", gap: sp(3) }}>
                    <span style={{ fontWeight: 600 }}>{h.label}</span>
                    {h.sub && <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{h.sub}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
