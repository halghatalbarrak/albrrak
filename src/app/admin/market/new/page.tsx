"use client";

import { useMe } from "@/lib/useMe";
import { AppShell } from "@/components/ui";
import { tMarket as t } from "@/i18n/ar/market";
import { MarketForm, LIST } from "../shared";

export default function NewMarketItemPage() {
  const { me } = useMe();
  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/market"
      title={t("newPageTitle")}
      crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbBaydar"), href: LIST }, { label: t("crumbNew") }]}>
      <MarketForm initial={null} />
    </AppShell>
  );
}
