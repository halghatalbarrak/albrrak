"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, EmptyState, ui, sp } from "@/components/ui";

// شاشة العرفاء (الحكم ٨): المعلّم يعيّن طالباً من حلقته عريفاً، أو يعزله. العريف يُسمِّع
// الترسيخ/المراجعة بإسناده، لا الحفظ الجديد ولا الاختبار. حالات صريحة، لا انهيار.

interface Circle { id: string; nameAr: string }
interface Arif { arifUserId: string; name: string }
interface Candidate { userId: string; name: string }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const row: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3),
  padding: `${sp(2)} ${sp(4)}`, marginBottom: sp(2),
};
const sectionTitle: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `${sp(4)} 0 ${sp(2)}` };

export default function ArifsPage() {
  const { me } = useMe();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState("");
  const [arifs, setArifs] = useState<Arif[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch("/api/attendance/circles", { headers: { authorization: `Bearer ${t}` } });
      if (res.ok) setCircles(((await res.json()) as { circles?: Circle[] }).circles ?? []);
      else if (res.status === 401 || res.status === 403) setStatus("unauth");
    })();
  }, []);

  const load = useCallback(async () => {
    if (!circleId) return;
    setStatus("loading"); setMsg(null);
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch(`/api/circles/${circleId}/arifs`, { headers: { authorization: `Bearer ${t}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      const j = (await res.json()) as { arifs?: Arif[]; candidates?: Candidate[] };
      setArifs(j.arifs ?? []); setCandidates(j.candidates ?? []);
      setStatus("ready");
    } catch { setStatus("error"); }
  }, [circleId]);

  useEffect(() => { void load(); }, [load]);

  async function act(arifUserId: string, action: "appoint" | "dismiss") {
    setMsg(null);
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/circles/${circleId}/arifs`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ arifUserId, action }),
    });
    if (res.ok) { setMsg(action === "appoint" ? "عُيّن عريفًا." : "عُزل."); await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر."); }
  }

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/arifs"
      title="العرفاء" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "التشغيل" }, { label: "العرفاء" }]}>
      <p style={{ color: ui.color.muted, margin: `0 0 ${sp(4)}`, fontSize: ui.text.base }}>
        العريف يُسمِّع الترسيخ والمراجعة بإسنادك ومسؤوليتك — لا الحفظ الجديد ولا الاختبار.
      </p>

      <Select value={circleId} onChange={(e) => setCircleId(e.target.value)} style={{ width: "auto", minWidth: 200, marginBottom: sp(4) }}>
        <option value="">— اختر حلقة —</option>
        {circles.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
      </Select>

      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {status === "loading" && <p style={{ color: ui.color.muted }}>…جارٍ التحميل</p>}
      {status === "error" && <p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" type="button" onClick={() => void load()}>إعادة</Button></p>}
      {status === "idle" && <EmptyState title="اختر حلقةً لإدارة عرفائها" />}

      {status === "ready" && (
        <>
          <h2 style={sectionTitle}>العرفاء النشطون</h2>
          {arifs.length === 0 && <p style={{ color: ui.color.muted }}>لا عرفاء بعد.</p>}
          {arifs.map((a) => (
            <Card key={a.arifUserId} style={row}>
              <strong>{a.name}</strong>
              <Button variant="danger" size="sm" type="button" onClick={() => void act(a.arifUserId, "dismiss")}>عزل</Button>
            </Card>
          ))}

          <h2 style={sectionTitle}>طلاب الحلقة (للتعيين — أنت تقدّر تقدّمهم)</h2>
          {candidates.length === 0 && <p style={{ color: ui.color.muted }}>لا طلاب متاحين.</p>}
          {candidates.map((c) => (
            <Card key={c.userId} style={row}>
              <span>{c.name}</span>
              <Button size="sm" type="button" onClick={() => void act(c.userId, "appoint")}>عيّن عريفًا</Button>
            </Card>
          ))}
        </>
      )}
    </AppShell>
  );
}
