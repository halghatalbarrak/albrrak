"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Button, Select, EmptyState, Skeleton, Table, ui, sp, type Column } from "@/components/ui";
import { tCircles as t } from "@/i18n/ar/circles";

const linkBtn: React.CSSProperties = { fontSize: ui.text.xs, fontWeight: 600, color: ui.color.primary, textDecoration: "none", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md, padding: `${sp(1.5)} ${sp(2.5)}` };

interface Circle {
  id: string;
  nameAr: string;
  timeSlot: string;
  gender: string;
  location: string | null;
  programKey: string;
  programNameAr: string;
}
interface Program { id: string; key: string; nameAr: string }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const SLOT_AR: Record<string, string> = { ASR: t("slotAsr"), MAGHRIB: t("slotMaghrib") };

export default function AdminCirclesPage() {
  const { me } = useMe();
  const router = useRouter();
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const tok = await token();
    if (!tok) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/circles", { headers: { authorization: `Bearer ${tok}` } });
    if (res.status === 403) { setErr(t("errForbidden")); return; }
    if (!res.ok) { setErr(t("errLoadCircles")); return; }
    const data = (await res.json().catch(() => ({}))) as { circles?: Circle[]; programs?: Program[] };
    setCircles(Array.isArray(data.circles) ? data.circles : []);
    setPrograms(Array.isArray(data.programs) ? data.programs : []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // البرنامج الافتراضيّ للحلقة (للمنضمّ الجديد، ق١) — لا يمسّ برامج القيود القائمة.
  async function changeProgram(circleId: string, programId: string) {
    const tok = await token(); if (!tok) return;
    const res = await fetch(`/api/admin/circles/${circleId}/program`, {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` }, body: JSON.stringify({ programId }),
    });
    if (res.ok) void load(); else setErr(t("errChangeProgram"));
  }

  const cols: Column<Circle>[] = [
    { key: "name", header: t("colName"), cell: (c) => <strong>{c.nameAr}</strong> },
    { key: "program", header: t("colDefaultProgram"), cell: (c) => (
      programs.length ? (
        <Select value={programs.find((p) => p.key === c.programKey)?.id ?? ""} onChange={(e) => void changeProgram(c.id, e.target.value)} style={{ minWidth: 150 }}>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
        </Select>
      ) : c.programNameAr
    ) },
    { key: "slot", header: t("colSlot"), cell: (c) => SLOT_AR[c.timeSlot] ?? c.timeSlot },
    { key: "gender", header: t("colGender"), cell: (c) => (c.gender === "MALE" ? t("genderMale") : t("genderFemale")) },
    { key: "location", header: t("colLocation"), cell: (c) => c.location ?? "—" },
    { key: "map", header: t("colMap"), cell: (c) => <div style={{ display: "flex", justifyContent: "flex-end" }}><Link href={`/admin/circles/${c.id}/weakness`} style={linkBtn}>{t("weaknessMapLink")}</Link></div> },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/circles"
      title={`${t("listTitle")}${circles ? ` (${circles.length})` : ""}`}
      crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbCircles") }]}>

      {err && !circles && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !circles && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={40} />)}
        </div>
      )}

      {circles && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: sp(4) }}>
            <Button onClick={() => router.push("/admin/circles/new")}>{t("newBtn")}</Button>
          </div>

          {circles.length === 0 ? <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
            : <Table columns={cols} rows={circles} />}
        </>
      )}
    </AppShell>
  );
}
