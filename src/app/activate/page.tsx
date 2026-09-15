"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input, ui, sp } from "@/components/ui";

// مسار التفعيل العامّ — بلا تسجيل دخول. الرمز في ?token= هو الإثبات.
// يتحقّق من صلاحيّته، فيعرض حقلَي كلمة السرّ، وعند الحفظ يضبطها ويوجّه للدخول.

const centered: React.CSSProperties = {
  minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
  background: ui.color.bg, fontFamily: ui.font, color: ui.color.text, padding: sp(4),
};
const card: React.CSSProperties = {
  background: ui.color.surface, border: `1px solid ${ui.color.border}`,
  borderRadius: ui.radius.lg, padding: sp(6), width: "100%", maxWidth: 420,
};

export default function ActivatePage() {
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [msg, setMsg] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("ACTIVATE");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) { setPhase("invalid"); setMsg("لا رمز في الرابط."); return; }
    setToken(t);
    (async () => {
      const res = await fetch(`/api/activate?token=${encodeURIComponent(t)}`);
      if (res.ok) {
        const j = (await res.json()) as { purpose: string };
        setPurpose(j.purpose); setPhase("ready");
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase("invalid"); setMsg(j.error ?? "رابطٌ غير صالح.");
      }
    })();
  }, []);

  async function submit() {
    setErr(null);
    if (pw.length < 8) { setErr("كلمة السرّ ثمانية أحرفٍ فأكثر."); return; }
    if (pw !== pw2) { setErr("كلمتا السرّ غير متطابقتين."); return; }
    const res = await fetch("/api/activate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: pw }),
    });
    if (res.ok) { setPhase("done"); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر ضبط كلمة السرّ."); }
  }

  return (
    <main dir="rtl" style={centered}>
      <div style={card}>
        <h1 style={{ fontSize: ui.text.xl, fontWeight: 700, marginBottom: sp(4) }}>
          {purpose === "RESET" ? "إعادة تعيين كلمة السرّ" : "تفعيل الحساب"}
        </h1>

        {phase === "checking" && <p style={{ color: ui.color.muted }}>جارٍ التحقّق…</p>}

        {phase === "invalid" && <p style={{ color: ui.color.danger }}>{msg}</p>}

        {phase === "done" && (
          <>
            <p style={{ color: ui.color.success, marginBottom: sp(4) }}>تمّ ضبط كلمة السرّ. يمكنك الدخول الآن.</p>
            <a href="/login" style={{ textDecoration: "none" }}><Button>الذهاب للدخول</Button></a>
          </>
        )}

        {phase === "ready" && (
          <>
            <p style={{ color: ui.color.muted, marginBottom: sp(4) }}>اختر كلمة سرٍّ جديدة (ثمانية أحرفٍ فأكثر).</p>
            <Field label="كلمة السرّ"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="تأكيد كلمة السرّ"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            {err && <p style={{ color: ui.color.danger }}>{err}</p>}
            <Button onClick={() => void submit()} style={{ marginTop: sp(2) }}>حفظ والدخول</Button>
          </>
        )}
      </div>
    </main>
  );
}
