"use client";

import { useMe } from "@/lib/useMe";
import { AppShell } from "@/components/ui";
import { EconomyForm, LIST } from "../shared";

export default function NewEconomyItemPage() {
  const { me } = useMe();
  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/economy"
      title="بندٌ جديد"
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "النقاط", href: LIST }, { label: "جديد" }]}>
      <EconomyForm initial={null} />
    </AppShell>
  );
}
