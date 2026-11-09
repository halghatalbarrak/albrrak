"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Badge, EmptyState, EmptyAction, Skeleton, Modal, Field, inputStyle, Table, ListToolbar, ui, sp, type Column } from "@/components/ui";
import { normalizeArabic } from "@/lib/normalize-arabic";
import { tStudents as t } from "@/i18n/ar/students";

// رابطٌ بمظهر زرٍّ خفيف (للتنقّل — Button زرٌّ لا رابط).
const linkBtn: React.CSSProperties = { fontSize: ui.text.xs, fontWeight: 600, color: ui.color.primary, textDecoration: "none", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md, padding: `${sp(1.5)} ${sp(2.5)}` };

function DeleteStudentCell({ studentId, onDeleted }: { studentId: string; onDeleted: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rowErr, setRowErr] = useState<string | null>(null);

  async function doDelete() {
    setDeleting(true);
    const tok = await token();
    if (!tok) { setDeleting(false); return; }
    const res = await fetch(`/api/admin/students/${studentId}`, {
      method: "DELETE", headers: { authorization: `Bearer ${tok}` },
    });
    if (res.status === 204) { onDeleted(studentId); return; }
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setRowErr(j.error ?? t("errDeleteStudent"));
    setDeleting(false);
    setConfirming(false);
  }

  if (confirming) {
    return (
      <div style={{ display: "flex", gap: sp(1), alignItems: "center" }}>
        <Button size="sm" variant="danger" disabled={deleting} onClick={() => void doDelete()}>
          {deleting ? "…" : t("deleteConfirmBtn")}
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

interface Row {
  id: string;
  name: string;
  age: number | null;
  state: string;
  gender: string;
  circle: string | null;
  guardian: string | null;
  pendingPlacementId: string | null;
  enrollmentId: string | null;
  suspendedAt: string | null;
}
interface Circle {
  id: string;
  nameAr: string;
  programKey: string;
  gender?: string;
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

function ActionModals({
  row,
  circles,
  onClose,
  onDone,
}: {
  row: Row & { _modal: "transfer" | "suspend" | "expel" };
  circles: Circle[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [circleId, setCircleId] = useState("");
  const [reason, setReason] = useState("");
  const [returnAt, setReturnAt] = useState("");
  const [expelConfirmed, setExpelConfirmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function execute(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const tok = await token();
    if (!tok) return;
    const res = await fetch(`/api/admin/students/${row.id}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok || res.status === 204) { onClose(); onDone(); return; }
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setErr(j.error ?? t("actionFailed"));
  }

  const compatibleCircles = circles.filter((c) => !c.gender || c.gender === row.gender);

  if (row._modal === "transfer") {
    return (
      <Modal open onClose={onClose} title={`${t("transferModalTitle")} — ${row.name}`}>
        <Field label={t("transferCircleLabel")}>
          <Select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
            <option value="">{t("chooseEllipsis")}</option>
            {compatibleCircles.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
          </Select>
        </Field>
        {err && <p style={{ color: ui.color.danger, margin: "4px 0" }}>{err}</p>}
        <div style={{ display: "flex", gap: sp(2), marginTop: sp(3) }}>
          <Button disabled={busy || !circleId} onClick={() => void execute({ action: "transfer", circleId })}>
            {busy ? "…" : t("transferConfirmBtn")}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t("modalCancelBtn")}</Button>
        </div>
      </Modal>
    );
  }

  if (row._modal === "suspend") {
    return (
      <Modal open onClose={onClose} title={`${t("suspendModalTitle")} — ${row.name}`}>
        <Field label={t("suspendReasonLabel")}>
          <textarea style={{ ...inputStyle, minHeight: 64 }} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field label={t("suspendReturnLabel")}>
          <input type="date" style={inputStyle} value={returnAt} onChange={(e) => setReturnAt(e.target.value)} />
        </Field>
        {err && <p style={{ color: ui.color.danger, margin: "4px 0" }}>{err}</p>}
        <div style={{ display: "flex", gap: sp(2), marginTop: sp(3) }}>
          <Button disabled={busy || !reason.trim()} onClick={() => void execute({ action: "suspend", reason, returnAt: returnAt || undefined })}>
            {busy ? "…" : t("suspendConfirmBtn")}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t("modalCancelBtn")}</Button>
        </div>
      </Modal>
    );
  }

  // expel
  return (
    <Modal open onClose={onClose} title={`${t("expelModalTitle")} — ${row.name}`}>
      <Field label={t("expelReasonLabel")}>
        <textarea style={{ ...inputStyle, minHeight: 64 }} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: sp(2), marginTop: sp(2) }}>
        <input type="checkbox" checked={expelConfirmed} onChange={(e) => setExpelConfirmed(e.target.checked)} />
        {t("expelConfirmLabel")}
      </label>
      {err && <p style={{ color: ui.color.danger, margin: "4px 0" }}>{err}</p>}
      <div style={{ display: "flex", gap: sp(2), marginTop: sp(3) }}>
        <Button variant="danger" disabled={busy || !reason.trim() || !expelConfirmed} onClick={() => void execute({ action: "expel", reason })}>
          {busy ? "…" : t("expelConfirmBtn")}
        </Button>
        <Button variant="ghost" onClick={onClose}>{t("modalCancelBtn")}</Button>
      </div>
    </Modal>
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
  const [actionFor, setActionFor] = useState<(Row & { _modal: "transfer" | "suspend" | "expel" }) | null>(null);
  const [showExpelled, setShowExpelled] = useState(false);
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterCircle, setFilterCircle] = useState("");
  const [filterGuardian, setFilterGuardian] = useState("");

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

  async function resumeAction(studentId: string) {
    const tok = await token();
    if (!tok) return;
    const res = await fetch(`/api/admin/students/${studentId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ action: "resume" }),
    });
    if (res.ok || res.status === 204) void load();
    else setErr(t("actionFailed"));
  }

  const canReveal = roles.includes("REGISTRAR") || roles.includes("SUPER_ADMIN");
  const canRecord = roles.includes("REGISTRAR") || roles.includes("SUPER_ADMIN");
  const canApprove = roles.includes("CIRCLE_MANAGER") || roles.includes("SUPER_ADMIN");
  const canAct = roles.includes("CIRCLE_MANAGER") || roles.includes("SUPER_ADMIN");
  const qaidahCircles = circles;
  const pendingCount = rows?.filter((r) => r.pendingPlacementId).length ?? 0;

  const visibleRows = rows?.filter((r) => {
    if (showExpelled ? r.state !== "WITHDRAWN" : r.state === "WITHDRAWN") return false;
    if (filterState && r.state !== filterState) return false;
    if (filterCircle && r.circle !== filterCircle) return false;
    if (filterGuardian === "has" && !r.guardian) return false;
    if (filterGuardian === "none" && r.guardian) return false;
    if (search) {
      const q = normalizeArabic(search);
      if (!normalizeArabic(r.name).includes(q)) return false;
    }
    return true;
  }) ?? null;

  const cols: Column<Row>[] = [
    { key: "name", header: t("colName"), cell: (r) => <strong>{r.name}</strong> },
    {
      key: "state", header: t("colState"), cell: (r) => (
        <div style={{ display: "flex", gap: sp(1), flexWrap: "wrap" }}>
          <Badge tone={r.pendingPlacementId ? "bronze" : "neutral"}>{STATE_AR[r.state] ?? r.state}</Badge>
          {r.suspendedAt && <Badge tone="bronze">{t("stateSuspended")}</Badge>}
        </div>
      ),
    },
    { key: "age", header: t("colAge"), cell: (r) => (r.age != null ? String(r.age) : "—") },
    {
      key: "circle", header: t("colCircle"), cell: (r) => (
        r.circle
          ? r.circle
          : <EmptyAction message={t("notAssigned")} actionLabel={t("enrollActionBtn")} href={`/admin/students/${r.id}/placement`} />
      ),
    },
    {
      key: "guardian", header: t("colGuardian"), cell: (r) => (
        r.guardian
          ? r.guardian
          : <EmptyAction message={t("noGuardianMsg")} actionLabel={t("linkGuardianBtn")} href="/admin/users/new" />
      ),
    },
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
          {canAct && r.enrollmentId && r.state !== "WITHDRAWN" && (
            <>
              {!r.suspendedAt ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setActionFor({ ...r, _modal: "transfer" })}>{t("transferBtn")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setActionFor({ ...r, _modal: "suspend" })}>{t("suspendBtn")}</Button>
                  <Button size="sm" variant="danger" onClick={() => setActionFor({ ...r, _modal: "expel" })}>{t("expelBtn")}</Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => void resumeAction(r.id)}>{t("resumeBtn")}</Button>
              )}
            </>
          )}
          <Link href={`/admin/students/${r.id}/weakness`} style={linkBtn}>{t("weaknessMap")}</Link>
          <Link href={`/admin/students/${r.id}/placement`} style={linkBtn}>{t("placement")}</Link>
          {canReveal && <Button variant="ghost" size="sm" onClick={() => revealId(r.id)}>{revealed[r.id] ? `${t("idPrefix")} ${revealed[r.id]}` : t("revealId")}</Button>}
          {canAct && !r.enrollmentId && r.state === "WITHDRAWN" && (
            <DeleteStudentCell studentId={r.id} onDeleted={(id) => setRows((prev) => prev?.filter((s) => s.id !== id) ?? null)} />
          )}
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
          <ListToolbar value={search} onChange={setSearch} placeholder={t("searchPlaceholder")}>
            <Select value={filterState} onChange={(e) => setFilterState(e.target.value)} style={{ flex: "0 0 auto" }}>
              <option value="">{t("allStates")}</option>
              {Object.entries(STATE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select value={filterCircle} onChange={(e) => setFilterCircle(e.target.value)} style={{ flex: "0 0 auto" }}>
              <option value="">{t("allCircles")}</option>
              {circles.map((c) => <option key={c.id} value={c.nameAr}>{c.nameAr}</option>)}
            </Select>
            <Select value={filterGuardian} onChange={(e) => setFilterGuardian(e.target.value)} style={{ flex: "0 0 auto" }}>
              <option value="">{t("allGuardians")}</option>
              <option value="has">{t("hasGuardian")}</option>
              <option value="none">{t("noGuardian")}</option>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => setShowExpelled((v) => !v)}>
              {showExpelled ? t("hideExpelled") : t("showExpelled")}
            </Button>
          </ListToolbar>
          {visibleRows && visibleRows.length > 0
            ? <Table columns={cols} rows={visibleRows} />
            : <EmptyState title={t("noAcceptedStudents")} />}
        </>
      )}

      <Modal open={testFor !== null} onClose={() => setTestFor(null)} title={`${t("readingTestModalPrefix")}${testFor?.name ?? ""}`}>
        {testFor && <ReadingTestForm studentId={testFor.id} qaidahCircles={qaidahCircles} onDone={() => { setTestFor(null); void load(); }} />}
      </Modal>

      {actionFor && (
        <ActionModals
          row={actionFor}
          circles={circles}
          onClose={() => setActionFor(null)}
          onDone={() => void load()}
        />
      )}
    </AppShell>
  );
}
