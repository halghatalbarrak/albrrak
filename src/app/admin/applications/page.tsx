"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { formatPhoneForDisplay } from "@/lib/phone";
import { useMe } from "@/lib/useMe";
import { tApplications as t } from "@/i18n/ar/applications";
import { AppShell, Card, Button, Badge, EmptyState, Skeleton, Table, ui, sp, type Column } from "@/components/ui";

interface Row {
  id: string;
  name: string;
  age: number;
  gender: string;
  nationality: string;
  schoolStage: string | null;
  guardianPhone: string;
  studentPhone: string | null;
  priorHifzJuz: number | null;
  status: string;
  createdAt: string;
}

async function token(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function AdminApplicationsPage() {
  const { me } = useMe();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const tok = await token();
    if (!tok) {
      window.location.href = "/login";
      return;
    }
    const auth = { authorization: `Bearer ${tok}` };
    const [meRes, appsRes] = await Promise.all([
      fetch("/api/me", { headers: auth }),
      fetch("/api/applications", { headers: auth }),
    ]);
    if (meRes.ok) setRoles(((await meRes.json()) as { roles: string[] }).roles);
    if (appsRes.status === 403) {
      setErr(t("errNoPermission"));
      return;
    }
    if (!appsRes.ok) {
      setErr(t("errLoad"));
      return;
    }
    const data = (await appsRes.json().catch(() => ({}))) as { applications?: Row[] };
    const list = Array.isArray(data.applications) ? data.applications : [];
    // الاستثناء أولاً: قائمة الانتظار قبل المعلّق، ثم الأقدم.
    const sorted = [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === "WAITLISTED" ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
    setRows(sorted);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: "accept" | "reject" | "waitlist") {
    const tok = await token();
    if (!tok) return;
    let note: string | undefined;
    if (decision === "reject") {
      note = window.prompt(t("rejectPrompt")) ?? "";
      if (!note.trim()) return;
    }
    const res = await fetch(`/api/applications/${id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) void load();
    else setErr(t("errDecide"));
  }

  async function revealId(id: string) {
    const tok = await token();
    if (!tok) return;
    const res = await fetch(`/api/applications/${id}/reveal-id`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}` },
    });
    if (res.ok) {
      const { nationalId } = (await res.json()) as { nationalId: string };
      setRevealed((r) => ({ ...r, [id]: nationalId }));
    } else {
      setErr(t("errReveal"));
    }
  }

  const canReveal = roles.includes("REGISTRAR") || roles.includes("SUPER_ADMIN");

  // النظام يقترح: أقدم طلبٍ معلّق (بالأيام) ليُبدأ به.
  const oldestDays = rows && rows.length
    ? Math.floor((Date.now() - Date.parse(rows[0].createdAt)) / 86_400_000)
    : null;

  const cols: Column<Row>[] = [
    { key: "name", header: t("colName"), cell: (r) => <strong>{r.name}</strong> },
    { key: "status", header: t("colStatus"), cell: (r) => (r.status === "WAITLISTED" ? <Badge tone="bronze">{t("statusWaitlisted")}</Badge> : <Badge tone="neutral">{t("statusNew")}</Badge>) },
    { key: "info", header: t("colInfo"), cell: (r) => `${r.age} ${t("infoYearsUnit")} · ${r.gender === "MALE" ? t("genderMale") : t("genderFemale")} · ${r.nationality}` },
    { key: "guardian", header: t("colGuardian"), cell: (r) => <span style={{ direction: "ltr" }}>{formatPhoneForDisplay(r.guardianPhone)}</span> },
    { key: "hifz", header: t("colHifz"), cell: (r) => (r.priorHifzJuz != null ? `${r.priorHifzJuz} ${t("hifzJuzUnit")}` : "—") },
    {
      key: "actions", header: t("colActions"), cell: (r) => (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button size="sm" onClick={() => decide(r.id, "accept")}>{t("btnAccept")}</Button>
          <Button variant="danger" size="sm" onClick={() => decide(r.id, "reject")}>{t("btnReject")}</Button>
          <Button variant="ghost" size="sm" onClick={() => decide(r.id, "waitlist")}>{t("btnWaitlist")}</Button>
          {canReveal && <Button variant="ghost" size="sm" onClick={() => revealId(r.id)}>{revealed[r.id] ? `${t("revealedIdPrefix")}${revealed[r.id]}` : t("btnRevealId")}</Button>}
        </div>
      ),
    },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/applications"
      title={`${t("shellTitlePrefix")}${rows ? ` (${rows.length})` : ""}`}
      crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbApplications") }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !rows && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={44} />)}
        </div>
      )}
      {rows && rows.length === 0 && <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />}

      {rows && rows.length > 0 && (
        <>
          {oldestDays != null && oldestDays >= 1 && (
            <Card style={{ marginBottom: sp(4), borderInlineStart: `4px solid ${ui.color.bronze}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3), flexWrap: "wrap" }}>
              <span>{t("oldestPendingPrefix")}<strong>{oldestDays}</strong>{t("oldestPendingSuffix")}</span>
              <Badge tone="bronze">{rows.length}{t("pendingReviewSuffix")}</Badge>
            </Card>
          )}
          <Table columns={cols} rows={rows} />
        </>
      )}
    </AppShell>
  );
}
