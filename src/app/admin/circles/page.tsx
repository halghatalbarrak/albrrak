"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Button, EmptyState, ListToolbar, Skeleton, Table, ui, sp, type Column } from "@/components/ui";
import { normalizeArabic } from "@/lib/normalize-arabic";
import { tCircles as t } from "@/i18n/ar/circles";
import { navAr } from "@/i18n/ar/nav";
import { arNum } from "@/lib/format";
import { Role } from "@prisma/client";

const PROGRAM_AR: Record<string, string> = {
  QAIDAH_MADANIYYAH: navAr.civilBase, MARAQI: navAr.maraqi, MUDDAKIR: navAr.grpMuddakir, WEEKLY: navAr.weekly,
};

const linkBtn: React.CSSProperties = { fontSize: ui.text.xs, fontWeight: 600, color: ui.color.primary, textDecoration: "none", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md, padding: `${sp(1.5)} ${sp(2.5)}` };

interface Circle {
  id: string;
  nameAr: string;
  timeSlot: string;
  gender: string;
  programCounts: { programKey: string; n: number }[];
}

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const SLOT_AR: Record<string, string> = { ASR: t("slotAsr"), MAGHRIB: t("slotMaghrib"), ISHA: t("slotIsha") };

function DeleteCell({ circle, tok, onDeleted }: { circle: Circle; tok: string; onDeleted: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rowErr, setRowErr] = useState<string | null>(null);

  async function doDelete() {
    setDeleting(true);
    const res = await fetch(`/api/admin/circles/${circle.id}`, {
      method: "DELETE", headers: { authorization: `Bearer ${tok}` },
    });
    if (res.status === 204) { onDeleted(circle.id); return; }
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setRowErr(j.error ?? t("errCreateCircle"));
    setDeleting(false);
    setConfirming(false);
  }

  if (confirming) {
    return (
      <div style={{ display: "flex", gap: sp(1), alignItems: "center" }}>
        <Button size="sm" variant="danger" disabled={deleting} onClick={doDelete}>
          {deleting ? t("savingBtn") : t("deleteConfirmBtn")}
        </Button>
        <Button size="sm" variant="ghost" disabled={deleting} onClick={() => { setConfirming(false); setRowErr(null); }}>
          {t("deleteCancelBtn")}
        </Button>
        {rowErr && <span style={{ fontSize: ui.text.xs, color: ui.color.danger }}>{rowErr}</span>}
      </div>
    );
  }
  return <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>{t("deleteBtn")}</Button>;
}

export default function AdminCirclesPage() {
  const { me } = useMe();
  const router = useRouter();
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tok, setTok] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterSlot, setFilterSlot] = useState("");
  const [filterGender, setFilterGender] = useState("");

  const isManager = me?.roles.some((r) => r === Role.CIRCLE_MANAGER || r === Role.SUPER_ADMIN) ?? false;

  const load = useCallback(async () => {
    const t_ = await token();
    if (!t_) { window.location.href = "/login"; return; }
    setTok(t_);
    const res = await fetch("/api/admin/circles", { headers: { authorization: `Bearer ${t_}` } });
    if (res.status === 403) { setErr(t("errForbidden")); return; }
    if (!res.ok) { setErr(t("errLoadCircles")); return; }
    const data = (await res.json().catch(() => ({}))) as { circles?: Circle[] };
    setCircles(Array.isArray(data.circles) ? data.circles : []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!circles) return null;
    const q = normalizeArabic(search);
    return circles.filter((c) => {
      if (q && !normalizeArabic(c.nameAr).includes(q)) return false;
      if (filterSlot && c.timeSlot !== filterSlot) return false;
      if (filterGender && c.gender !== filterGender) return false;
      return true;
    });
  }, [circles, search, filterSlot, filterGender]);

  const selectStyle: React.CSSProperties = {
    border: `1px solid ${ui.color.border}`,
    borderRadius: ui.radius.md,
    padding: `${sp(1.5)} ${sp(2)}`,
    fontSize: ui.text.xs,
    background: ui.color.surface,
    color: ui.color.text,
  };

  const cols: Column<Circle>[] = [
    { key: "name", header: t("colName"), cell: (c) => <Link href={`/admin/circles/${c.id}`} style={{ fontWeight: 700, color: ui.color.text, textDecoration: "none" }}>{c.nameAr}</Link> },
    { key: "students", header: t("colStudents"), cell: (c) => (
      c.programCounts.length
        ? c.programCounts.map((pc) => `${PROGRAM_AR[pc.programKey] ?? pc.programKey} ${arNum(pc.n)}`).join(" · ")
        : "—"
    ) },
    { key: "slot", header: t("colSlot"), cell: (c) => SLOT_AR[c.timeSlot] ?? c.timeSlot },
    { key: "gender", header: t("colGender"), cell: (c) => (c.gender === "MALE" ? t("genderMale") : t("genderFemale")) },
    { key: "map", header: t("colMap"), cell: (c) => <div style={{ display: "flex", justifyContent: "flex-end" }}><Link href={`/admin/circles/${c.id}/weakness`} style={linkBtn}>{t("weaknessMapLink")}</Link></div> },
    ...(isManager && tok ? [{
      key: "actions" as const,
      header: t("colActions"),
      cell: (c: Circle) => (
        <div style={{ display: "flex", gap: sp(1), flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Link href={`/admin/circles/${c.id}/edit`} style={linkBtn}>{t("editBtn")}</Link>
          <DeleteCell circle={c} tok={tok} onDeleted={(id) => setCircles((prev) => prev?.filter((x) => x.id !== id) ?? null)} />
        </div>
      ),
    }] : []),
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
          <ListToolbar value={search} onChange={setSearch} placeholder={t("searchPlaceholder")}>
            <select value={filterSlot} onChange={(e) => setFilterSlot(e.target.value)} style={selectStyle}>
              <option value="">{t("filterAllSlots")}</option>
              <option value="ASR">{t("slotAsr")}</option>
              <option value="MAGHRIB">{t("slotMaghrib")}</option>
              <option value="ISHA">{t("slotIsha")}</option>
            </select>
            <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)} style={selectStyle}>
              <option value="">{t("filterAllGenders")}</option>
              <option value="MALE">{t("genderMale")}</option>
              <option value="FEMALE">{t("genderFemale")}</option>
            </select>
            <div style={{ marginRight: "auto" }}>
              <Button onClick={() => router.push("/admin/circles/new")}>{t("newBtn")}</Button>
            </div>
          </ListToolbar>

          {filtered!.length === 0 ? <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
            : <Table columns={cols} rows={filtered!} />}
        </>
      )}
    </AppShell>
  );
}
