"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button, Input, Field, ui, sp } from "@/components/ui";

export interface Item {
  id: string;
  nameAr: string;
  imageUrl: string | null;
  pricePoints: number;
  stock: number | null;
  active: boolean;
}

const EMPTY = { id: "", nameAr: "", pricePoints: "", stock: "", imageUrl: "" };

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export const LIST = "/admin/market";

export function itemToForm(item: Item): typeof EMPTY {
  return {
    id: item.id, nameAr: item.nameAr, pricePoints: String(item.pricePoints),
    stock: item.stock == null ? "" : String(item.stock),
    imageUrl: item.imageUrl ?? "",
  };
}

/**
 * نموذج الثمرة — يخدم الإضافة (initial=null) والتعديل (initial=الثمرة). نفس API ونفس
 * التحقّق (POST/PATCH على /api/admin/market)؛ بعد الحفظ يعود للقائمة.
 */
export function MarketForm({ initial }: { initial: Item | null }) {
  const router = useRouter();
  const [form, setForm] = useState<typeof EMPTY>(initial ? itemToForm(initial) : EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const t = await token();
    if (!t) return;
    setSaving(true); setErr(null);
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
    if (res.ok) { router.push(LIST); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر الحفظ."); setSaving(false); }
  }

  return (
    <section style={{ background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, padding: sp(4), maxWidth: 720 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp(3) }}>
        <Field label="الاسم"><Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} placeholder="مثال: قلم رصاص" /></Field>
        <Field label="قيمة الثمرة (نقاط)"><Input type="number" value={form.pricePoints} onChange={(e) => setForm((f) => ({ ...f, pricePoints: e.target.value }))} placeholder="10" /></Field>
        <Field label="المتوفّر (اتركه فارغًا = بلا حدّ)"><Input type="number" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} placeholder="بلا حدّ" /></Field>
        <Field label="رابط الصورة (اختياريّ)"><Input value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" style={{ direction: "ltr" }} /></Field>
      </div>
      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      <div style={{ display: "flex", gap: sp(2), marginTop: sp(3) }}>
        <Button onClick={() => void save()} disabled={saving}>{saving ? "جارٍ…" : form.id ? "حفظ التعديل" : "إضافة"}</Button>
        <Button variant="ghost" onClick={() => router.push(LIST)}>إلغاء</Button>
      </div>
    </section>
  );
}
