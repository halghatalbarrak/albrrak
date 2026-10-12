"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, Card, Button, Input, Badge, EmptyState, Skeleton, ui, sp } from "@/components/ui";
import { attendanceLockAr as t } from "@/i18n/ar/attendance-lock";

// شاشة الإدارة لقفل الحضور (المهمّة ٩): مهلة القفل + طلبات الفتح (بتّ) + أيّامٌ لم يعتمدها المعلّم.
// النصوص من i18n، الأرقام مشرقيّة، الاتّجاه RTL. عرضٌ وبتٌّ فقط — لا يمسّ صفوف الحضور مباشرةً.

type LockState = "OPEN" | "APPROVED" | "AUTO_LOCKED" | "TEMP_OPEN";
interface UnlockRequest { approvalId: string; circleId: string; circleName: string; date: string; reason: string; proposedAt: string }
interface UnapprovedDay { circleId: string; circleName: string; date: string; state: LockState }

const LOCK_LABEL: Record<LockState, string> = {
  OPEN: t.stateOpen, APPROVED: t.stateApproved, AUTO_LOCKED: t.stateAutoLocked, TEMP_OPEN: t.stateTempOpen,
};
const LOCK_TONE: Record<LockState, "success" | "danger" | "bronze" | "neutral"> = {
  OPEN: "success", APPROVED: "bronze", AUTO_LOCKED: "danger", TEMP_OPEN: "bronze",
};
const arDate = (iso: string) => iso.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}
const CRUMBS = [{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: t.adminTitle }];

export default function AttendanceLockPage() {
  const { me } = useMe();
  const [requests, setRequests] = useState<UnlockRequest[]>([]);
  const [days, setDays] = useState<UnapprovedDay[]>([]);
  const [grace, setGrace] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const tk = await token(); if (!tk) { setStatus("unauth"); return; }
    const h = { authorization: `Bearer ${tk}` };
    const [rRes, dRes, gRes] = await Promise.all([
      fetch("/api/attendance/unlock-requests", { headers: h }),
      fetch("/api/attendance/unapproved-days", { headers: h }),
      fetch("/api/attendance/lock-grace", { headers: h }),
    ]);
    if (rRes.status === 401 || rRes.status === 403) { setStatus("unauth"); return; }
    if (!rRes.ok || !dRes.ok || !gRes.ok) { setStatus("error"); return; }
    setRequests(((await rRes.json()) as { requests: UnlockRequest[] }).requests);
    setDays(((await dRes.json()) as { days: UnapprovedDay[] }).days);
    setGrace(String(((await gRes.json()) as { graceDays: number }).graceDays));
    setStatus("ready");
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function post(url: string, body: Record<string, unknown>, okMsg: string) {
    setMsg(null);
    const tk = await token(); if (!tk) { setStatus("unauth"); return; }
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tk}` }, body: JSON.stringify(body) });
    if (res.ok) { setMsg(okMsg); await load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setMsg(j.error ?? "تعذّر الإجراء."); }
  }

  const decide = (approvalId: string, decision: "APPROVED" | "REJECTED") => {
    if (decision === "REJECTED") {
      const note = window.prompt(t.rejectReasonPrompt);
      if (!note?.trim()) return;
      void post(`/api/attendance/unlock/${approvalId}/decision`, { decision, note }, t.rejectedOk);
    } else {
      void post(`/api/attendance/unlock/${approvalId}/decision`, { decision }, t.unlockedOk);
    }
  };
  const saveGrace = () => {
    const n = Number(grace);
    if (!Number.isInteger(n) || n < 0) { setMsg("مهلة القفل عددٌ صحيحٌ ≥ ٠."); return; }
    void post("/api/attendance/lock-grace", { graceDays: n }, t.graceSaved);
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/attendance-lock" title={t.adminTitle} crumbs={CRUMBS}>{children}</AppShell>
  );

  if (status === "unauth") return <Shell><p>تحتاج دخولًا كإدارة.</p></Shell>;
  if (status === "loading") return <Shell><Skeleton height={80} /></Shell>;
  if (status === "error") return <Shell><p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" onClick={() => void load()}>إعادة</Button></p></Shell>;

  const th: React.CSSProperties = { textAlign: "start", fontWeight: 700, fontSize: ui.text.xs, color: ui.color.muted, padding: sp(2) };
  const td: React.CSSProperties = { padding: sp(2), fontSize: ui.text.base, borderTop: `1px solid ${ui.color.border}` };

  return (
    <Shell>
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs, marginBottom: sp(3) }}>{msg}</p>}

      {/* مهلة القفل التلقائيّ */}
      <Card style={{ marginBottom: sp(4) }}>
        <h3 style={{ fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` }}>{t.graceTitle}</h3>
        <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: `0 0 ${sp(2)}` }}>{t.graceHint}</p>
        <div style={{ display: "flex", gap: sp(2), alignItems: "center" }}>
          <Input type="number" min={0} value={grace} onChange={(e) => setGrace(e.target.value)} style={{ width: 90 }} />
          <Button size="sm" variant="primary" onClick={saveGrace}>{t.graceSave}</Button>
        </div>
      </Card>

      {/* طلبات الفتح */}
      <Card style={{ marginBottom: sp(4) }}>
        <h3 style={{ fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(3)}` }}>{t.unlockRequestsTitle} {requests.length ? `(${arNum(requests.length)})` : ""}</h3>
        {requests.length === 0 ? <EmptyState title={t.noRequests} />
          : <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>{t.circle}</th><th style={th}>{t.day}</th><th style={th}>{t.reason}</th><th style={th}></th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.approvalId}>
                    <td style={td}>{r.circleName}</td>
                    <td style={td}>{arDate(r.date)}</td>
                    <td style={td}>{r.reason}</td>
                    <td style={{ ...td, display: "flex", gap: sp(2) }}>
                      <Button size="sm" variant="primary" onClick={() => decide(r.approvalId, "APPROVED")}>{t.approve}</Button>
                      <Button size="sm" variant="danger" onClick={() => decide(r.approvalId, "REJECTED")}>{t.reject}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </Card>

      {/* أيّامٌ لم يعتمدها المعلّم */}
      <Card>
        <h3 style={{ fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(3)}` }}>{t.unapprovedTitle} {days.length ? `(${arNum(days.length)})` : ""}</h3>
        {days.length === 0 ? <EmptyState title={t.noUnapproved} />
          : <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>{t.circle}</th><th style={th}>{t.day}</th><th style={th}>{t.state}</th></tr></thead>
              <tbody>
                {days.map((d) => (
                  <tr key={`${d.circleId}:${d.date}`}>
                    <td style={td}>{d.circleName}</td>
                    <td style={td}>{arDate(d.date)}</td>
                    <td style={td}><Badge tone={LOCK_TONE[d.state]}>{LOCK_LABEL[d.state]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </Card>
    </Shell>
  );
}
