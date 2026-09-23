"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import {
  AppShell, Button, Badge, Table, ui, sp, type Column,
} from "@/components/ui";
import { type Item, type GrantSource, type LimitPeriod, type EventType, SOURCE_AR, PERIOD_AR, EVENT_AR } from "./shared";

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function AdminEconomyPage() {
  const { me } = useMe();
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/economy", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — هذه الشاشة للإدارة."); return; }
    if (!res.ok) { setErr("تعذّر جلب البنود."); return; }
    const data = (await res.json().catch(() => null)) as { items?: Item[] } | null;
    setItems(data?.items ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggle(item: Item) {
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/economy", {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ id: item.id, active: !item.active }),
    });
    if (res.ok) void load();
    else setErr("تعذّر تغيير الحالة.");
  }

  const cols: Column<Item>[] = [
    { key: "name", header: "البند", cell: (i) => <span style={{ opacity: i.active ? 1 : 0.5 }}>{i.nameAr}</span> },
    { key: "value", header: "القيمة", cell: (i) => (
      <Badge tone={i.value >= 0 ? "success" : "danger"}>{i.value >= 0 ? "+" : "−"}{arNum(Math.abs(i.value))}</Badge>
    ) },
    { key: "source", header: "المصدر", cell: (i) => (
      <span>{SOURCE_AR[i.grantSource as GrantSource]}{i.grantSource === "AUTO" && i.eventType ? ` — ${EVENT_AR[i.eventType as EventType]}` : ""}</span>
    ) },
    { key: "limit", header: "الحدّ", cell: (i) => (
      <span>{i.limitPeriod === "NONE" ? "بلا حدّ" : `${arNum(i.limitCount ?? 0)} / ${PERIOD_AR[i.limitPeriod as LimitPeriod]}`}</span>
    ) },
    { key: "state", header: "الحالة", cell: (i) => (i.active ? <Badge tone="success">مُفعَّل</Badge> : <Badge tone="neutral">معطَّل</Badge>) },
    { key: "act", header: "إجراء", cell: (i) => (
      <div style={{ display: "flex", gap: sp(2), justifyContent: "flex-end" }}>
        <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/economy/${i.id}/edit`)}>تعديل</Button>
        <Button variant="ghost" size="sm" onClick={() => void toggle(i)}>{i.active ? "تعطيل" : "تفعيل"}</Button>
      </div>
    ) },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/economy"
      title="بنود النقاط" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "النقاط" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !items && <p style={{ color: ui.color.muted }}>جارٍ التحميل…</p>}

      {items && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), marginBottom: sp(4) }}>
            <p style={{ color: ui.color.muted, margin: 0 }}>
              القيمة الموجبة كسبٌ والسالبة خصم. المصدر يحدّد من يمنح (المعلّم/الإدارة)؛ والتلقائيّ يمنحه النظام عند حدثٍ تختاره.
              الحدّ عددُ مرّاتٍ في فترة. تعطيلٌ لا حذف.
            </p>
            <Button onClick={() => router.push("/admin/economy/new")}>+ جديد</Button>
          </div>

          <Table columns={cols} rows={items} empty="لا بنود بعد — أضِف أوّل بند بزرّ «+ جديد»." />
        </>
      )}
    </AppShell>
  );
}
