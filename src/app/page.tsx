"use client";
/* eslint-disable @next/next/no-img-element -- شعارٌ من public/ بأبعادٍ ثابتة؛ لا يحتاج next/image. */

import { useEffect, useState } from "react";
import Link from "next/link";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button, Card, PageShell, ui, sp } from "@/components/ui";

// الصفحة الرئيسة: لوحةٌ حسب دور الداخل بهوية المنصّة. المنطق (جلب /api/me والأدوار) كما هو.

interface Me { name: string; roles: string[] }
interface Item { href: string; label: string; desc: string }

const BRAND = "حلقات الشيخ محمد البراك";

// أقسام اللوحة — نفس بوّابات الأدوار السابقة، معروضةً بطاقاتٍ مجمّعة.
const LEARN: Item[] = [
  { href: "/me", label: "صفحتي", desc: "تقدّمي ومحفوظي" },
  { href: "/programs/civil-base", label: "السلّم البياني", desc: "القاعدة المدنية" },
  { href: "/programs/maraqi", label: "مراقي", desc: "مراحل الحفظ وأحزابه" },
];
const MANAGE: Item[] = [
  { href: "/admin/applications", label: "الطلبات", desc: "قبول المتقدّمين" },
  { href: "/admin/students", label: "الطلاب", desc: "إدارة الطلاب" },
  { href: "/admin/circles", label: "الحلقات", desc: "الحلقات ومعلّموها" },
  { href: "/admin/enrollment", label: "الإسناد", desc: "إسناد الطلاب للحلقات" },
  { href: "/admin/approvals", label: "الاعتمادات", desc: "الانتقال والتخرّج" },
  { href: "/admin/lists", label: "القوائم", desc: "قوائم وإعدادات" },
];
const OPERATE: Item[] = [
  { href: "/admin/attendance", label: "الحضور", desc: "تسجيل حضور الحلقة" },
  { href: "/admin/session", label: "الجلسة اليومية", desc: "الحفظ والترسيخ والمراجعة" },
  { href: "/admin/arifs", label: "العرفاء", desc: "تعيين عرفاء الحلقة" },
];
const HARVEST: Item[] = [{ href: "/admin/hasad", label: "الحصاد", desc: "اختبار الأحزاب والمراتب" }];

function Section({ title, items }: { title: string; items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section style={{ marginTop: sp(6) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 600, color: ui.color.primary, margin: `0 0 ${sp(3)}` }}>{title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: sp(3) }}>
        {items.map((it) => (
          <Link key={it.href} href={it.href} style={{ textDecoration: "none" }}>
            <Card style={{ padding: sp(4), height: "100%", transition: "border-color .15s, box-shadow .15s" }}>
              <div style={{ fontSize: ui.text.lg, fontWeight: 600, color: ui.color.text }}>{it.label}</div>
              <div style={{ fontSize: ui.text.xs, color: ui.color.muted, marginTop: sp(1) }}>{it.desc}</div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const { data: { session } } = await supabaseBrowser().auth.getSession();
        if (session) {
          const res = await fetch("/api/me", { headers: { authorization: `Bearer ${session.access_token}` } });
          if (res.ok) setMe((await res.json()) as Me);
        }
      } catch {
        /* اللوحة إضافةٌ لا تُعطّل الصفحة إن فشلت */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const roles = me?.roles ?? [];
  const isManager = roles.includes("SUPER_ADMIN") || roles.includes("CIRCLE_MANAGER");
  const canRecordAttendance = isManager || roles.includes("TEACHER");
  const canRecite = isManager || roles.includes("RECITER");

  // غير مسجَّل الدخول: واجهةٌ ترحيبيّة (لا قائمة دور).
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

  // مسجَّل الدخول: اللوحة بهوية المنصّة.
  return (
    <PageShell roles={roles} userName={me.name}>
      <h1 style={{ fontSize: ui.text.xxl, fontWeight: 700, margin: 0 }}>مرحبًا، {me.name}</h1>
      <p style={{ fontSize: ui.text.base, color: ui.color.muted, margin: `${sp(1)} 0 0` }}>لوحتك — كلٌّ بحسب دوره.</p>

      <Section title="التعلّم" items={LEARN} />
      {isManager && <Section title="الإدارة" items={MANAGE} />}
      {canRecordAttendance && <Section title="التشغيل" items={OPERATE} />}
      {canRecite && <Section title="الحصاد" items={HARVEST} />}
    </PageShell>
  );
}
