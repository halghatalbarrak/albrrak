"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Button, Input, Badge, EmptyState, Table, ui, sp, type Column } from "@/components/ui";

// لوحة اعتماد المدير (الحكم ٧): اقتراحات انتقال المرحلة والتخرّج المعلَّقة — اعتماد/رفض.

interface Transition { approvalId: string; studentName: string; mainStageLabel: string; finalRank: string | null }
interface Graduation { approvalId: string; studentName: string }
const RANK: Record<string, string> = { EXCELLENT: "تميّز", PASS: "اجتياز", FAIL: "رسوب" };

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const sectionTitle: React.CSSProperties = { fontSize: ui.text.lg, fontWeight: 700, marginTop: sp(6) };

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
    } catch { setStatus("error"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(base: string, approvalId: string, decision: "APPROVED" | "REJECTED") {
    setMsg(null);
    const note = notes[approvalId]?.trim();
    if (decision === "REJECTED" && !note) { setMsg("الرفض يستلزم سببًا."); return; }
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`${base}/${approvalId}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) await load();
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر حسم الاقتراح."); }
  }

  const noteCell = (approvalId: string) => (
    <Input placeholder="سبب الرفض (عند الرفض)" value={notes[approvalId] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [approvalId]: e.target.value }))} style={{ minWidth: 150 }} />
  );
  const actionCell = (base: string, approvalId: string) => (
    <div style={{ display: "flex", gap: sp(2), justifyContent: "flex-end", flexWrap: "wrap" }}>
      <Button size="sm" type="button" onClick={() => void decide(base, approvalId, "APPROVED")}>اعتماد</Button>
      <Button variant="ghost" size="sm" type="button" onClick={() => void decide(base, approvalId, "REJECTED")}>رفض</Button>
    </div>
  );

  const tCols: Column<Transition>[] = [
    { key: "name", header: "الطالب", cell: (it) => <strong>{it.studentName}</strong> },
    { key: "stage", header: "المرحلة", cell: (it) => it.mainStageLabel },
    { key: "rank", header: "المرتبة", cell: (it) => (it.finalRank ? RANK[it.finalRank] ?? it.finalRank : "—") },
    { key: "note", header: "سبب الرفض", cell: (it) => noteCell(it.approvalId) },
    { key: "act", header: "إجراءات", cell: (it) => actionCell("/api/approvals/stage-transitions", it.approvalId) },
  ];
  const gCols: Column<Graduation>[] = [
    { key: "name", header: "الطالب", cell: (it) => <strong>{it.studentName}</strong> },
    { key: "status", header: "الحالة", cell: () => <Badge tone="success">اكتملت ثلاث جولات</Badge> },
    { key: "note", header: "سبب الرفض", cell: (it) => noteCell(it.approvalId) },
    { key: "act", header: "إجراءات", cell: (it) => actionCell("/api/approvals/graduations", it.approvalId) },
  ];

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا كمدير.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );

  const pending = transitions.length + graduations.length;

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/approvals"
      title="الاعتمادات" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "الاعتمادات" }]}>

      {status === "loading" && <p style={{ color: ui.color.muted }}>…جارٍ التحميل</p>}
      {status === "error" && <p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" type="button" onClick={() => void load()}>إعادة</Button></p>}

      {status === "ready" && (
        <>
          {msg && <p style={{ color: ui.color.danger }}>{msg}</p>}
          {pending === 0 && <EmptyState title="لا اعتمادات معلّقة" description="لا اقتراحات انتقالٍ أو تخرّجٍ بانتظارك الآن." />}

          {(transitions.length > 0 || graduations.length > 0) && (
            <>
              <h2 style={{ ...sectionTitle, marginTop: 0 }}>انتقال المرحلة</h2>
              <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginTop: 2, marginBottom: sp(3) }}>اعتمادُك ينقل الطالب للمرحلة الأصلية التالية.</p>
              {transitions.length > 0 && <Table columns={tCols} rows={transitions} />}
              {transitions.length === 0 && <p style={{ color: ui.color.muted }}>لا اقتراحات انتقالٍ معلَّقة.</p>}

              <h2 style={sectionTitle}>التخرّج</h2>
              <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginTop: 2, marginBottom: sp(3) }}>اعتمادُك يخرّج الطالب ويُصدر شهادة الختم.</p>
              {graduations.length > 0 && <Table columns={gCols} rows={graduations} />}
              {graduations.length === 0 && <p style={{ color: ui.color.muted }}>لا اقتراحات تخرّجٍ معلَّقة.</p>}
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
