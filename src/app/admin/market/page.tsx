"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import {
  AppShell, Button, Input, Field, Badge, Table, ui, sp, type Column,
} from "@/components/ui";

interface Item {
  id: string;
  nameAr: string;
  imageUrl: string | null;
  pricePoints: number;
  stock: number | null;
  active: boolean;
}

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const EMPTY = { id: "", nameAr: "", pricePoints: "", stock: "", imageUrl: "" };

export default function AdminMarketPage() {
  const { me } = useMe();
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/market", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — هذه الشاشة للإدارة."); return; }
    if (!res.ok) { setErr("تعذّر جلب السلع."); return; }
    const data = (await res.json().catch(() => null)) as { items?: Item[] } | null;
    setItems(data?.items ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    const t = await token();
    if (!t) return;
    const body = {
      ...(form.id ? { id: form.id } : {}),
      nameAr: form.nameAr.trim(),
      pricePoints: Number(form.pricePoints),
      stock: form.stock.trim() === "" ? null : Number(form.stock),
      imageUrl: form.imageUrl.trim() || null,
    };
    const res = await fetch("/api/admin/market", {
      method: form.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    });
    if (res.ok) { setForm(EMPTY); setErr(null); void load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر الحفظ."); }
  }

  async function toggle(item: Item) {
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/market", {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ id: item.id, active: !item.active }),
    });
    if (res.ok) void load();
    else setErr("تعذّر تغيير الحالة.");
  }

  function edit(item: Item) {
    setForm({
      id: item.id, nameAr: item.nameAr, pricePoints: String(item.pricePoints),
      stock: item.stock == null ? "" : String(item.stock),
      imageUrl: item.imageUrl ?? "",
    });
  }

  const cols: Column<Item>[] = [
    { key: "name", header: "السلعة", cell: (i) => (
      <span style={{ display: "flex", gap: sp(2), alignItems: "center", opacity: i.active ? 1 : 0.5 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {i.imageUrl && <img src={i.imageUrl} alt="" width={32} height={32} style={{ borderRadius: ui.radius.sm, objectFit: "cover" }} />}
        {i.nameAr}
      </span>
    ) },
    { key: "price", header: "السعر", cell: (i) => <Badge tone="bronze">{arNum(i.pricePoints)} نقطة</Badge> },
    { key: "stock", header: "المخزون", cell: (i) => <span>{i.stock == null ? "بلا حدّ" : arNum(i.stock)}</span> },
    { key: "state", header: "الحالة", cell: (i) => (i.active ? <Badge tone="success">مُفعَّل</Badge> : <Badge tone="neutral">معطَّل</Badge>) },
    { key: "act", header: "إجراء", cell: (i) => (
      <div style={{ display: "flex", gap: sp(2), justifyContent: "flex-end" }}>
        <Button variant="ghost" size="sm" onClick={() => edit(i)}>تعديل</Button>
        <Button variant="ghost" size="sm" onClick={() => void toggle(i)}>{i.active ? "تعطيل" : "تفعيل"}</Button>
      </div>
    ) },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/market"
      title="سلع السوق" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "السوق" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !items && <p style={{ color: ui.color.muted }}>جارٍ التحميل…</p>}

      {items && (
        <>
          <p style={{ color: ui.color.muted }}>
            السعر بالنقاط. المخزون فارغٌ = بلا حدّ. البائع لا يُدخل السعر — يُخصَم المثبّت هنا. تعطيلٌ لا حذف.
          </p>

          <section style={{ background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, padding: sp(4), marginBottom: sp(6) }}>
            <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(3) }}>{form.id ? "تعديل سلعة" : "سلعةٌ جديدة"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp(3) }}>
              <Field label="الاسم"><Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} placeholder="مثال: قلم رصاص" /></Field>
              <Field label="السعر (نقاط)"><Input type="number" value={form.pricePoints} onChange={(e) => setForm((f) => ({ ...f, pricePoints: e.target.value }))} placeholder="10" /></Field>
              <Field label="المخزون (اتركه فارغًا = بلا حدّ)"><Input type="number" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} placeholder="بلا حدّ" /></Field>
              <Field label="رابط الصورة (اختياريّ)"><Input value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" style={{ direction: "ltr" }} /></Field>
            </div>
            <div style={{ display: "flex", gap: sp(2), marginTop: sp(3) }}>
              <Button onClick={() => void save()}>{form.id ? "حفظ التعديل" : "إضافة"}</Button>
              {form.id && <Button variant="ghost" onClick={() => setForm(EMPTY)}>إلغاء</Button>}
            </div>
          </section>

          <Table columns={cols} rows={items} empty="لا سلع بعد — أضِف أوّل سلعة." />
        </>
      )}
    </AppShell>
  );
}
