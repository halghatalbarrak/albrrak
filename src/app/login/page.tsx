"use client";
/* eslint-disable @next/next/no-img-element -- شعارٌ من public/ بأبعادٍ ثابتة؛ لا يحتاج next/image. */

import { useState } from "react";
import Link from "next/link";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button, Card, Field, inputStyle, ui, sp } from "@/components/ui";

const BRAND = "حلقات الشيخ محمد البراك";

// البريد الاصطناعي — نفس نمط م١ (الجوال ← u<digits>@albrrak.app).
function syntheticEmail(phone: string): string {
  return `u${phone.replace(/\D/g, "")}@albrrak.app`;
}

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { error } = await supabaseBrowser().auth.signInWithPassword({
        email: syntheticEmail(phone),
        password,
      });
      if (error) {
        setErr("تعذّر الدخول — تحقّق من الجوال وكلمة السر.");
      } else {
        window.location.href = "/me";
      }
    } catch {
      setErr("تعذّر الاتصال بخادم الدخول.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(4), padding: sp(4) }}>
      <Link href="/" aria-label={BRAND}><img src="/png/logo.jpeg" alt={BRAND} style={{ height: 72, width: "auto", borderRadius: ui.radius.md }} /></Link>
      <Card style={{ width: "100%", maxWidth: 400 }}>
        <h1 style={{ fontSize: ui.text.xl, fontWeight: 700, marginTop: 0, marginBottom: sp(4) }}>تسجيل الدخول</h1>
        <form onSubmit={onSubmit}>
          <Field label="الجوال">
            <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required />
          </Field>
          <Field label="كلمة السر">
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {err && <p style={{ color: ui.color.danger, fontSize: ui.text.xs }}>{err}</p>}
          <Button type="submit" disabled={busy} style={{ width: "100%", marginTop: sp(2) }}>
            {busy ? "جارٍ الدخول…" : "دخول"}
          </Button>
        </form>
      </Card>
      <Link href="/apply" style={{ fontSize: ui.text.xs, color: ui.color.muted }}>ليس لديك حساب؟ تقديم طلب قيد</Link>
    </main>
  );
}
