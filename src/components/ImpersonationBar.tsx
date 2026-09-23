"use client";

import { useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

// ═══════════════ شريط الانتحال الدائم (الضمان ٣) ═══════════════
//
// شريطٌ ثابتٌ في أعلى **كلّ الشاشات** أثناء الانتحال — واضحٌ لا يُفوَّت — مع زرّ العودة
// بضغطةٍ (الضمان ٤). يُركَّب مرّةً في التخطيط الجذر فيظهر في كلّ مكان. عرضٌ فقط؛
// الحقيقة في الخادم (كوكي الانتحال + /api/me). يمسحه زرّ العودة عبر /api/impersonate/stop.

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export function ImpersonationBar() {
  const [name, setName] = useState<string | null>(null); // اسم المنتحَل، أو null (لا انتحال)
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const t = await token();
        if (!t) return;
        const res = await fetch("/api/me", { headers: { authorization: `Bearer ${t}` } });
        if (!res.ok) return;
        const me = (await res.json()) as { name: string; impersonating?: boolean };
        if (me.impersonating) setName(me.name);
      } catch { /* الشريط لا يُعطّل الصفحة */ }
    })();
  }, []);

  async function stop() {
    setBusy(true);
    try {
      const t = await token();
      await fetch("/api/impersonate/stop", { method: "POST", headers: t ? { authorization: `Bearer ${t}` } : {} });
    } finally {
      window.location.href = "/"; // إعادةٌ كاملةٌ لحساب المدير التقنيّ
    }
  }

  if (!name) return null;

  return (
    <>
      <div style={{
        position: "fixed", insetInlineStart: 0, insetInlineEnd: 0, top: 0, zIndex: 9999,
        background: "#7a2e2e", color: "#fff", padding: "8px 16px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap",
        fontFamily: "inherit", fontSize: 14, fontWeight: 600, boxShadow: "0 2px 8px rgba(0,0,0,.25)",
      }}>
        <span>👁️ أنت تتصفّح كـ«{name}» — الأفعال تُنفَّذ باسمه (موثّقةٌ باسمك).</span>
        <button onClick={() => void stop()} disabled={busy}
          style={{ background: "#fff", color: "#7a2e2e", border: "none", borderRadius: 6, padding: "4px 12px", fontWeight: 700, cursor: "pointer" }}>
          {busy ? "…" : "العودة لحسابك"}
        </button>
      </div>
      {/* فاصلٌ بارتفاع الشريط لئلّا يحجب المحتوى */}
      <div aria-hidden style={{ height: 40 }} />
    </>
  );
}
