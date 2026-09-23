"use client";

import { useMe } from "@/lib/useMe";
import { AppShell } from "@/components/ui";
import { MarketForm, LIST } from "../shared";

export default function NewMarketItemPage() {
  const { me } = useMe();
  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/market"
      title="ثمرةٌ جديدة"
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "البيدر", href: LIST }, { label: "جديدة" }]}>
      <MarketForm initial={null} />
    </AppShell>
  );
}
