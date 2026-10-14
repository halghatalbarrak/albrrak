"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Badge, EmptyState, Skeleton, Modal, Field, inputStyle, Table, ui, sp, type Column } from "@/components/ui";
import { tStudents as t } from "@/i18n/ar/students";

// رابطٌ بمظهر زرٍّ خفيف (للتنقّل — Button زرٌّ لا رابط).
const linkBtn: React.CSSProperties = { fontSize: ui.text.xs, fontWeight: 600, color: ui.color.primary, textDecoration: "none", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md, padding: `${sp(1.5)} ${sp(2.5)}` };

interface Row {
  id: string;
  name: string;
  age: number | null;
  state: string;
  circle: string | null;
  guardian: string | null;
  pendingPlacementId: string | null;
}
interface Circle {
  id: string;
  nameAr: string;
  programKey: string;
}

const STATE_AR: Record<string, string> = {
  APPLIED: t("stateApplied"), PENDING_ACCEPTANCE: t("statePendingAcceptance"), WAITLISTED: t("stateWaitlisted"), REJECTED: t("stateRejected"),
  AWAITING_READING_TEST: t("stateAwaitingReadingTest"), IN_QAIDAH: t("stateInQaidah"), AWAITING_PACE_TEST: t("stateAwaitingPaceTest"),
  PACE_RETEST_SCHEDULED: t("statePaceRetestScheduled"), IN_MARAQI: t("stateInMaraqi"), COMPLETED: t("stateCompleted"), WITHDRAWN: t("stateWithdrawn"),
};

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

function ReadingTestForm({ studentId, qaidahCircles, onDone }: { studentId: string; qaidahCircles: Circle[]; onDone: () => void }) {
  const [fluent, setFluent] = useState(false);
  const [notes, setNotes] = useState("");
  const [circleId, setCircleId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr(null);
    const tok = await token();
    if (!tok) return;
    const res = await fetch(`/api/students/${studentId}/reading-test`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ readsFluently: fluent, notes, circleId: fluent ? undefined : circleId }),
    });
    setBusy(false);
    if (res.status === 201) onDone();
    else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? t("readingTestFailed"));
    }
  }

  return (
    <div>
      <label style={{ display: "block", marginBottom: sp(3) }}>
        <input type="checkbox" checked={fluent} onChange={(e) => setFluent(e.target.checked)} /> {t("readsFluently")}
        <span style={{ color: ui.color.muted }}> ({fluent ? t("toPaceTest") : t("toQaidahCircle")})</span>
      </label>
      {!fluent && (
        <Field label={t("qaidahCircleLabel")}>
          <Select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
            <option value="">{t("chooseEllipsis")}</option>
            {qaidahCircles.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
          </Select>
        </Field>
      )}
      <Field label={t("examinerNotes")}>
        <textarea style={{ ...inputStyle, minHeight: 64 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <p style={{ color: ui.color.danger, margin: "4px 0" }}>{err}</p>}
      <Button disabled={busy || !notes.trim() || (!fluent && !circleId)} onClick={() => void submit()}>
        {busy ? "…" : t("submitForApproval")}
      </Button>
    </div>
  );
}

export default function AdminStudentsPage() {
  const { me } = useMe();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [testFor, setTestFor] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const tok = await token();
    if (!tok) {
      window.location.href = "/login";
      return;
    }
    const auth = { authorization: `Bearer ${tok}` };
    try {
      const [meRes, stRes, ciRes] = await Promise.all([
        fetch("/api/me", { headers: auth }),
        fetch("/api/admin/students", { headers: auth }),
        fetch("/api/admin/circles", { headers: auth }),
      ]);
      if (meRes.ok) {
        const data = (await meRes.json().catch(() => ({}))) as { roles?: string[] };
        setRoles(Array.isArray(data.roles) ? data.roles : []);
      }
      if (stRes.status === 403) { setErr(t("noPermissionStaff")); return; }
      if (!stRes.ok) { setErr(t("fetchStudentsFailed")); return; }
      const data = (await stRes.json().catch(() => ({}))) as { students?: Row[] };
      setRows(Array.isArray(data.students) ? data.students : []);
      if (ciRes.ok) {
        const cd = (await ciRes.json().catch(() => ({}))) as { circles?: Circle[] };
        setCircles(Array.isArray(cd.circles) ? cd.circles : []);
      }
    } catch {
      setErr(t("connectFailed"));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function revealId(id: string) {
    const tok = await token();
    if (!tok) return;
    const res = await fetch(`/api/students/${id}/reveal-id`, { method: "POST", headers: { authorization: `Bearer ${tok}` } });
    if (res.ok) {
      const { nationalId } = (await res.json()) as { nationalId: string };
      setRevealed((r) => ({ ...r, [id]: nationalId }));
    } else setErr(t("revealIdFailed"));
  }

  async function decide(approvalId: string, decision: "APPROVED" | "REJECTED") {
    const tok = await token();
    if (!tok) return;
    let note: string | undefined;
    if (decision === "REJECTED") {
      note = window.prompt(t("rejectReasonPrompt")) ?? "";
      if (!note.trim()) return;
    }
    const res = await fetch(`/api/placements/${approvalId}/decision`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) void load();
    else setErr(t("decideFailed"));
  }

  const canReveal = roles.includes("REGISTRAR") || roles.includes("SUPER_ADMIN");
  const canRecord = roles.includes("REGISTRAR") || roles.includes("SUPER_ADMIN");
  const canApprove = roles.includes("CIRCLE_MANAGER") || roles.includes("SUPER_ADMIN");
  const qaidahCircles = circles.filter((c) => c.programKey === "QAIDAH_MADANIYYAH");
  const pendingCount = rows?.filter((r) => r.pendingPlacementId).length ?? 0;

  const cols: Column<Row>[] = [
    { key: "name", header: t("colName"), cell: (r) => <strong>{r.name}</strong> },
    { key: "state", header: t("colState"), cell: (r) => <Badge tone={r.pendingPlacementId ? "bronze" : "neutral"}>{STATE_AR[r.state] ?? r.state}</Badge> },
    { key: "age", header: t("colAge"), cell: (r) => (r.age != null ? String(r.age) : "—") },
    { key: "circle", header: t("colCircle"), cell: (r) => r.circle ?? t("notAssigned") },
    { key: "guardian", header: t("colGuardian"), cell: (r) => r.guardian ?? "—" },
    {
      key: "actions", header: t("colActions"), cell: (r) => (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", justifyContent: "flex-end" }}>
          {r.pendingPlacementId && canApprove && (
            <>
              <Button size="sm" onClick={() => decide(r.pendingPlacementId as string, "APPROVED")}>{t("approve")}</Button>
              <Button variant="danger" size="sm" onClick={() => decide(r.pendingPlacementId as string, "REJECTED")}>{t("reject")}</Button>
            </>
          )}
          {r.state === "AWAITING_READING_TEST" && !r.pendingPlacementId && canRecord && (
            <Button variant="bronze" size="sm" onClick={() => setTestFor(r)}>{t("readingTest")}</Button>
          )}
          <Link href={`/admin/students/${r.id}/weakness`} style={linkBtn}>{t("weaknessMap")}</Link>
          <Link href={`/admin/students/${r.id}/placement`} style={linkBtn}>{t("placement")}</Link>
          {canReveal && <Button variant="ghost" size="sm" onClick={() => revealId(r.id)}>{revealed[r.id] ? `${t("idPrefix")} ${revealed[r.id]}` : t("revealId")}</Button>}
        </div>
      ),
    },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/students"
      title={`${t("acceptedStudents")}${rows ? ` (${rows.length})` : ""}`}
      crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbStudents") }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !rows && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={44} />)}
        </div>
      )}
      {rows && rows.length === 0 && <EmptyState title={t("noAcceptedStudents")} />}

      {rows && rows.length > 0 && (
        <>
          {pendingCount > 0 && canApprove && (
            <Card style={{ marginBottom: sp(4), borderInlineStart: `4px solid ${ui.color.bronze}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3), flexWrap: "wrap" }}>
              <span><strong>{pendingCount}</strong>{t("pendingStudentsSuffix")}</span>
              <Badge tone="bronze">{t("pendingDecisionsBadge")}</Badge>
            </Card>
          )}
          <Table columns={cols} rows={rows} />
        </>
      )}

      <Modal open={testFor !== null} onClose={() => setTestFor(null)} title={`${t("readingTestModalPrefix")}${testFor?.name ?? ""}`}>
        {testFor && <ReadingTestForm studentId={testFor.id} qaidahCircles={qaidahCircles} onDone={() => { setTestFor(null); void load(); }} />}
      </Modal>
    </AppShell>
  );
}
