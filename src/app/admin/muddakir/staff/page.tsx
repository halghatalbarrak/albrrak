"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, Card, Button, Select, Table, Badge, EmptyState, ui, sp, type Column } from "@/components/ui";
import { tMuddakir } from "@/i18n/ar/muddakir";

// شاشة طاقم المُدَّكِر (و٤، §٢): مدير البرنامج يُعيّن/يُنهي الإداريّ والمشرف والمختبِر؛ ومدير
// المنصّة وحده يُعيّن «مدير البرنامج». يُقترح للإشراف من أتمّ نصف القرآن. الصلاحيّة في الخادم.

type StaffRole = "MANAGER" | "ADMIN" | "SUPERVISOR" | "EXAMINER";
interface StaffRow { userId: string; name: string; role: StaffRole }
interface Candidate { userId: string; name: string; memorizedFaces: number }
interface AUser { id: string; name: string }
interface Payload { canAssignManager: boolean; staff: StaffRow[]; supervisorCandidates: Candidate[]; assignableUsers: AUser[] }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const roleLabel = (r: StaffRole): string =>
  tMuddakir(r === "MANAGER" ? "staffManager" : r === "ADMIN" ? "staffAdmin" : r === "SUPERVISOR" ? "staffSupervisor" : "staffExaminer");
const roleTone = (r: StaffRole): "bronze" | "primary" | "success" | "neutral" =>
  r === "MANAGER" ? "bronze" : r === "ADMIN" ? "primary" : r === "SUPERVISOR" ? "success" : "neutral";

const sectionTitle: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `${sp(4)} 0 ${sp(2)}` };

export default function MuddakirStaffPage() {
  const { me } = useMe();
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole>("ADMIN");
  const [userId, setUserId] = useState("");

  const load = useCallback(async () => {
    setStatus("loading"); setMsg(null);
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

  async function act(body: Record<string, unknown>, okMsg: string) {
    setMsg(null);
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch("/api/muddakir/staff", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify(body) });
    if (res.ok) { setMsg(okMsg); setUserId(""); await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر."); }
  }

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );

  const isSupervisorRole = role === "SUPERVISOR";
  const candidates = data?.supervisorCandidates ?? [];
  const users = data?.assignableUsers ?? [];

  const columns: Column<StaffRow>[] = [
    { key: "name", header: tMuddakir("staffMember"), cell: (s) => <strong>{s.name}</strong> },
    { key: "role", header: tMuddakir("staffRole"), cell: (s) => <Badge tone={roleTone(s.role)}>{roleLabel(s.role)}</Badge> },
    { key: "end", header: "", cell: (s) => <Button type="button" size="sm" variant="ghost" onClick={() => void act({ action: "end", userId: s.userId, role: s.role }, tMuddakir("staffEnded"))}>{tMuddakir("staffEnd")}</Button> },
  ];

  return (
    <AppShell roles={me?.roles ?? []} muddakirStaff={me?.muddakirStaff ?? []} userName={me?.name} activeHref="/admin/muddakir/staff"
      title={tMuddakir("staffTitle")}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: tMuddakir("staffTitle") }]}>

      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {status === "loading" && <p style={{ color: ui.color.muted }}>…جارٍ التحميل</p>}
      {status === "error" && <p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" type="button" onClick={() => void load()}>إعادة</Button></p>}

      {status === "ready" && data && (
        <>
          {/* التعيين */}
          <h2 style={sectionTitle}>{tMuddakir("staffAssign")}</h2>
          <Card style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap", padding: sp(3), marginBottom: sp(2) }}>
            <Select value={role} onChange={(e) => { setRole(e.target.value as StaffRole); setUserId(""); }} style={{ width: "auto" }} aria-label={tMuddakir("staffSelectRole")}>
              {data.canAssignManager && <option value="MANAGER">{roleLabel("MANAGER")}</option>}
              <option value="ADMIN">{roleLabel("ADMIN")}</option>
              <option value="SUPERVISOR">{roleLabel("SUPERVISOR")}</option>
              <option value="EXAMINER">{roleLabel("EXAMINER")}</option>
            </Select>
            <Select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ width: "auto", minWidth: 240 }} aria-label={tMuddakir("staffSelectUser")}>
              <option value="">— {isSupervisorRole ? tMuddakir("halfQuranSuggestion") : tMuddakir("staffSelectUser")} —</option>
              {isSupervisorRole
                ? candidates.map((c) => <option key={c.userId} value={c.userId}>{c.name} ({arNum(c.memorizedFaces)})</option>)
                : users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Button type="button" size="sm" disabled={!userId} onClick={() => userId && void act({ action: "assign", userId, role }, tMuddakir("staffAssigned"))}>{tMuddakir("staffAssign")}</Button>
          </Card>
          {isSupervisorRole && <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: `0 0 ${sp(3)}` }}>{tMuddakir("halfQuranHint")}</p>}
          {!data.canAssignManager && <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: `0 0 ${sp(3)}` }}>{tMuddakir("managerOnlyNote")}</p>}

          {/* الطاقم الحاليّ */}
          <h2 style={sectionTitle}>{tMuddakir("staffCurrent")}</h2>
          {data.staff.length === 0 ? <EmptyState title={tMuddakir("staffNone")} /> : <Table columns={columns} rows={data.staff} empty={tMuddakir("staffNone")} />}
        </>
      )}
    </AppShell>
  );
}
