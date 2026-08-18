"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Badge, EmptyState, Skeleton, ui, sp } from "@/components/ui";
import { hijri } from "@/lib/format";

interface Msg { id: string; studentName: string; kind: string; subject: string; body: string; createdAt: string; read: boolean }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function MessagesPage() {
  const { me } = useMe();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch("/api/messages", { headers: { authorization: `Bearer ${t}` } });
    if (res.ok) setMsgs(((await res.json()) as { messages?: Msg[] }).messages ?? []);
    else setMsgs([]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function openMsg(m: Msg) {
    setOpen((o) => (o === m.id ? null : m.id));
    if (!m.read) {
      const t = await token();
      if (t) { await fetch("/api/messages", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify({ id: m.id }) }); void load(); }
    }
  }

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/messages"
      title="الرسائل" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "التعلّم" }, { label: "الرسائل" }]}>

      {!msgs && <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>{[0, 1].map((i) => <Skeleton key={i} height={64} />)}</div>}
      {msgs && msgs.length === 0 && <EmptyState title="لا رسائل بعد" description="تصلكم تقارير الأسبوع وتنبيهات الغياب هنا بإذن الله." />}

      {msgs && msgs.map((m) => (
        <Card key={m.id} style={{ marginBottom: sp(3), padding: 0, overflow: "hidden" }}>
          <button onClick={() => void openMsg(m)}
            style={{ width: "100%", textAlign: "start", background: "transparent", border: "none", cursor: "pointer", fontFamily: ui.font, color: ui.color.text, padding: sp(4), display: "flex", flexDirection: "column", gap: sp(1) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), flexWrap: "wrap" }}>
              <strong style={{ fontSize: ui.text.base }}>{m.subject}</strong>
              <div style={{ display: "flex", gap: sp(2), alignItems: "center" }}>
                {!m.read && <Badge tone="bronze">جديدة</Badge>}
                {m.kind === "ABSENCE_UNEXCUSED" && <Badge tone="danger">غياب</Badge>}
              </div>
            </div>
            <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{m.studentName} · {hijri(m.createdAt.slice(0, 10))}</span>
          </button>
          {open === m.id && (
            <div style={{ borderTop: `1px solid ${ui.color.border}`, padding: sp(4), background: ui.color.bg, whiteSpace: "pre-wrap", lineHeight: 1.9, fontSize: ui.text.base }}>
              {m.body}
            </div>
          )}
        </Card>
      ))}
    </AppShell>
  );
}
