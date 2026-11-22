"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Badge, Button, EmptyState, Select, Skeleton, Table, type Column, sp, ui } from "@/components/ui";
import { tTrash as t } from "@/i18n/ar/trash";

type TrashKind = "user" | "circle" | "student";

interface TrashItem {
  kind: TrashKind;
  id: string;
  label: string;
  deletedAt: string;
  deletedByName: string | null;
}

const KIND_AR: Record<TrashKind, string> = {
  user: t("kindUser"),
  circle: t("kindCircle"),
  student: t("kindStudent"),
};

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

export default function TrashPage() {
  const { me } = useMe();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<"" | TrashKind>("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmHardDelete, setConfirmHardDelete] = useState<TrashItem | null>(null);
  const [busy, setBusy] = useState(false);

  const isSuperAdmin = me?.roles?.includes("SUPER_ADMIN") ?? false;

  const load = useCallback(async () => {
    setErr(null);
    const tok = await token();
    if (!tok) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/trash", { headers: { authorization: `Bearer ${tok}` } });
    if (!res.ok) { setErr(t("fetchFailed")); return; }
    const data = (await res.json()) as { items?: TrashItem[] };
    setItems(Array.isArray(data.items) ? data.items : []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function restore(item: TrashItem) {
    setBusy(true); setActionId(item.id); setErr(null);
    const tok = await token();
    if (!tok) { setBusy(false); return; }
    const res = await fetch(`/api/admin/trash/${item.kind}/${item.id}`, {
      method: "POST", headers: { authorization: `Bearer ${tok}` },
    });
    setBusy(false); setActionId(null);
    if (res.ok || res.status === 204) void load();
    else setErr(t("restoreFailed"));
  }

  async function hardDelete(item: TrashItem) {
    setBusy(true); setActionId(item.id); setErr(null);
    const tok = await token();
    if (!tok) { setBusy(false); return; }
    const res = await fetch(`/api/admin/trash/${item.kind}/${item.id}`, {
      method: "DELETE", headers: { authorization: `Bearer ${tok}` },
    });
    setBusy(false); setActionId(null); setConfirmHardDelete(null);
    if (res.ok || res.status === 204) void load();
    else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? t("deleteFailed"));
    }
  }

  const visible = items?.filter((i) => !filterKind || i.kind === filterKind) ?? null;

  const cols: Column<TrashItem>[] = [
    {
      key: "kind", header: t("colKind"),
      cell: (r) => <Badge tone="neutral">{KIND_AR[r.kind]}</Badge>,
    },
    { key: "label", header: t("colLabel"), cell: (r) => <strong>{r.label}</strong> },
    { key: "deletedAt", header: t("colDeletedAt"), cell: (r) => formatDate(r.deletedAt) },
    { key: "deletedBy", header: t("colDeletedBy"), cell: (r) => r.deletedByName ?? "—" },
    {
      key: "actions", header: t("colActions"),
      cell: (r) => {
        const isThis = actionId === r.id;
        if (confirmHardDelete?.id === r.id) {
          return (
            <div style={{ display: "flex", gap: sp(1), alignItems: "center" }}>
              <Button size="sm" variant="danger" disabled={busy && isThis}
                onClick={() => void hardDelete(r)}>
                {busy && isThis ? t("deleting") : t("hardDeleteConfirmBtn")}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy}
                onClick={() => setConfirmHardDelete(null)}>
                {t("cancelBtn")}
              </Button>
            </div>
          );
        }
        return (
          <div style={{ display: "flex", gap: sp(1), flexWrap: "wrap" }}>
            <Button size="sm" variant="ghost" disabled={busy && isThis}
              onClick={() => void restore(r)}>
              {busy && isThis ? t("restoring") : t("restoreBtn")}
            </Button>
            {isSuperAdmin && (
              <Button size="sm" variant="danger" disabled={busy}
                onClick={() => setConfirmHardDelete(r)}>
                {t("hardDeleteBtn")}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <AppShell
      roles={me?.roles ?? []}
      userName={me?.name}
      activeHref="/admin/trash"
      title={t("pageTitle")}
      crumbs={[
        { label: t("crumbHome"), href: "/" },
        { label: t("crumbAdmin") },
        { label: t("crumbTrash") },
      ]}
    >
      {err && <p style={{ color: ui.color.danger, marginBottom: sp(3) }}>{err}</p>}

      {!items && !err && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={44} />)}
        </div>
      )}

      {items && (
        <>
          <div style={{ marginBottom: sp(3) }}>
            <Select value={filterKind} onChange={(e) => setFilterKind(e.target.value as "" | TrashKind)}
              style={{ maxWidth: 200 }}>
              <option value="">{t("filterAll")}</option>
              <option value="user">{t("filterUsers")}</option>
              <option value="circle">{t("filterCircles")}</option>
              <option value="student">{t("filterStudents")}</option>
            </Select>
          </div>

          {isSuperAdmin && (
            <p style={{ fontSize: ui.text.xs, color: ui.color.muted, marginBottom: sp(2) }}>
              {t("hardDeleteWarning")}
            </p>
          )}

          {visible && visible.length > 0
            ? <Table columns={cols} rows={visible} />
            : <EmptyState title={t("empty")} />}
        </>
      )}
    </AppShell>
  );
}
