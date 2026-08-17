"use client";
/* eslint-disable @next/next/no-img-element -- شعارٌ من public/ بأبعادٍ ثابتة؛ لا يحتاج next/image. */

import { useEffect, useState } from "react";
import Link from "next/link";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { AppShell, Button, Card, Stat, Skeleton, ui, sp } from "@/components/ui";

// الصفحة الرئيسة: للزائر واجهةٌ ترحيبيّة، وللداخل ملخّصٌ حسب دوره داخل اللوحة (الشريط الجانبيّ).
// المنطق (جلب الجلسة و/api/me و/api/summary) بلا مساسٍ بأي قاعدة عمل — قراءةٌ فقط.

const BRAND = "حلقات الشيخ محمد البراك";

type Tone = "primary" | "bronze" | "success" | "danger";
interface Me { name: string; roles: string[] }
interface Card { key: string; label: string; value: string; hint?: string; tone: Tone; href: string }
interface NextStep { title: string; cta: string; href: string; tone: "primary" | "bronze" | "success" }
interface Summary { scope: string; greeting: string; nextStep: NextStep; cards: Card[] }

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const { data: { session } } = await supabaseBrowser().auth.getSession();
        if (session) {
          const auth = { authorization: `Bearer ${session.access_token}` };
          const meRes = await fetch("/api/me", { headers: auth });
          if (meRes.ok) {
            setMe((await meRes.json()) as Me);
            const sumRes = await fetch("/api/summary", { headers: auth });
            if (sumRes.ok) setSummary((await sumRes.json()) as Summary);
          }
        }
      } catch {
        /* اللوحة إضافةٌ لا تُعطّل الصفحة إن فشلت */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // ── الزائر: واجهةٌ ترحيبيّة (كما هي، بلا تغيير) ──
  if (!me) {
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(4), padding: sp(6), textAlign: "center" }}>
        <img src="/png/logo.jpeg" alt={BRAND} style={{ height: 96, width: "auto", borderRadius: ui.radius.lg }} />
        <h1 style={{ fontSize: ui.text.xxl, fontWeight: 700, margin: 0 }}>منصّة {BRAND}</h1>
        <p style={{ fontSize: ui.text.base, color: ui.color.muted, margin: 0, maxWidth: 480 }}>منصّةٌ لإدارة حلقات التحفيظ — التقديم، والحضور، والحفظ، والحصاد، والشهادات.</p>
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/apply"><Button variant="primary">تقديم طلب</Button></Link>
          <Link href="/login"><Button variant="ghost">دخول</Button></Link>
        </div>
        {ready && <p style={{ fontSize: ui.text.xs, color: ui.color.muted, opacity: 0.8 }}>سجّل الدخول لعرض لوحتك.</p>}
      </main>
    );
  }

  // ── الداخل: اللوحة بالشريط الجانبيّ + الملخّص ──
  return (
    <AppShell roles={me.roles} userName={me.name} activeHref="/" title={`مرحبًا، ${me.name}`}
      crumbs={[{ label: "الرئيسة" }]}>
      {!summary ? (
        // لا شاشة فارغة: نبضةُ تحميلٍ ريثما يصل الملخّص.
        <div style={{ display: "flex", flexDirection: "column", gap: sp(4) }}>
          <Skeleton height={72} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: sp(4) }}>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={110} />)}
          </div>
        </div>
      ) : (
        <>
          {/* الخطوة التالية — يقترحها النظام، لا مجرّد أرقام */}
          <NextStepBanner step={summary.nextStep} />

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: sp(4), marginTop: sp(6) }}>
            {summary.cards.map((c) => (
              <Link key={c.key} href={c.href} style={{ textDecoration: "none" }}>
                <Stat label={c.label} value={c.value} hint={c.hint} tone={c.tone} />
              </Link>
            ))}
          </section>
        </>
      )}
    </AppShell>
  );
}

// شريط «الخطوة التالية» — دعوةٌ واحدةٌ للإجراء (لا قائمة اختياراتٍ يحتار فيها).
function NextStepBanner({ step }: { step: NextStep }) {
  const accent = { primary: ui.color.primary, bronze: ui.color.bronze, success: ui.color.success }[step.tone];
  return (
    <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(4), flexWrap: "wrap", borderInlineStart: `4px solid ${accent}` }}>
      <div>
        <div style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.muted, marginBottom: 2 }}>الخطوة التالية</div>
        <div style={{ fontSize: ui.text.lg, fontWeight: 700, color: ui.color.text }}>{step.title}</div>
      </div>
      <Link href={step.href}><Button variant={step.tone === "bronze" ? "bronze" : "primary"}>{step.cta}</Button></Link>
    </Card>
  );
}
