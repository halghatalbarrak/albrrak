"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, Card, Button, Badge, EmptyState, Tabs, muddakirTabs, ui, sp } from "@/components/ui";
import { tMuddakir, stageLabel, supervisorLoadLabel } from "@/i18n/ar/muddakir";

interface Hafiz {
  studentId: string; name: string; stage: number;
  supervisorId: string | null; supervisorName: string | null;
}
interface Supervisor { id: string; name: string; load: number; max: number; full: boolean }
interface Payload { canManage: boolean; hafiz: Hafiz[]; supervisors: Supervisor[] }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function MuddakirSupervisorsPage() {
  const { me } = useMe();
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch("/api/muddakir", { headers: { authorization: `Bearer ${t}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      setData((await res.json()) as Payload);
      setStatus("ready");
    } catch { setStatus("error"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>{tMuddakir("needLogin")}</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>{tMuddakir("login")}</a>
      </main>
    );

  return (
    <AppShell roles={me?.roles ?? []} muddakirStaff={me?.muddakirStaff ?? []} userName={me?.name}
      activeHref="/admin/muddakir/supervisors"
      title={tMuddakir("colSupervisor")}
      crumbs={[{ label: tMuddakir("crumbHome"), href: "/" }, { label: tMuddakir("crumbAdmin") }, { label: tMuddakir("colSupervisor") }]}>
      {(me?.roles ?? []).some((r) => r === "SUPER_ADMIN" || r === "CIRCLE_MANAGER") && <Tabs items={muddakirTabs} />}

      {status === "loading" && <p style={{ color: ui.color.muted }}>{tMuddakir("loading")}</p>}
      {status === "error" && <p style={{ color: ui.color.danger }}>{tMuddakir("loadFailed")} <Button variant="ghost" size="sm" onClick={() => void load()}>{tMuddakir("retry")}</Button></p>}

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
                  {arNum(assigned.length)} / {arNum(s.max)} {tMuddakir("colHafiz")}
                </Card>
              );
            })}
          </div>
        )
      )}
    </AppShell>
  );
}
