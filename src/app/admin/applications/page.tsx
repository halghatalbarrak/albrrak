"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { formatPhoneForDisplay } from "@/lib/phone";
import { useMe } from "@/lib/useMe";
import { tApplications as t } from "@/i18n/ar/applications";
import { AppShell, Card, Button, Badge, EmptyState, ListToolbar, Skeleton, Table, Tabs, intakeTabs, ui, sp, type Column } from "@/components/ui";
import { normalizeArabic } from "@/lib/normalize-arabic";

interface CircleOpt { id: string; nameAr: string }
interface SupervisorOpt { id: string; name: string; full: boolean }

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

  // نموذج الإلحاق بالمُدّكِر (inline)
  const [enrollingApp, setEnrollingApp] = useState<Row | null>(null);
  const [enrollCircles, setEnrollCircles] = useState<CircleOpt[]>([]);
  const [enrollSupervisors, setEnrollSupervisors] = useState<SupervisorOpt[]>([]);
  const [enrollCircleId, setEnrollCircleId] = useState("");
  const [enrollSupervisorId, setEnrollSupervisorId] = useState("");
  const [enrollTrack, setEnrollTrack] = useState<1 | 2 | 3>(1);
  const [enrollDelivery, setEnrollDelivery] = useState<"IN_PERSON" | "REMOTE">("IN_PERSON");
  const [enrolling, setEnrolling] = useState(false);

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

  async function del(id: string, name: string) {
    if (!window.confirm(`حذف طلب «${name}»؟`)) return;
    const tok = await token();
    if (!tok) return;
    const res = await fetch(`/api/admin/applications/${encodeURIComponent(id)}`, {
      method: "DELETE", headers: { authorization: `Bearer ${tok}` },
    });
    if (res.ok) void load();
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? t("errDecide")); }
  }

  async function openEnrollForm(row: Row) {
    setErr(null);
    const tok = await token();
    if (!tok) return;
    const auth = { authorization: `Bearer ${tok}` };
    const [mRes, cRes] = await Promise.all([
      fetch("/api/muddakir", { headers: auth }),
      fetch("/api/admin/circles", { headers: auth }),
    ]);
    if (!mRes.ok || !cRes.ok) { setErr(t("errLoadForm")); return; }
    const mData = (await mRes.json()) as { supervisors?: { id: string; name: string; full: boolean }[] };
    const cData = (await cRes.json()) as { circles?: { id: string; nameAr: string }[] };
    setEnrollSupervisors(mData.supervisors ?? []);
    setEnrollCircles((cData.circles ?? []).map((c) => ({ id: c.id, nameAr: c.nameAr })));
    setEnrollCircleId("");
    setEnrollSupervisorId("");
    setEnrollTrack(1);
    setEnrollDelivery("IN_PERSON");
    setEnrollingApp(row);
  }

  async function submitEnroll() {
    if (!enrollingApp || !enrollCircleId) return;
    const tok = await token();
    if (!tok) return;
    setEnrolling(true);
    const res = await fetch(`/api/applications/${encodeURIComponent(enrollingApp.id)}/enroll-muddakir`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({
        circleId: enrollCircleId,
        track: enrollTrack,
        supervisorId: enrollSupervisorId || undefined,
        deliveryMode: enrollDelivery,
      }),
    });
    setEnrolling(false);
    if (res.ok) {
      setEnrollingApp(null);
      void load();
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? t("errEnroll"));
    }
  }

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

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = normalizeArabic(search);
    return rows.filter((r) => {
      if (q && !normalizeArabic(r.name).includes(q)) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    });
  }, [rows, search, filterStatus]);

  const selectStyle: React.CSSProperties = {
    border: `1px solid ${ui.color.border}`,
    borderRadius: ui.radius.md,
    padding: `${sp(1.5)} ${sp(2)}`,
    fontSize: ui.text.xs,
    background: ui.color.surface,
    color: ui.color.text,
  };

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
          <Button size="sm" onClick={() => void openEnrollForm(r)}>{t("btnEnrollMuddakir")}</Button>
          <Button size="sm" variant="ghost" onClick={() => decide(r.id, "accept")}>{t("btnAccept")}</Button>
          <Button variant="danger" size="sm" onClick={() => decide(r.id, "reject")}>{t("btnReject")}</Button>
          <Button variant="ghost" size="sm" onClick={() => decide(r.id, "waitlist")}>{t("btnWaitlist")}</Button>
          {canReveal && <Button variant="ghost" size="sm" onClick={() => revealId(r.id)}>{revealed[r.id] ? `${t("revealedIdPrefix")}${revealed[r.id]}` : t("btnRevealId")}</Button>}
          {(roles.includes("CIRCLE_MANAGER") || roles.includes("SUPER_ADMIN")) && <Button variant="ghost" size="sm" style={{ color: ui.color.danger }} onClick={() => void del(r.id, r.name)}>{t("btnDelete")}</Button>}
        </div>
      ),
    },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/applications"
      title={`${t("shellTitlePrefix")}${rows ? ` (${rows.length})` : ""}`}
      crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbApplications") }]}>
      <Tabs items={intakeTabs} />

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !rows && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={44} />)}
        </div>
      )}
      {rows && (
        <ListToolbar value={search} onChange={setSearch} placeholder={t("searchPlaceholder")}>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
            <option value="">{t("filterAllStatuses")}</option>
            <option value="WAITLISTED">{t("statusWaitlisted")}</option>
          </select>
        </ListToolbar>
      )}

      {enrollingApp && (
        <Card style={{ marginBottom: sp(4), borderInlineStart: `4px solid ${ui.color.primary}`, display: "flex", flexDirection: "column", gap: sp(3), padding: sp(4) }}>
          <strong>{t("enrollFormTitle")} — {enrollingApp.name}</strong>
          <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("enrollFormCircle")}</label>
            <select value={enrollCircleId} onChange={(e) => setEnrollCircleId(e.target.value)} style={selectStyle} aria-label={t("enrollFormCircle")}>
              <option value="">{t("enrollFormCirclePlaceholder")}</option>
              {enrollCircles.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
            </select>
            <label style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("enrollFormTrack")}</label>
            <select value={String(enrollTrack)} onChange={(e) => setEnrollTrack(Number(e.target.value) as 1 | 2 | 3)} style={selectStyle} aria-label={t("enrollFormTrack")}>
              <option value="1">{t("enrollFormTrack1")}</option>
              <option value="2">{t("enrollFormTrack2")}</option>
              <option value="3">{t("enrollFormTrack3")}</option>
            </select>
            <label style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("enrollFormDelivery")}</label>
            <select value={enrollDelivery} onChange={(e) => setEnrollDelivery(e.target.value as "IN_PERSON" | "REMOTE")} style={selectStyle} aria-label={t("enrollFormDelivery")}>
              <option value="IN_PERSON">{t("enrollFormDeliveryInPerson")}</option>
              <option value="REMOTE">{t("enrollFormDeliveryRemote")}</option>
            </select>
            <label style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("enrollFormSupervisor")}</label>
            <select value={enrollSupervisorId} onChange={(e) => setEnrollSupervisorId(e.target.value)} style={selectStyle} aria-label={t("enrollFormSupervisor")}>
              <option value="">{t("enrollFormSupervisorPlaceholder")}</option>
              {enrollSupervisors.filter((s) => !s.full).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: sp(2) }}>
            <Button size="sm" disabled={!enrollCircleId || enrolling} onClick={() => void submitEnroll()}>{t("enrollFormSubmit")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEnrollingApp(null)}>{t("enrollFormCancel")}</Button>
          </div>
        </Card>
      )}

      {rows && filtered!.length === 0 && <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />}

      {rows && filtered!.length > 0 && (
        <>
          {oldestDays != null && oldestDays >= 1 && (
            <Card style={{ marginBottom: sp(4), borderInlineStart: `4px solid ${ui.color.bronze}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3), flexWrap: "wrap" }}>
              <span>{t("oldestPendingPrefix")}<strong>{oldestDays}</strong>{t("oldestPendingSuffix")}</span>
              <Badge tone="bronze">{rows.length}{t("pendingReviewSuffix")}</Badge>
            </Card>
          )}
          <Table columns={cols} rows={filtered!} />
        </>
      )}
    </AppShell>
  );
}
