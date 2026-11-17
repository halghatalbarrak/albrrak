"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, Card, Button, Select, Badge, EmptyState, Tabs, muddakirTabs, ui, sp } from "@/components/ui";
import { tMuddakir, stageLabel, supervisorLoadLabel } from "@/i18n/ar/muddakir";

interface Hafiz {
  studentId: string; name: string; stage: number;
  supervisorId: string | null; supervisorName: string | null;
}
interface Supervisor { id: string; name: string; load: number; max: number; full: boolean }
interface Payload { canManage: boolean; hafiz: Hafiz[]; supervisors: Supervisor[] }
interface Candidate { userId: string; name: string; memorizedFaces: number }
interface StaffPayload { canAssignManager: boolean; supervisorCandidates: Candidate[]; assignableUsers: { id: string; name: string }[] }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function MuddakirSupervisorsPage() {
  const { me } = useMe();
  const [data, setData] = useState<Payload | null>(null);
  const [staffData, setStaffData] = useState<StaffPayload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const [res, staffRes] = await Promise.all([
        fetch("/api/muddakir", { headers: { authorization: `Bearer ${t}` } }),
        fetch("/api/muddakir/staff", { headers: { authorization: `Bearer ${t}` } }),
      ]);
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      setData((await res.json()) as Payload);
      if (staffRes.ok) setStaffData((await staffRes.json()) as StaffPayload);
      setStatus("ready");
    } catch { setStatus("error"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function assignSupervisor() {
    if (!assignUserId) return;
    setMsg(null);
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch("/api/muddakir/staff", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify({ action: "assign", userId: assignUserId, role: "SUPERVISOR" }) });
    if (res.ok) { setMsg(tMuddakir("supervisorAssigned")); setAssignUserId(""); await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? tMuddakir("genericError")); }
  }

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>{tMuddakir("needLogin")}</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>{tMuddakir("login")}</a>
      </main>
    );

  const candidates = staffData?.supervisorCandidates ?? [];

  return (
    <AppShell roles={me?.roles ?? []} muddakirStaff={me?.muddakirStaff ?? []} userName={me?.name}
      activeHref="/admin/muddakir/supervisors"
      title={tMuddakir("colSupervisor")}
      crumbs={[{ label: tMuddakir("crumbHome"), href: "/" }, { label: tMuddakir("crumbAdmin") }, { label: tMuddakir("colSupervisor") }]}>
      {(me?.roles ?? []).some((r) => r === "SUPER_ADMIN" || r === "CIRCLE_MANAGER") && <Tabs items={muddakirTabs} />}

      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {status === "loading" && <p style={{ color: ui.color.muted }}>{tMuddakir("loading")}</p>}
      {status === "error" && <p style={{ color: ui.color.danger }}>{tMuddakir("loadFailed")} <Button variant="ghost" size="sm" onClick={() => void load()}>{tMuddakir("retry")}</Button></p>}

      {/* تعيين مشرف جديد (للمدير فقط — staffData يظهر إن كان للمستخدم manage) */}
      {staffData && (
        <Card style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap", padding: sp(3), marginBottom: sp(3) }}>
          <Select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} style={{ width: "auto", minWidth: 240 }} aria-label={tMuddakir("halfQuranSuggestion")}>
            <option value="">— {tMuddakir("halfQuranSuggestion")} —</option>
            {candidates.map((c) => <option key={c.userId} value={c.userId}>{c.name} ({arNum(c.memorizedFaces)})</option>)}
          </Select>
          <Button type="button" size="sm" disabled={!assignUserId} onClick={() => void assignSupervisor()}>
            {tMuddakir("assignSupervisorBtn")}
          </Button>
          {candidates.length === 0 && <span style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{tMuddakir("noSupervisorCandidates")}</span>}
        </Card>
      )}

      {status === "ready" && data && (
        data.supervisors.length === 0 ? <EmptyState title={tMuddakir("noSupervisors")} /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
            {data.supervisors.map((s) => {
              const assigned = data.hafiz.filter((h) => h.supervisorId === s.id);
              return (
                <Card key={s.id} style={{ padding: sp(3) }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: sp(2), marginBottom: sp(2) }}>
                    <strong style={{ fontSize: ui.text.base }}>{s.name}</strong>
                    <div style={{ display: "flex", gap: sp(2), alignItems: "center" }}>
                      <Badge tone={s.full ? "danger" : "success"}>{supervisorLoadLabel(s.load, s.max)}</Badge>
                      {s.full && <Badge tone="danger">{tMuddakir("supervisorFull")}</Badge>}
                    </div>
                  </div>
                  {assigned.length === 0 ? (
                    <p style={{ margin: 0, fontSize: ui.text.xs, color: ui.color.muted }}>{tMuddakir("noHafizYet")}</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
                      {assigned.map((h) => (
                        <div key={h.studentId} style={{ display: "flex", justifyContent: "space-between", padding: `${sp(1)} 0`, borderBottom: `1px solid ${ui.color.border}`, fontSize: ui.text.xs }}>
                          <span>{h.name}</span>
                          <span style={{ color: ui.color.muted }}>{stageLabel(h.stage)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p style={{ margin: `${sp(1)} 0 0`, fontSize: ui.text.xs, color: ui.color.muted }}>{`${supervisorLoadLabel(assigned.length, s.max)} ${tMuddakir("colHafiz")}`}</p>
                </Card>
              );
            })}
          </div>
        )
      )}
    </AppShell>
  );
}
