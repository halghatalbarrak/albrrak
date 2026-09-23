"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import {
  AppShell, Button, Input, Field, Badge, Table, ui, sp, type Column,
} from "@/components/ui";
import { type Item } from "./shared";

interface PendingGift {
  id: string;
  nameAr: string;
  imageUrl: string | null;
  proposedPricePoints: number | null;
  targetStudentName: string | null; // null = عامّة
  proposedByName: string | null;
}

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function AdminMarketPage() {
  const { me } = useMe();
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [gifts, setGifts] = useState<PendingGift[]>([]);
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/market", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — هذه الشاشة للإدارة."); return; }
    if (!res.ok) { setErr("تعذّر جلب الثمار."); return; }
    const data = (await res.json().catch(() => null)) as { items?: Item[] } | null;
    setItems(data?.items ?? []);
    // ثمرات الوليّ المعلّقة (م٦ب-٢).
    const gres = await fetch("/api/admin/market/gifts", { headers: { authorization: `Bearer ${t}` } });
    if (gres.ok) setGifts(((await gres.json()) as { gifts: PendingGift[] }).gifts);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decideGift(id: string, action: "approve" | "reject") {
    const t = await token();
    if (!t) return;
    const body: Record<string, unknown> = { id, action };
    if (action === "approve") {
      const raw = priceEdits[id];
      const g = gifts.find((x) => x.id === id);
      body.pricePoints = raw != null && raw.trim() !== "" ? Number(raw) : g?.proposedPricePoints ?? NaN;
    }
    const res = await fetch("/api/admin/market/gifts", {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    });
    if (res.ok) { setErr(null); void load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر تنفيذ الإجراء."); }
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

  const cols: Column<Item>[] = [
    { key: "name", header: "الثمرة", cell: (i) => (
      <span style={{ display: "flex", gap: sp(2), alignItems: "center", opacity: i.active ? 1 : 0.5 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {i.imageUrl && <img src={i.imageUrl} alt="" width={32} height={32} style={{ borderRadius: ui.radius.sm, objectFit: "cover" }} />}
        {i.nameAr}
      </span>
    ) },
    { key: "price", header: "قيمة الثمرة", cell: (i) => <Badge tone="bronze">{arNum(i.pricePoints)} نقطة</Badge> },
    { key: "stock", header: "المتوفّر", cell: (i) => <span>{i.stock == null ? "بلا حدّ" : arNum(i.stock)}</span> },
    { key: "state", header: "الحالة", cell: (i) => (i.active ? <Badge tone="success">مُفعَّل</Badge> : <Badge tone="neutral">معطَّل</Badge>) },
    { key: "act", header: "إجراء", cell: (i) => (
      <div style={{ display: "flex", gap: sp(2), justifyContent: "flex-end" }}>
        <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/market/${i.id}/edit`)}>تعديل</Button>
        <Button variant="ghost" size="sm" onClick={() => void toggle(i)}>{i.active ? "تعطيل" : "تفعيل"}</Button>
      </div>
    ) },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/market"
      title="ثمار البيدر" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "البيدر" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !items && <p style={{ color: ui.color.muted }}>جارٍ التحميل…</p>}

      {items && (
        <>
          {gifts.length > 0 && (
            <section style={{ background: "var(--color-warn-bg)", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, padding: sp(4), marginBottom: sp(6) }}>
              <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(1) }}>ثمرات بانتظار الموافقة</h2>
              <p style={{ color: ui.color.muted, marginTop: 0 }}>ثمرات أضافها أولياء الأمور. اعتمِد القيمة المقترحة أو عدّلها، أو ارفض.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
                {gifts.map((g) => (
                  <div key={g.id} style={{ display: "flex", flexWrap: "wrap", gap: sp(3), alignItems: "flex-end", justifyContent: "space-between", borderTop: `1px solid ${ui.color.border}`, paddingTop: sp(3) }}>
                    <div style={{ display: "flex", gap: sp(2), alignItems: "center" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {g.imageUrl && <img src={g.imageUrl} alt="" width={40} height={40} style={{ borderRadius: ui.radius.sm, objectFit: "cover" }} />}
                      <div>
                        <div style={{ fontWeight: 700 }}>{g.nameAr}</div>
                        <div style={{ fontSize: ui.text.xs, color: ui.color.muted }}>
                          {g.targetStudentName ? `خاصّة بـ ${g.targetStudentName}` : "عامّة لكلّ البيدر"} · اقترحها {g.proposedByName ?? "—"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: sp(2), alignItems: "flex-end" }}>
                      <Field label="القيمة المعتمَدة">
                        <Input type="number" value={priceEdits[g.id] ?? String(g.proposedPricePoints ?? "")}
                          onChange={(e) => setPriceEdits((p) => ({ ...p, [g.id]: e.target.value }))} style={{ width: 96 }} />
                      </Field>
                      <Button size="sm" onClick={() => void decideGift(g.id, "approve")}>اعتماد</Button>
                      <Button variant="ghost" size="sm" onClick={() => void decideGift(g.id, "reject")}>رفض</Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), marginBottom: sp(4) }}>
            <p style={{ color: ui.color.muted, margin: 0 }}>
              قيمة الثمرة بالنقاط. المتوفّر فارغٌ = بلا حدّ. أمين البيدر لا يُدخل القيمة — تُخصَم المثبّتة هنا. تعطيلٌ لا حذف.
            </p>
            <Button onClick={() => router.push("/admin/market/new")}>+ جديد</Button>
          </div>

          <Table columns={cols} rows={items} empty="لا ثمار بعد — أضِف أوّل ثمرة بزرّ «+ جديد»." />
        </>
      )}
    </AppShell>
  );
}
