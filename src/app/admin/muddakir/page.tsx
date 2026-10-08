"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Table, EmptyState, ui, sp, type Column } from "@/components/ui";
import { tMuddakir, stageLabel, supervisorLoadLabel } from "@/i18n/ar/muddakir";

// شاشة إدارة المُدَّكِر (المرحلة ٣): المدير (SUPER_ADMIN/CIRCLE_MANAGER) يُلحق ويُسند؛ المشرف
// (ARIF) يرى حفّاظه للقراءة فقط. كل نصٍّ من قاموس i18n/ar/muddakir. الصلاحيّة مفروضةٌ في الخادم.

interface Hafiz {
  studentId: string;
  name: string;
  stage: number;
  supervisorId: string | null;
  supervisorName: string | null;
  deliveryMode: "IN_PERSON" | "REMOTE";
}
interface Supervisor { id: string; name: string; load: number; max: number; full: boolean }
interface Enrollable { studentId: string; name: string }
interface Payload { canManage: boolean; hafiz: Hafiz[]; supervisors: Supervisor[]; enrollable: Enrollable[] }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const deliveryLabel = (m: "IN_PERSON" | "REMOTE") => tMuddakir(m === "REMOTE" ? "deliveryRemote" : "deliveryInPerson");
const sectionTitle: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `${sp(4)} 0 ${sp(2)}` };

export default function MuddakirAdminPage() {
  const { me } = useMe();
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [enrollId, setEnrollId] = useState("");
  const [enrollDelivery, setEnrollDelivery] = useState<"IN_PERSON" | "REMOTE">("IN_PERSON");

  const load = useCallback(async () => {
    setStatus("loading"); setMsg(null);
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

  async function post(body: Record<string, unknown>, okMsg: string) {
    setMsg(null);
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch("/api/muddakir", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    });
    if (res.ok) { setMsg(okMsg); await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر."); }
  }

  const canManage = data?.canManage ?? false;

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );

  // أعمدة المدير: المرحلة، المشرف (اختيارٌ بحمله، ممتلئٌ معطَّل إلا الحاليّ)، نمط اللقاء.
  const manageColumns: Column<Hafiz>[] = [
    { key: "name", header: tMuddakir("colHafiz"), cell: (h) => <strong>{h.name}</strong> },
    { key: "stage", header: tMuddakir("colStage"), cell: (h) => stageLabel(h.stage) },
    {
      key: "supervisor", header: tMuddakir("colSupervisor"),
      cell: (h) => (
        <Select
          value={h.supervisorId ?? ""}
          onChange={(e) => e.target.value && void post({ action: "assign", studentId: h.studentId, supervisorId: e.target.value }, tMuddakir("assign"))}
          style={{ width: "auto", minWidth: 180 }}
          aria-label={tMuddakir("selectSupervisor")}
        >
          <option value="">— {tMuddakir("noSupervisor")} —</option>
          {(data?.supervisors ?? []).map((s) => (
            <option key={s.id} value={s.id} disabled={s.full && s.id !== h.supervisorId}>
              {s.name} ({supervisorLoadLabel(s.load, s.max)}){s.full && s.id !== h.supervisorId ? ` — ${tMuddakir("supervisorFull")}` : ""}
            </option>
          ))}
        </Select>
      ),
    },
    { key: "delivery", header: tMuddakir("colDelivery"), cell: (h) => deliveryLabel(h.deliveryMode) },
  ];

  // أعمدة المشرف (للقراءة فقط): بلا اختيار مشرف.
  const readColumns: Column<Hafiz>[] = [
    { key: "name", header: tMuddakir("colHafiz"), cell: (h) => <strong>{h.name}</strong> },
    { key: "stage", header: tMuddakir("colStage"), cell: (h) => stageLabel(h.stage) },
    { key: "delivery", header: tMuddakir("colDelivery"), cell: (h) => deliveryLabel(h.deliveryMode) },
  ];

  return (
    <AppShell roles={me?.roles ?? []} muddakirStaff={me?.muddakirStaff ?? []} userName={me?.name} activeHref="/admin/muddakir"
      title={tMuddakir("adminTitle")}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: tMuddakir("adminTitle") }]}>

      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {status === "loading" && <p style={{ color: ui.color.muted }}>…جارٍ التحميل</p>}
      {status === "error" && <p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" type="button" onClick={() => void load()}>إعادة</Button></p>}

      {status === "ready" && data && (
        canManage ? (
          <>
            {/* الإلحاق */}
            <h2 style={sectionTitle}>{tMuddakir("enrollHafiz")}</h2>
            <Card style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap", padding: sp(3), marginBottom: sp(4) }}>
              <Select value={enrollId} onChange={(e) => setEnrollId(e.target.value)} style={{ width: "auto", minWidth: 200 }} aria-label={tMuddakir("selectHafiz")}>
                <option value="">— {tMuddakir("selectHafiz")} —</option>
                {data.enrollable.map((s) => <option key={s.studentId} value={s.studentId}>{s.name}</option>)}
              </Select>
              <Select value={enrollDelivery} onChange={(e) => setEnrollDelivery(e.target.value as "IN_PERSON" | "REMOTE")} style={{ width: "auto" }} aria-label={tMuddakir("colDelivery")}>
                <option value="IN_PERSON">{tMuddakir("deliveryInPerson")}</option>
                <option value="REMOTE">{tMuddakir("deliveryRemote")}</option>
              </Select>
              <Button type="button" size="sm" disabled={!enrollId}
                onClick={() => { if (enrollId) { void post({ action: "enroll", studentId: enrollId, deliveryMode: enrollDelivery }, tMuddakir("enroll")); setEnrollId(""); } }}>
                {tMuddakir("enroll")}
              </Button>
              {data.enrollable.length === 0 && <span style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{tMuddakir("noEnrollable")}</span>}
            </Card>

            {/* قائمة الحفّاظ */}
            <h2 style={sectionTitle}>{tMuddakir("colHafiz")}</h2>
            <Table columns={manageColumns} rows={data.hafiz} empty={tMuddakir("noHafizYet")} />
          </>
        ) : (
          <>
            <h2 style={sectionTitle}>{tMuddakir("myHafiz")}</h2>
            <p style={{ color: ui.color.muted, margin: `0 0 ${sp(3)}`, fontSize: ui.text.xs }}>{tMuddakir("readOnlyView")}</p>
            {data.hafiz.length === 0
              ? <EmptyState title={tMuddakir("noHafizYet")} />
              : <Table columns={readColumns} rows={data.hafiz} empty={tMuddakir("noHafizYet")} />}
          </>
        )
      )}
    </AppShell>
  );
}
