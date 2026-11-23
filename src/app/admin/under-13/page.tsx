"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { AppShell, Badge, Card, Skeleton, sp, ui } from "@/components/ui";
import { useMe } from "@/lib/useMe";

interface Under13Row {
  id: string;
  name: string;
  birthDate: string | null;
  age: number | null;
  roles: string[];
  isActive: boolean;
  hasAuthAccount: boolean;
}

interface PageData {
  under13: Under13Row[];
  noBirthDate: Under13Row[];
}

const CRUMBS = [
  { label: "الرئيسة", href: "/" },
  { label: "الإدارة", href: "/admin" },
  { label: "دون الثالثة عشرة" },
];

function RowCard({ r }: { r: Under13Row }) {
  return (
    <Card data-testid="under13-row">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: sp(2) }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: ui.text.base }}>{r.name}</span>
          <span style={{ marginInlineStart: sp(2), color: ui.color.muted, fontSize: ui.text.xs }}>
            {r.birthDate ? new Date(r.birthDate).toLocaleDateString("ar-SA") : "تاريخ ميلاد غير مسجّل"}
            {r.age !== null ? ` (${r.age} سنوات)` : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: sp(1), flexWrap: "wrap" }}>
          {r.roles.map((role) => (
            <Badge key={role} tone="neutral">{role}</Badge>
          ))}
          <Badge tone={r.isActive ? "danger" : "neutral"}>
            {r.isActive ? "نشط (محجوب بالعمر)" : "معطَّل"}
          </Badge>
        </div>
      </div>
    </Card>
  );
}

export default function Under13Page() {
  const { me } = useMe();
  const [data, setData] = useState<PageData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabaseBrowser().auth.getSession();
      if (!session) return;
      const res = await fetch("/api/admin/under-13", {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { setErr("تعذّر التحميل."); return; }
      setData(await res.json() as PageData);
    })();
  }, []);

  if (!me) return null;

  return (
    <AppShell roles={me.roles} userName={me.name ?? ""} activeHref="/admin" title="دون ١٣ — حسابات محجوبة" crumbs={CRUMBS}>
      <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(3) }}>
        هذه الحسابات مُنشأةٌ قبل تطبيق م٤، ومحجوبٌ دخولها تلقائيًّا. لا حذف — الكشف فقط.
        تاريخ الميلاد الفارغ لا يمنع الدخول — يظهر هنا للاستكمال.
      </p>
      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {data === null ? <Skeleton /> : (
        <>
          <h3 style={{ fontSize: ui.text.xs, fontWeight: 700, marginBottom: sp(2), marginTop: 0 }}>
            دون الثالثة عشرة ({data.under13.length})
          </h3>
          {data.under13.length === 0 ? (
            <Card><p style={{ color: ui.color.muted, textAlign: "center", margin: 0 }}>لا حسابات دون ١٣ سنة.</p></Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: sp(2), marginBottom: sp(4) }}>
              {data.under13.map((r) => <RowCard key={r.id} r={r} />)}
            </div>
          )}

          <h3 style={{ fontSize: ui.text.xs, fontWeight: 700, marginBottom: sp(2), marginTop: sp(4) }}>
            تاريخ ميلاد غير مسجّل ({data.noBirthDate.length})
          </h3>
          {data.noBirthDate.length === 0 ? (
            <Card><p style={{ color: ui.color.muted, textAlign: "center", margin: 0 }}>لا حسابات بتاريخ ميلاد مفقود.</p></Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
              {data.noBirthDate.map((r) => <RowCard key={r.id} r={r} />)}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
