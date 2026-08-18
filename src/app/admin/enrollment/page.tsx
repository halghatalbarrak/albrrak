"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, EmptyState, ui, sp } from "@/components/ui";

// شاشة الإسناد: المدير يسند الطالب المقبول إلى حلقة، أو ينقله (بسجلٍّ تاريخي).
// بها تعمل شاشة الحضور فعليًّا — طلابٌ في حلقات.

interface StudentRow {
  id: string;
  name: string;
  state: string;
  circle: string | null;
}
interface CircleRow {
  id: string;
  nameAr: string;
  programKey: string;
}
interface HistoryRow {
  id: string;
  circleNameAr: string;
  startedAt: string;
  endedAt: string | null;
}

async function token(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const rowCard: React.CSSProperties = {
  marginBottom: sp(3), display: "flex", gap: sp(3), alignItems: "center", flexWrap: "wrap",
};

export default function EnrollmentPage() {
  const { me } = useMe();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [circles, setCircles] = useState<CircleRow[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) {
      setErr("تحتاج دخولًا.");
      return;
    }
    const auth = { authorization: `Bearer ${t}` };
    const [rs, rc] = await Promise.all([
      fetch("/api/admin/students", { headers: auth }),
      fetch("/api/admin/circles", { headers: auth }),
    ]);
    if (rs.ok) setStudents(((await rs.json()) as { students?: StudentRow[] }).students ?? []);
    if (rc.ok) setCircles(((await rc.json()) as { circles?: CircleRow[] }).circles ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(studentId: string) {
    setMsg(null);
    setErr(null);
    const circleId = pick[studentId];
    if (!circleId) {
      setErr("اختر حلقة أولًا.");
      return;
    }
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${studentId}/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ circleId }),
    });
    if (res.ok) {
      setMsg("تمّ الإسناد/النقل.");
      await load();
    } else {
      const j = (await res.json()) as { error?: string };
      setErr(j.error ?? "تعذّر الإسناد.");
    }
  }

  async function showHistory(studentId: string) {
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${studentId}/enroll`, {
      headers: { authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const j = (await res.json()) as { history?: HistoryRow[] };
      setHistory((h) => ({ ...h, [studentId]: j.history ?? [] }));
    }
  }

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/enrollment"
      title="إسناد الطلاب للحلقات" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "القيد" }]}>
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {err && <p style={{ color: ui.color.danger, fontSize: ui.text.xs }}>{err}</p>}
      {students.length === 0 && <EmptyState title="لا طلاب" description="لا طلاب مقبولون للإسناد بعد." />}
      {students.map((s) => (
        <Card key={s.id} style={rowCard}>
          <strong>{s.name}</strong>
          <span style={{ color: ui.color.muted }}>الحلقة: {s.circle ?? "—"}</span>
          <Select
            value={pick[s.id] ?? ""}
            onChange={(e) => setPick((p) => ({ ...p, [s.id]: e.target.value }))}
            style={{ width: "auto", minWidth: 160 }}
          >
            <option value="">— اختر حلقة —</option>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>{c.nameAr}</option>
            ))}
          </Select>
          <Button size="sm" type="button" onClick={() => void assign(s.id)}>
            {s.circle ? "نقل" : "إسناد"}
          </Button>
          <Button variant="ghost" size="sm" type="button" onClick={() => void showHistory(s.id)}>
            السجلّ
          </Button>
          {history[s.id] && (
            <ul style={{ width: "100%", margin: 0, fontSize: ui.text.xs, color: ui.color.muted }}>
              {history[s.id].map((h) => (
                <li key={h.id}>
                  {h.circleNameAr} — من {new Date(h.startedAt).toLocaleDateString("ar")}
                  {h.endedAt ? ` إلى ${new Date(h.endedAt).toLocaleDateString("ar")}` : " (نشط)"}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </AppShell>
  );
}
