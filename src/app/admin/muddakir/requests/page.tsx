"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Input, Badge, EmptyState, ui, sp } from "@/components/ui";
import { tMuddakir } from "@/i18n/ar/muddakir";

// شاشة طلبات المُدَّكِر (و٤، §٢): المدير يبتّ المعلّقة (موافقةٌ تُنفَّذ، أو رفضٌ بسبب)، والإداريّ
// يرى طلباته ويلغي المعلّق منها. الصلاحيّة مفروضةٌ في الخادم؛ النصّ من قاموس i18n.

type ReqType = "ENROLL" | "ASSIGN_SUPERVISOR" | "SET_MODE" | "SET_SETTING" | "SET_TATHBIT_LADDER" | "SET_POINT_ITEM";
type ReqStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
interface Req { id: string; type: ReqType; payload: unknown; studentId: string | null; requestedBy: string; requestedAt: string; status: ReqStatus; decisionReason: string | null }
interface Payload { canManage: boolean; pending: Req[]; mine: Req[] }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const typeLabel = (t: ReqType): string =>
  tMuddakir(t === "ENROLL" ? "typeEnroll" : t === "ASSIGN_SUPERVISOR" ? "typeAssignSupervisor" : t === "SET_MODE" ? "typeSetMode" : t === "SET_SETTING" ? "typeSetSetting" : t === "SET_TATHBIT_LADDER" ? "typeSetLadder" : "typeSetPointItem");

const statusView = (s: ReqStatus): { label: string; tone: "neutral" | "success" | "danger" } =>
  s === "APPROVED" ? { label: tMuddakir("reqApproved"), tone: "success" }
    : s === "REJECTED" ? { label: tMuddakir("reqRejected"), tone: "danger" }
    : s === "CANCELLED" ? { label: tMuddakir("reqCancelled"), tone: "neutral" }
    : { label: tMuddakir("reqPending"), tone: "neutral" };

const sectionTitle: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `${sp(4)} 0 ${sp(2)}` };

export default function MuddakirRequestsPage() {
  const { me } = useMe();
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setStatus("loading"); setMsg(null);
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch("/api/muddakir/requests", { headers: { authorization: `Bearer ${t}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      setData((await res.json()) as Payload);
      setStatus("ready");
    } catch { setStatus("error"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(body: Record<string, unknown>, okMsg: string) {
    setMsg(null);
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch("/api/muddakir/requests", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify(body) });
    if (res.ok) { setMsg(okMsg); await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر."); }
  }

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );

  const RequestCard = ({ r, mine }: { r: Req; mine: boolean }) => {
    const sv = statusView(r.status);
    return (
      <Card style={{ padding: sp(3), marginBottom: sp(2), display: "flex", flexDirection: "column", gap: sp(2) }}>
        <div style={{ display: "flex", alignItems: "center", gap: sp(2), flexWrap: "wrap" }}>
          <strong>{typeLabel(r.type)}</strong>
          <Badge tone={sv.tone}>{sv.label}</Badge>
          {!mine && <span style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{tMuddakir("reqRequestedBy")}: {r.requestedBy.slice(0, 8)}</span>}
        </div>
        {r.decisionReason && <p style={{ margin: 0, fontSize: ui.text.xs, color: ui.color.muted }}>{tMuddakir("decisionReasonLabel")}: {r.decisionReason}</p>}

        {/* صندوق المدير: بتّ المعلّقة. */}
        {!mine && r.status === "PENDING" && (
          <div style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap" }}>
            <Button type="button" size="sm" onClick={() => void act({ action: "decide", requestId: r.id, decision: "APPROVED" }, tMuddakir("reqDecided"))}>{tMuddakir("approveBtn")}</Button>
            <Input value={reasons[r.id] ?? ""} onChange={(e) => setReasons((p) => ({ ...p, [r.id]: e.target.value }))} placeholder={tMuddakir("rejectReasonPlaceholder")} style={{ width: "auto", minWidth: 200 }} aria-label={tMuddakir("reqReason")} />
            <Button type="button" size="sm" variant="ghost" disabled={!(reasons[r.id] ?? "").trim()}
              onClick={() => void act({ action: "decide", requestId: r.id, decision: "REJECTED", reason: reasons[r.id] }, tMuddakir("reqDecided"))}>{tMuddakir("rejectBtn")}</Button>
          </div>
        )}

        {/* طلباتي: إلغاء المعلّق. */}
        {mine && r.status === "PENDING" && (
          <div><Button type="button" size="sm" variant="ghost" onClick={() => void act({ action: "cancel", requestId: r.id }, tMuddakir("reqCancelledMsg"))}>{tMuddakir("cancelReqBtn")}</Button></div>
        )}
      </Card>
    );
  };

  return (
    <AppShell roles={me?.roles ?? []} muddakirStaff={me?.muddakirStaff ?? []} userName={me?.name} activeHref="/admin/muddakir/requests"
      title={tMuddakir("requestsTitle")}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: tMuddakir("requestsTitle") }]}>

      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {status === "loading" && <p style={{ color: ui.color.muted }}>…جارٍ التحميل</p>}
      {status === "error" && <p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" type="button" onClick={() => void load()}>إعادة</Button></p>}

      {status === "ready" && data && (
        <>
          {data.canManage && (
            <>
              <h2 style={sectionTitle}>{tMuddakir("pendingInbox")}</h2>
              {data.pending.length === 0 ? <EmptyState title={tMuddakir("noPendingRequests")} /> : data.pending.map((r) => <RequestCard key={r.id} r={r} mine={false} />)}
            </>
          )}
          <h2 style={sectionTitle}>{tMuddakir("myRequests")}</h2>
          {data.mine.length === 0 ? <EmptyState title={tMuddakir("noMyRequests")} /> : data.mine.map((r) => <RequestCard key={r.id} r={r} mine />)}
        </>
      )}
    </AppShell>
  );
}
