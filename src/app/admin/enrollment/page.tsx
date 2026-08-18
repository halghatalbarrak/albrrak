"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Badge, EmptyState, Modal, Table, ui, sp, type Column } from "@/components/ui";

// شاشة الإسناد: المدير يسند الطالب المقبول إلى حلقة، أو ينقله (بسجلٍّ تاريخي).

interface StudentRow { id: string; name: string; state: string; circle: string | null }
interface CircleRow { id: string; nameAr: string; programKey: string }
interface HistoryRow { id: string; circleNameAr: string; startedAt: string; endedAt: string | null }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function EnrollmentPage() {
  const { me } = useMe();
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [circles, setCircles] = useState<CircleRow[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [historyFor, setHistoryFor] = useState<StudentRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { setErr("تحتاج دخولًا."); return; }
    const auth = { authorization: `Bearer ${t}` };
    const [rs, rc] = await Promise.all([
      fetch("/api/admin/students", { headers: auth }),
      fetch("/api/admin/circles", { headers: auth }),
    ]);
    if (rs.ok) setStudents(((await rs.json()) as { students?: StudentRow[] }).students ?? []);
    if (rc.ok) setCircles(((await rc.json()) as { circles?: CircleRow[] }).circles ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function assign(studentId: string) {
    setMsg(null); setErr(null);
    const circleId = pick[studentId];
    if (!circleId) { setErr("اختر حلقة أولًا."); return; }
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${studentId}/enroll`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ circleId }),
    });
    if (res.ok) { setMsg("تمّ الإسناد/النقل."); await load(); }
    else { const j = (await res.json()) as { error?: string }; setErr(j.error ?? "تعذّر الإسناد."); }
  }

  async function showHistory(s: StudentRow) {
    setHistoryFor(s); setHistory(null);
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${s.id}/enroll`, { headers: { authorization: `Bearer ${t}` } });
    if (res.ok) setHistory(((await res.json()) as { history?: HistoryRow[] }).history ?? []);
    else setHistory([]);
  }

  const unassigned = students?.filter((s) => !s.circle).length ?? 0;

  const cols: Column<StudentRow>[] = [
    { key: "name", header: "الاسم", cell: (s) => <strong>{s.name}</strong> },
    { key: "circle", header: "الحلقة الحالية", cell: (s) => (s.circle ? s.circle : <Badge tone="bronze">بلا حلقة</Badge>) },
    {
      key: "assign", header: "الإسناد", cell: (s) => (
        <div style={{ display: "flex", gap: sp(2), alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Select value={pick[s.id] ?? ""} onChange={(e) => setPick((p) => ({ ...p, [s.id]: e.target.value }))} style={{ width: "auto", minWidth: 150 }}>
            <option value="">— اختر حلقة —</option>
            {circles.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
          </Select>
          <Button size="sm" type="button" onClick={() => void assign(s.id)}>{s.circle ? "نقل" : "إسناد"}</Button>
        </div>
      ),
    },
    { key: "hist", header: "السجلّ", cell: (s) => <Button variant="ghost" size="sm" type="button" onClick={() => void showHistory(s)}>عرض</Button> },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/enrollment"
      title="إسناد الطلاب للحلقات" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "القيد" }]}>
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {err && <p style={{ color: ui.color.danger, fontSize: ui.text.xs }}>{err}</p>}

      {students && students.length === 0 && <EmptyState title="لا طلاب" description="لا طلاب مقبولون للإسناد بعد." />}

      {students && students.length > 0 && (
        <>
          {unassigned > 0 && (
            <Card style={{ marginBottom: sp(4), borderInlineStart: `4px solid ${ui.color.bronze}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3), flexWrap: "wrap" }}>
              <span><strong>{unassigned}</strong> طالبٍ بلا حلقة — أسنِدهم أولاً.</span>
              <Badge tone="bronze">بانتظار الإسناد</Badge>
            </Card>
          )}
          <Table columns={cols} rows={students} />
        </>
      )}

      <Modal open={historyFor !== null} onClose={() => setHistoryFor(null)} title={`سجلّ الإسناد — ${historyFor?.name ?? ""}`}>
        {history === null ? <p style={{ color: ui.color.muted, margin: 0 }}>…جارٍ التحميل</p>
          : history.length === 0 ? <p style={{ color: ui.color.muted, margin: 0 }}>لا سجلّ.</p>
          : (
            <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: ui.text.base }}>
              {history.map((h) => (
                <li key={h.id} style={{ marginBottom: sp(1) }}>
                  {h.circleNameAr} — من {new Date(h.startedAt).toLocaleDateString("ar")}
                  {h.endedAt ? ` إلى ${new Date(h.endedAt).toLocaleDateString("ar")}` : " (نشط)"}
                </li>
              ))}
            </ul>
          )}
      </Modal>
    </AppShell>
  );
}
