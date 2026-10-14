"use client";

import { use, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, ui } from "@/components/ui";
import { tMarket as t } from "@/i18n/ar/market";
import { MarketForm, LIST, type Item } from "../../shared";

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

// صفحة تعديل ثمرة — تجلب الثمرة بمعرّفها ثمّ تعرض النموذج نفسه (تعديل). نفس API/التحقّق.
export default function EditMarketItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useMe();
  const [item, setItem] = useState<Item | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const tok = await token();
      if (!tok) { window.location.href = "/login"; return; }
      const res = await fetch("/api/admin/market", { headers: { authorization: `Bearer ${tok}` } });
      if (res.status === 403) { setErr(t("errNoPermission")); return; }
      if (!res.ok) { setErr(t("errFetchItem")); return; }
      const data = (await res.json().catch(() => null)) as { items?: Item[] } | null;
      const found = data?.items?.find((x) => x.id === id) ?? null;
      if (!found) { setErr(t("errItemNotFound")); return; }
      setItem(found);
    })();
  }, [id]);

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/market"
      title={t("editPageTitle")}
      crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbBaydar"), href: LIST }, { label: t("crumbEdit") }]}>
      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !item && <p style={{ color: ui.color.muted }}>{t("loading")}</p>}
      {item && <MarketForm initial={item} />}
    </AppShell>
  );
}
