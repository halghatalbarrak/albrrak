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

/**
 * لمسةٌ نبويّة لصفحة الدخول وحدها (لا AppShell، لا صفحة أخرى): نجمةٌ ثمانيّةٌ هندسيّة SVG
 * خالصة مستوحاةٌ من سقف المسجد النبويّ — شبكةٌ متكرّرةٌ بالذهبيّ (--gold-line) مع ميداليةٍ
 * مركزيّةٍ قلبُها فيروزيّ (--color-teal). شفافيّةٌ منخفضةٌ فلا تشوّش القراءة. زخرفةٌ بحتة
 * (aria-hidden)، بلا حركة (فتحترم prefers-reduced-motion تلقائيًّا)، وتتلوّن بالوضعين.
 */
function NabawiBackdrop() {
  // بلاطةٌ ٨٠×٨٠: مربّعٌ + مربّعٌ مُدارٌ ٤٥° = نجمةٌ ثمانيّة، تتكرّر عبر الخلفيّة كلّها.
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0, color: "var(--gold-line)" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.1 }} preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="nabawiStar" width="80" height="80" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="20" y="20" width="40" height="40" />
              <polygon points="40,10 70,40 40,70 10,40" />
              <circle cx="40" cy="40" r="6" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#nabawiStar)" />
      </svg>

      {/* ميداليةٌ مركزيّة: نجمةٌ ثمانيّةٌ أكبر (توسيعٌ لفكرة icon.svg) بقلبٍ فيروزيّ خفيف. */}
      <svg viewBox="0 0 240 240" width="min(80vw, 520px)" height="min(80vw, 520px)"
        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: 0.12 }}>
        <g fill="none" stroke="var(--gold-line)" strokeWidth="1.4">
          <circle cx="120" cy="120" r="110" />
          <rect x="45" y="45" width="150" height="150" />
          <rect x="45" y="45" width="150" height="150" transform="rotate(45 120 120)" />
          <rect x="70" y="70" width="100" height="100" />
          <rect x="70" y="70" width="100" height="100" transform="rotate(45 120 120)" />
          <circle cx="120" cy="120" r="34" />
        </g>
        {/* القلب الفيروزيّ الخفيف */}
        <circle cx="120" cy="120" r="34" fill="var(--color-teal)" opacity="0.14" />
        <circle cx="120" cy="120" r="12" fill="var(--color-teal)" opacity="0.22" />
      </svg>
    </div>
  );
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
    <main dir="rtl" style={{ background: "linear-gradient(160deg, var(--login-bg-from), var(--login-bg-to))", minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text,
      position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(4), padding: sp(4) }}>
      <NabawiBackdrop />
      {/* المحتوى فوق الطبقة الزخرفيّة */}
      <Link href="/" aria-label={BRAND} style={{ position: "relative", zIndex: 1 }}><img src="/png/logo.png" alt={BRAND} style={{ height: 140, width: "auto" }} /></Link>
      <Card style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 400,
        border: `1px solid ${ui.color.goldLine}`, boxShadow: `0 0 0 4px rgba(201,160,99,0.12), ${ui.shadowCard}` }}>
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
      <Link href="/apply" style={{ position: "relative", zIndex: 1, fontSize: ui.text.xs, color: ui.color.muted }}>ليس لديك حساب؟ تقديم طلب قيد</Link>
    </main>
  );
}
