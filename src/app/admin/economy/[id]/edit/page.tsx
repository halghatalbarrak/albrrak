"use client";

import { use, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, ui } from "@/components/ui";
import { EconomyForm, LIST, type Item } from "../../shared";

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

// صفحة تعديل بند — تجلب البند بمعرّفه ثمّ تعرض النموذج نفسه (تعديل). نفس API/التحقّق.
export default function EditEconomyItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useMe();
  const [item, setItem] = useState<Item | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const t = await token();
      if (!t) { window.location.href = "/login"; return; }
      const res = await fetch("/api/admin/economy", { headers: { authorization: `Bearer ${t}` } });
      if (res.status === 403) { setErr("لا صلاحية — هذه الشاشة للإدارة."); return; }
      if (!res.ok) { setErr("تعذّر جلب البند."); return; }
      const data = (await res.json().catch(() => null)) as { items?: Item[] } | null;
      const found = data?.items?.find((x) => x.id === id) ?? null;
      if (!found) { setErr("البند غير موجود."); return; }
      setItem(found);
    })();
  }, [id]);

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/economy"
      title="تعديل بند"
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "النقاط", href: LIST }, { label: "تعديل" }]}>
      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !item && <p style={{ color: ui.color.muted }}>جارٍ التحميل…</p>}
      {item && <EconomyForm initial={item} />}
    </AppShell>
  );
}
