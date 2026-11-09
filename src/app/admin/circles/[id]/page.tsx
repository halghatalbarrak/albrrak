"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/useMe";
import { AppShell, Button, ui, sp } from "@/components/ui";
import { tCircles as t } from "@/i18n/ar/circles";
import { Role } from "@prisma/client";

const LIST = "/admin/circles";

export default function CircleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useMe();
  const router = useRouter();
  const isManager = me?.roles.some((r) => r === Role.CIRCLE_MANAGER || r === Role.SUPER_ADMIN) ?? false;

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/circles"
      title={t("crumbCircles")}
      crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbCircles"), href: LIST }]}>
      <div style={{ display: "flex", gap: sp(3), flexWrap: "wrap", alignItems: "center" }}>
        <Link href={`/admin/circles/${id}/weakness`} style={{ fontSize: ui.text.xs, color: ui.color.primary }}>{t("weaknessMapLink")}</Link>
        {isManager && (
          <Button size="sm" onClick={() => router.push(`/admin/circles/${id}/edit`)}>{t("editBtn")}</Button>
        )}
      </div>
    </AppShell>
  );
}
