"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, Card, Button, Badge, EmptyState, Tabs, muddakirTabs, ui, sp } from "@/components/ui";
import { tMuddakir, stageLabel } from "@/i18n/ar/muddakir";

interface Hafiz {
  studentId: string; name: string; stage: number;
  supervisorId: string | null; supervisorName: string | null;
}
interface Supervisor { id: string; name: string; load: number; max: number; full: boolean }
interface Payload { canManage: boolean; hafiz: Hafiz[]; supervisors: Supervisor[]; enrollable: { studentId: string; name: string }[] }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function MuddakirOverviewPage() {
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

  const statCard = (label: string, value: number, tone?: "bronze" | "danger") => (
    <Card style={{ padding: sp(4), textAlign: "center", minWidth: 120, flex: "1 1 120px" }}>
      <div style={{ fontSize: "2rem", fontWeight: 800, color: tone === "danger" ? ui.color.danger : tone === "bronze" ? ui.color.bronze : ui.color.primary }}>
        {arNum(value)}
      </div>
      <div style={{ fontSize: ui.text.xs, color: ui.color.muted, marginTop: sp(1) }}>{label}</div>
    </Card>
  );

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>{tMuddakir("needLogin")}</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>{tMuddakir("login")}</a>
      </main>
    );

  const totalHafiz = data?.hafiz.length ?? 0;
  const withoutSupervisor = data?.hafiz.filter((h) => !h.supervisorId).length ?? 0;
  const totalSupervisors = data?.supervisors.length ?? 0;
  const fullSupervisors = data?.supervisors.filter((s) => s.full).length ?? 0;

  const byStage = new Map<number, number>();
  for (const h of data?.hafiz ?? []) byStage.set(h.stage, (byStage.get(h.stage) ?? 0) + 1);

  return (
    <AppShell roles={me?.roles ?? []} muddakirStaff={me?.muddakirStaff ?? []} userName={me?.name}
      activeHref="/admin/muddakir/overview"
      title="مركز إعداد مُدَّكِر"
      crumbs={[{ label: tMuddakir("crumbHome"), href: "/" }, { label: tMuddakir("crumbAdmin") }, { label: "مركز إعداد مُدَّكِر" }]}>
      {(me?.roles ?? []).some((r) => r === "SUPER_ADMIN" || r === "CIRCLE_MANAGER") && <Tabs items={muddakirTabs} />}

      {status === "loading" && <p style={{ color: ui.color.muted }}>{tMuddakir("loading")}</p>}
      {status === "error" && <p style={{ color: ui.color.danger }}>{tMuddakir("loadFailed")} <Button variant="ghost" size="sm" onClick={() => void load()}>{tMuddakir("retry")}</Button></p>}

      {status === "ready" && data && (
        <>
          {/* بطاقات الأرقام */}
          <div style={{ display: "flex", gap: sp(3), flexWrap: "wrap", marginBottom: sp(4) }}>
            {statCard("حفّاظ ملتحقون", totalHafiz)}
            {statCard("بلا مشرف", withoutSupervisor, withoutSupervisor > 0 ? "danger" : undefined)}
            {statCard("مشرفون", totalSupervisors)}
            {statCard("مشرفون ممتلئون", fullSupervisors, fullSupervisors > 0 ? "bronze" : undefined)}
            {statCard("قابلون للالتحاق", data.enrollable.length)}
          </div>

          {/* توزيع الحفّاظ على المراحل */}
          {byStage.size > 0 && (
            <>
              <h2 style={{ fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` }}>توزيع المراحل</h2>
              <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(4) }}>
                {[...byStage.entries()].sort(([a], [b]) => a - b).map(([stage, count]) => (
                  <Badge key={stage} tone="neutral" style={{ fontSize: ui.text.xs, padding: `${sp(1)} ${sp(2)}` }}>
                    {stageLabel(stage)}: {arNum(count)}
                  </Badge>
                ))}
              </div>
            </>
          )}

          {/* الحفّاظ بلا مشرف */}
          {withoutSupervisor > 0 && (
            <>
              <h2 style={{ fontSize: ui.text.base, fontWeight: 700, color: ui.color.danger, margin: `0 0 ${sp(2)}` }}>
                بلا مشرف ({arNum(withoutSupervisor)})
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: sp(1), marginBottom: sp(3) }}>
                {data.hafiz.filter((h) => !h.supervisorId).map((h) => (
                  <Card key={h.studentId} style={{ padding: `${sp(2)} ${sp(3)}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: ui.text.xs }}><strong>{h.name}</strong> — {stageLabel(h.stage)}</span>
                    <a href="/admin/muddakir" style={{ fontSize: ui.text.xs, color: ui.color.primary }}>إسناد ←</a>
                  </Card>
                ))}
              </div>
            </>
          )}

          {totalHafiz === 0 && <EmptyState title={tMuddakir("noHafizYet")} />}
        </>
      )}
    </AppShell>
  );
}
