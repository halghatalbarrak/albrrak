"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/useMe";
import { AppShell, Button, Card, Badge, Stat, ui, sp } from "@/components/ui";

// صفحة معاينة الثيمات — للمدير فقط. تعرض الثيمَين (البنفسجيّ/البنّيّ) في وضعَيهما (فاتح/داكن)
// جنباً إلى جنب بلا أيّ تأثير على الإنتاج. المدير يختار ثمّ يبلّغ الفريق التقنيّ للتفعيل.

const THEMES: { key: string; label: string; dark: boolean }[] = [
  { key: "",        label: "بنفسجيّ — فاتح",  dark: false },
  { key: "dark",    label: "بنفسجيّ — داكن",  dark: true  },
  { key: "brown",   label: "بنّيّ — فاتح",   dark: false },
  { key: "brown-dark", label: "بنّيّ — داكن", dark: true  },
];

export default function DesignPreviewPage() {
  const { me, loading } = useMe();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || loading) return null;
  if (!me?.roles.includes("ADMIN")) {
    return (
      <main dir="rtl" style={{ padding: sp(8), fontFamily: ui.font, color: ui.color.danger }}>
        هذه الصفحة للمدير فقط.
      </main>
    );
  }

  return (
    <AppShell roles={me.roles} muddakirStaff={me.muddakirStaff ?? []} userName={me.name}
      activeHref="/admin/design-preview"
      title="معاينة الثيمات"
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة", href: "/admin" }, { label: "معاينة الثيمات" }]}>
      <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(4) }}>
        الثيمان متاحان للاختيار — المظهر الحاليّ في الإنتاج لا يتغيّر حتى يُبلَّغ الفريق التقنيّ.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: sp(4) }}>
        {THEMES.map((t) => (
          <ThemePanel key={t.key} themeKey={t.key} label={t.label} />
        ))}
      </div>
    </AppShell>
  );
}

function ThemePanel({ themeKey, label }: { themeKey: string; label: string }) {
  return (
    <div
      data-theme={themeKey || undefined}
      style={{
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: ui.radius.lg,
        padding: sp(4),
        fontFamily: ui.font,
        direction: "rtl",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* اسم الثيم */}
      <h2 style={{ color: "var(--color-text)", fontSize: ui.text.lg, fontWeight: 700, margin: `0 0 ${sp(3)}` }}>
        {label}
      </h2>

      {/* لوحة الألوان */}
      <div style={{ display: "flex", gap: sp(1), flexWrap: "wrap", marginBottom: sp(3) }}>
        <Swatch bg="var(--color-primary)" label="primary" />
        <Swatch bg="var(--color-bronze)" label="bronze" />
        <Swatch bg="var(--color-bg)" label="bg" bordered />
        <Swatch bg="var(--color-surface)" label="surface" bordered />
        <Swatch bg="var(--color-sidebar)" label="sidebar" />
        <Swatch bg="var(--color-success)" label="success" />
        <Swatch bg="var(--color-danger)" label="danger" />
        <Swatch bg="var(--color-soft)" label="soft" bordered />
      </div>

      {/* أزرار */}
      <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(3) }}>
        <Button variant="primary" size="sm">رئيسيّ</Button>
        <Button variant="bronze" size="sm">برونزيّ</Button>
        <Button variant="ghost" size="sm">ثانويّ</Button>
        <Button variant="danger" size="sm">حذف</Button>
      </div>

      {/* بطاقة */}
      <Card style={{ padding: sp(3), marginBottom: sp(3) }}>
        <p style={{ color: "var(--color-text)", margin: 0, fontSize: ui.text.xs }}>
          نصٌّ داخل بطاقة — يستعمل <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>لون الهوية</span>
          {" "}و<span style={{ color: "var(--color-muted)" }}>النصّ الخافت</span>.
        </p>
      </Card>

      {/* إحصاء */}
      <div style={{ display: "flex", gap: sp(2), marginBottom: sp(3) }}>
        <Stat label="الطلّاب" value="١٢٤" />
        <Stat label="الحلقات" value="٨" />
        <Stat label="النقاط" value="٣٦٠٠" />
      </div>

      {/* شارات */}
      <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(3) }}>
        <Badge tone="success">نجاح</Badge>
        <Badge tone="danger">خطر</Badge>
        <Badge tone="primary">مميَّز</Badge>
        <Badge tone="bronze">برونز</Badge>
      </div>

      {/* مربّع تحذير */}
      <div style={{ background: "var(--color-warn-bg)", border: `1px solid var(--color-warning)`, borderRadius: ui.radius.md, padding: sp(2), marginBottom: sp(2), fontSize: ui.text.xs, color: "var(--color-warning)" }}>
        تنبيه: هذا مثالٌ لمربّع التحذير.
      </div>

      {/* مربّع نجاح */}
      <div style={{ background: "var(--color-ok-bg)", border: `1px solid var(--color-success)`, borderRadius: ui.radius.md, padding: sp(2), fontSize: ui.text.xs, color: "var(--color-success)" }}>
        تمّت العمليّة بنجاح.
      </div>
    </div>
  );
}

function Swatch({ bg, label, bordered }: { bg: string; label: string; bordered?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div style={{ width: 28, height: 28, borderRadius: ui.radius.sm, background: bg,
        border: bordered ? "1px solid var(--color-border)" : "none",
        boxShadow: "var(--shadow-card)" }} />
      <span style={{ fontSize: 10, color: "var(--color-muted)", direction: "ltr" }}>{label}</span>
    </div>
  );
}
