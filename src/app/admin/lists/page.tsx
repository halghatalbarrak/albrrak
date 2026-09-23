"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Button, Input, Badge, Table, ui, sp, type Column } from "@/components/ui";

interface Item { id: string; nameAr: string; ordinal: number; isActive: boolean }
interface Lists { nationalities: Item[]; schoolStages: Item[]; guardianRelations: Item[] }
type Kind = "nationality" | "schoolStage" | "guardianRelation";

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function AdminListsPage() {
  const { me } = useMe();
  const router = useRouter();
  const [lists, setLists] = useState<Lists | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/lists", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — هذه الشاشة للمدير."); return; }
    if (!res.ok) { setErr("تعذّر جلب القوائم."); return; }
    const data = (await res.json().catch(() => null)) as Lists | null;
    setLists(data && Array.isArray(data.nationalities) ? data : { nationalities: [], schoolStages: [], guardianRelations: [] });
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggle(kind: Kind, item: Item) {
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/lists", {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ kind, id: item.id, isActive: !item.isActive }),
    });
    if (res.ok) void load();
    else setErr("تعذّر تغيير الحالة.");
  }

  const sections: { kind: Kind; title: string; items: Item[] }[] = lists ? [
    { kind: "nationality", title: "الجنسيات", items: lists.nationalities },
    { kind: "schoolStage", title: "المراحل الدراسية", items: lists.schoolStages },
    { kind: "guardianRelation", title: "صفات القرابة", items: lists.guardianRelations },
  ] : [];

  const colsFor = (kind: Kind): Column<Item>[] => [
    { key: "value", header: "القيمة", cell: (i) => <span style={{ opacity: i.isActive ? 1 : 0.5 }}>{i.nameAr}</span> },
    { key: "state", header: "الحالة", cell: (i) => (i.isActive ? <Badge tone="success">مُفعَّلة</Badge> : <Badge tone="neutral">معطَّلة</Badge>) },
    { key: "act", header: "إجراء", cell: (i) => <div style={{ display: "flex", justifyContent: "flex-end" }}><Button variant="ghost" size="sm" onClick={() => void toggle(kind, i)}>{i.isActive ? "تعطيل" : "تفعيل"}</Button></div> },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/lists"
      title="إدارة القوائم" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "القوائم" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !lists && <p style={{ color: ui.color.muted }}>جارٍ التحميل…</p>}

      {lists && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), marginBottom: sp(4) }}>
            <p style={{ color: ui.color.muted, margin: 0 }}>إضافةٌ وتعطيل (لا حذف — القيمة قد ترتبط بطلباتٍ سابقة). المعطَّل لا يظهر في نموذج القيد.</p>
            <Button onClick={() => router.push("/admin/lists/new")}>+ جديد</Button>
          </div>
          <Input style={{ width: "100%", marginBottom: sp(5) }} placeholder="تصفية بالاسم…" value={filter} onChange={(e) => setFilter(e.target.value)} />

          {sections.map((sec) => {
            const shown = filter.trim() ? sec.items.filter((i) => i.nameAr.includes(filter.trim())) : sec.items;
            return (
              <section key={sec.kind} style={{ marginBottom: sp(7) }}>
                <h2 style={{ fontSize: ui.text.lg, fontWeight: 700 }}>{sec.title} ({sec.items.length})</h2>
                <Table columns={colsFor(sec.kind)} rows={shown} empty="لا قيم." />
              </section>
            );
          })}
        </>
      )}
    </AppShell>
  );
}
