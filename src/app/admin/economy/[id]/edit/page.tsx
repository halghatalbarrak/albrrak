"use client";

import { use, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, ui } from "@/components/ui";
import { EconomyForm, LIST, type Item } from "../../shared";
import { tEconomy as tEco } from "@/i18n/ar/economy";

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
      if (res.status === 403) { setErr(tEco("errNoPermission")); return; }
      if (!res.ok) { setErr(tEco("errFetchItem")); return; }
      const data = (await res.json().catch(() => null)) as { items?: Item[] } | null;
      const found = data?.items?.find((x) => x.id === id) ?? null;
      if (!found) { setErr(tEco("errItemNotFound")); return; }
      setItem(found);
    })();
  }, [id]);

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/economy"
      title={tEco("editTitle")}
      crumbs={[{ label: tEco("crumbHome"), href: "/" }, { label: tEco("crumbAdmin") }, { label: tEco("crumbPoints"), href: LIST }, { label: tEco("crumbEdit") }]}>
      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !item && <p style={{ color: ui.color.muted }}>{tEco("loading")}</p>}
      {item && <EconomyForm initial={item} />}
    </AppShell>
  );
}
