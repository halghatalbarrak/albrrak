"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Badge, EmptyState, Skeleton, Modal, Field, inputStyle, Table, ui, sp, type Column } from "@/components/ui";

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
  APPLIED: "مُقدَّم", PENDING_ACCEPTANCE: "بانتظار القبول", WAITLISTED: "قائمة الانتظار", REJECTED: "مرفوض",
  AWAITING_READING_TEST: "بانتظار اختبار القراءة", IN_QAIDAH: "في القاعدة المدنية", AWAITING_PACE_TEST: "بانتظار اختبار المقطع",
  PACE_RETEST_SCHEDULED: "إعادة اختبار المقطع", IN_MARAQI: "في المراقي", COMPLETED: "أتمّ", WITHDRAWN: "منسحب",
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
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${studentId}/reading-test`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ readsFluently: fluent, notes, circleId: fluent ? undefined : circleId }),
    });
    setBusy(false);
    if (res.status === 201) onDone();
    else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "تعذّر تسجيل الاختبار.");
    }
  }

  return (
    <div>
      <label style={{ display: "block", marginBottom: sp(3) }}>
        <input type="checkbox" checked={fluent} onChange={(e) => setFluent(e.target.checked)} /> يجيد القراءة نظراً
        <span style={{ color: ui.color.muted }}> ({fluent ? "← بانتظار اختبار المقطع" : "← القاعدة المدنية + حلقة"})</span>
      </label>
      {!fluent && (
        <Field label="حلقة القاعدة المدنية">
          <Select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
            <option value="">اختر…</option>
            {qaidahCircles.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
          </Select>
        </Field>
      )}
      <Field label="ملاحظات المختبِر">
        <textarea style={{ ...inputStyle, minHeight: 64 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <p style={{ color: ui.color.danger, margin: "4px 0" }}>{err}</p>}
      <Button disabled={busy || !notes.trim() || (!fluent && !circleId)} onClick={() => void submit()}>
        {busy ? "…" : "رفع القرار للاعتماد"}
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
    const t = await token();
    if (!t) {
      window.location.href = "/login";
      return;
    }
    const auth = { authorization: `Bearer ${t}` };
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
      if (stRes.status === 403) { setErr("لا صلاحية — هذه الشاشة للكادر الإداري."); return; }
      if (!stRes.ok) { setErr("تعذّر جلب الطلاب."); return; }
      const data = (await stRes.json().catch(() => ({}))) as { students?: Row[] };
      setRows(Array.isArray(data.students) ? data.students : []);
      if (ciRes.ok) {
        const cd = (await ciRes.json().catch(() => ({}))) as { circles?: Circle[] };
        setCircles(Array.isArray(cd.circles) ? cd.circles : []);
      }
    } catch {
      setErr("تعذّر الاتصال بالخادم.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function revealId(id: string) {
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${id}/reveal-id`, { method: "POST", headers: { authorization: `Bearer ${t}` } });
    if (res.ok) {
      const { nationalId } = (await res.json()) as { nationalId: string };
      setRevealed((r) => ({ ...r, [id]: nationalId }));
    } else setErr("تعذّر كشف رقم الهوية.");
  }

  async function decide(approvalId: string, decision: "APPROVED" | "REJECTED") {
    const t = await token();
    if (!t) return;
    let note: string | undefined;
    if (decision === "REJECTED") {
      note = window.prompt("سبب الرفض (إلزامي):") ?? "";
      if (!note.trim()) return;
    }
    const res = await fetch(`/api/placements/${approvalId}/decision`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) void load();
    else setErr("تعذّر تنفيذ القرار.");
  }

  const canReveal = roles.includes("REGISTRAR") || roles.includes("SUPER_ADMIN");
  const canRecord = roles.includes("REGISTRAR") || roles.includes("SUPER_ADMIN");
  const canApprove = roles.includes("CIRCLE_MANAGER") || roles.includes("SUPER_ADMIN");
  const qaidahCircles = circles.filter((c) => c.programKey === "QAIDAH_MADANIYYAH");
  const pendingCount = rows?.filter((r) => r.pendingPlacementId).length ?? 0;

  const cols: Column<Row>[] = [
    { key: "name", header: "الاسم", cell: (r) => <strong>{r.name}</strong> },
    { key: "state", header: "الحالة", cell: (r) => <Badge tone={r.pendingPlacementId ? "bronze" : "neutral"}>{STATE_AR[r.state] ?? r.state}</Badge> },
    { key: "age", header: "العمر", cell: (r) => (r.age != null ? String(r.age) : "—") },
    { key: "circle", header: "الحلقة", cell: (r) => r.circle ?? "لم تُسنَد" },
    { key: "guardian", header: "ولي الأمر", cell: (r) => r.guardian ?? "—" },
    {
      key: "actions", header: "إجراءات", cell: (r) => (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", justifyContent: "flex-end" }}>
          {r.pendingPlacementId && canApprove && (
            <>
              <Button size="sm" onClick={() => decide(r.pendingPlacementId as string, "APPROVED")}>اعتمِد</Button>
              <Button variant="danger" size="sm" onClick={() => decide(r.pendingPlacementId as string, "REJECTED")}>ارفض</Button>
            </>
          )}
          {r.state === "AWAITING_READING_TEST" && !r.pendingPlacementId && canRecord && (
            <Button variant="bronze" size="sm" onClick={() => setTestFor(r)}>اختبار القراءة</Button>
          )}
          <Link href={`/admin/students/${r.id}/weakness`} style={linkBtn}>الخريطة</Link>
          {canReveal && <Button variant="ghost" size="sm" onClick={() => revealId(r.id)}>{revealed[r.id] ? `الهوية: ${revealed[r.id]}` : "كشف الهوية"}</Button>}
        </div>
      ),
    },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/students"
      title={`الطلاب المقبولون${rows ? ` (${rows.length})` : ""}`}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "الطلاب" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !rows && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={44} />)}
        </div>
      )}
      {rows && rows.length === 0 && <EmptyState title="لا طلاب مقبولون بعد" />}

      {rows && rows.length > 0 && (
        <>
          {pendingCount > 0 && canApprove && (
            <Card style={{ marginBottom: sp(4), borderInlineStart: `4px solid ${ui.color.bronze}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3), flexWrap: "wrap" }}>
              <span><strong>{pendingCount}</strong> طالبٍ بانتظار اعتماد تحديدك — راجِعهم.</span>
              <Badge tone="bronze">قرارات تحديدٍ معلّقة</Badge>
            </Card>
          )}
          <Table columns={cols} rows={rows} />
        </>
      )}

      <Modal open={testFor !== null} onClose={() => setTestFor(null)} title={`اختبار القراءة — ${testFor?.name ?? ""}`}>
        {testFor && <ReadingTestForm studentId={testFor.id} qaidahCircles={qaidahCircles} onDone={() => { setTestFor(null); void load(); }} />}
      </Modal>
    </AppShell>
  );
}
