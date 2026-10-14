"use client";

import { useMe } from "@/lib/useMe";
import { AppShell } from "@/components/ui";
import { EconomyForm, LIST } from "../shared";
import { tEconomy as tEco } from "@/i18n/ar/economy";

export default function NewEconomyItemPage() {
  const { me } = useMe();
  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/economy"
      title={tEco("newTitle")}
      crumbs={[{ label: tEco("crumbHome"), href: "/" }, { label: tEco("crumbAdmin") }, { label: tEco("crumbPoints"), href: LIST }, { label: tEco("crumbNew") }]}>
      <EconomyForm initial={null} />
    </AppShell>
  );
}
