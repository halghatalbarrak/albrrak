"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Input, EmptyState, ui, sp } from "@/components/ui";

// لوحة اعتماد المدير (الحكم ٧): اقتراحات انتقال المرحلة والتخرّج المعلَّقة — اعتماد/رفض.
// الاعتماد ← ينتقل الطالب / يتخرّج؛ الرفض يستلزم سببًا.

interface Transition {
  approvalId: string;
  studentName: string;
  mainStageLabel: string;
  finalRank: string | null;
}
interface Graduation {
  approvalId: string;
  studentName: string;
}
const RANK: Record<string, string> = { EXCELLENT: "تميّز", PASS: "اجتياز", FAIL: "رسوب" };

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const sectionTitle: React.CSSProperties = { fontSize: ui.text.lg, fontWeight: 700, marginTop: sp(5) };

export default function ApprovalsPage() {
  const { me } = useMe();
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [graduations, setGraduations] = useState<Graduation[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const headers = { authorization: `Bearer ${t}` };
      const [rt, rg] = await Promise.all([
        fetch("/api/approvals/stage-transitions", { headers }),
        fetch("/api/approvals/graduations", { headers }),
      ]);
      if ([rt.status, rg.status].some((s) => s === 401 || s === 403)) { setStatus("unauth"); return; }
      if (!rt.ok || !rg.ok) { setStatus("error"); return; }
      setTransitions(((await rt.json()) as { items?: Transition[] }).items ?? []);
      setGraduations(((await rg.json()) as { items?: Graduation[] }).items ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(base: string, approvalId: string, decision: "APPROVED" | "REJECTED") {
    setMsg(null);
    const note = notes[approvalId]?.trim();
    if (decision === "REJECTED" && !note) { setMsg("الرفض يستلزم سببًا."); return; }
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`${base}/${approvalId}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) { await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر حسم الاقتراح."); }
  }

  function actions(base: string, approvalId: string) {
    return (
      <div style={{ marginTop: sp(2), display: "flex", gap: sp(2), flexWrap: "wrap" }}>
        <Input
          placeholder="سبب الرفض (عند الرفض)"
          value={notes[approvalId] ?? ""}
          onChange={(e) => setNotes((n) => ({ ...n, [approvalId]: e.target.value }))}
          style={{ flex: 1, minWidth: 160 }}
        />
        <Button type="button" onClick={() => void decide(base, approvalId, "APPROVED")}>اعتماد</Button>
        <Button variant="ghost" type="button" onClick={() => void decide(base, approvalId, "REJECTED")}>رفض</Button>
      </div>
    );
  }

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا كمدير.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/approvals"
      title="الاعتمادات" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "الاعتمادات" }]}>

      {status === "loading" && <p style={{ color: ui.color.muted }}>…جارٍ التحميل</p>}
      {status === "error" && (
        <p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" type="button" onClick={() => void load()}>إعادة</Button></p>
      )}

      {status === "ready" && (
        <>
          {msg && <p style={{ color: ui.color.danger }}>{msg}</p>}

          <h2 style={sectionTitle}>انتقال المرحلة</h2>
          <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginTop: 2 }}>اعتمادُك ينقل الطالب للمرحلة الأصلية التالية.</p>
          {transitions.length === 0 && <EmptyState title="لا اقتراحات انتقالٍ معلَّقة" />}
          {transitions.map((it) => (
            <Card key={it.approvalId} style={{ marginBottom: sp(3) }}>
              <div><strong>{it.studentName}</strong> — {it.mainStageLabel} · المرتبة: {it.finalRank ? RANK[it.finalRank] ?? it.finalRank : "—"}</div>
              {actions("/api/approvals/stage-transitions", it.approvalId)}
            </Card>
          ))}

          <h2 style={sectionTitle}>التخرّج</h2>
          <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginTop: 2 }}>اعتمادُك يخرّج الطالب ويُصدر شهادة الختم.</p>
          {graduations.length === 0 && <EmptyState title="لا اقتراحات تخرّجٍ معلَّقة" />}
          {graduations.map((it) => (
            <Card key={it.approvalId} style={{ marginBottom: sp(3) }}>
              <div><strong>{it.studentName}</strong> — اكتملت ثلاث جولاتٍ ناجحة</div>
              {actions("/api/approvals/graduations", it.approvalId)}
            </Card>
          ))}
        </>
      )}
    </AppShell>
  );
}
