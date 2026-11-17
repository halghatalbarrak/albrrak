"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Badge, EmptyState, Tabs, muddakirTabs, ui, sp } from "@/components/ui";
import { tMuddakir } from "@/i18n/ar/muddakir";

type StaffRole = "MANAGER" | "ADMIN" | "SUPERVISOR" | "EXAMINER";
interface StaffRow { userId: string; name: string; role: StaffRole }
interface Payload { canAssignManager: boolean; staff: StaffRow[] }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function MuddakirExaminersPage() {
  const { me } = useMe();
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch("/api/muddakir/staff", { headers: { authorization: `Bearer ${t}` } });
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

  const examiners = data?.staff.filter((s) => s.role === "EXAMINER") ?? [];

  return (
    <AppShell roles={me?.roles ?? []} muddakirStaff={me?.muddakirStaff ?? []} userName={me?.name}
      activeHref="/admin/muddakir/examiners"
      title={tMuddakir("staffExaminer")}
      crumbs={[{ label: tMuddakir("crumbHome"), href: "/" }, { label: tMuddakir("crumbAdmin") }, { label: tMuddakir("staffExaminer") }]}>
      {(me?.roles ?? []).some((r) => r === "SUPER_ADMIN" || r === "CIRCLE_MANAGER") && <Tabs items={muddakirTabs} />}

      {status === "loading" && <p style={{ color: ui.color.muted }}>{tMuddakir("loading")}</p>}
      {status === "error" && <p style={{ color: ui.color.danger }}>{tMuddakir("loadFailed")} <Button variant="ghost" size="sm" onClick={() => void load()}>{tMuddakir("retry")}</Button></p>}

      {status === "ready" && (
        examiners.length === 0 ? (
          <EmptyState title={tMuddakir("staffNone")} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
            {examiners.map((s) => (
              <Card key={s.userId} style={{ padding: `${sp(2)} ${sp(3)}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: ui.text.base }}>{s.name}</strong>
                <Badge tone="neutral">{tMuddakir("staffExaminer")}</Badge>
              </Card>
            ))}
          </div>
        )
      )}
    </AppShell>
  );
}
