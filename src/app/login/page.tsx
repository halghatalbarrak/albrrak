"use client";
/* eslint-disable @next/next/no-img-element -- شعارٌ من public/ بأبعادٍ ثابتة؛ لا يحتاج next/image. */

import { useState } from "react";
import Link from "next/link";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { canonicalEmail, legacyEmail } from "@/lib/phone";
import { Button, Card, Field, inputStyle, NabawiBackdrop, ui, sp } from "@/components/ui";
import { tLogin as t } from "@/i18n/ar/login";

const BRAND = t("brand");

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
      // تُجرَّب الصيغة الموحّدة أوّلاً (الحسابات الجديدة)، ثمّ الخام (القديمة) — فتقبل الصيغتين.
      const sb = supabaseBrowser();
      const emails = [...new Set([canonicalEmail(phone), legacyEmail(phone)])];
      let ok = false;
      for (const email of emails) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (!error) { ok = true; break; }
      }
      if (ok) {
        window.location.href = "/me";
      } else {
        setErr(t("errSignIn"));
      }
    } catch {
      setErr(t("errConnect"));
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
        <h1 style={{ fontSize: ui.text.xl, fontWeight: 700, marginTop: 0, marginBottom: sp(4) }}>{t("title")}</h1>
        <form onSubmit={onSubmit}>
          <Field label={t("fieldPhone")}>
            <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required />
          </Field>
          <Field label={t("fieldPassword")}>
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {err && <p style={{ color: ui.color.danger, fontSize: ui.text.xs }}>{err}</p>}
          <Button type="submit" disabled={busy} style={{ width: "100%", marginTop: sp(2) }}>
            {busy ? t("submitting") : t("submit")}
          </Button>
        </form>
      </Card>
      <Link href="/apply" style={{ position: "relative", zIndex: 1, fontSize: ui.text.xs, color: ui.color.muted }}>{t("applyLink")}</Link>
    </main>
  );
}
