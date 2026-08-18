"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Field, inputStyle, EmptyState, Skeleton, Table, ui, sp, type Column } from "@/components/ui";

const linkBtn: React.CSSProperties = { fontSize: ui.text.xs, fontWeight: 600, color: ui.color.primary, textDecoration: "none", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md, padding: `${sp(1.5)} ${sp(2.5)}` };

interface Circle {
  id: string;
  nameAr: string;
  timeSlot: string;
  gender: string;
  location: string | null;
  programKey: string;
  programNameAr: string;
}
interface Program { id: string; key: string; nameAr: string }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const SLOT_AR: Record<string, string> = { ASR: "العصر", MAGHRIB: "المغرب" };

export default function AdminCirclesPage() {
  const { me } = useMe();
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/circles", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — هذه الشاشة للمدير."); return; }
    if (!res.ok) { setErr("تعذّر جلب الحلقات."); return; }
    const data = (await res.json().catch(() => ({}))) as { circles?: Circle[]; programs?: Program[] };
    setCircles(Array.isArray(data.circles) ? data.circles : []);
    setPrograms(Array.isArray(data.programs) ? data.programs : []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/circles", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    });
    if (res.status === 201) { form.reset(); setErr(null); void load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر إنشاء الحلقة."); }
  }

  const cols: Column<Circle>[] = [
    { key: "name", header: "الاسم", cell: (c) => <strong>{c.nameAr}</strong> },
    { key: "program", header: "البرنامج", cell: (c) => c.programNameAr },
    { key: "slot", header: "الوقت", cell: (c) => SLOT_AR[c.timeSlot] ?? c.timeSlot },
    { key: "gender", header: "الجنس", cell: (c) => (c.gender === "MALE" ? "بنون" : "بنات") },
    { key: "location", header: "المكان", cell: (c) => c.location ?? "—" },
    { key: "map", header: "الخريطة", cell: (c) => <div style={{ display: "flex", justifyContent: "flex-end" }}><Link href={`/admin/circles/${c.id}/weakness`} style={linkBtn}>خريطة الضعف</Link></div> },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/circles"
      title={`الحلقات${circles ? ` (${circles.length})` : ""}`}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "الحلقات" }]}>

      {err && !circles && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !circles && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={40} />)}
        </div>
      )}

      {circles && (
        <>
          <Card style={{ marginBottom: sp(6) }}>
            <form onSubmit={onSubmit}>
              <h2 style={{ marginTop: 0, fontSize: ui.text.lg, fontWeight: 700 }}>حلقة جديدة</h2>
              <Field label="الاسم"><input style={inputStyle} name="nameAr" required /></Field>
              <Field label="البرنامج">
                <Select name="programId" required defaultValue="">
                  <option value="" disabled>اختر…</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
                </Select>
              </Field>
              <Field label="الوقت">
                <Select name="timeSlot" required defaultValue="MAGHRIB">
                  <option value="ASR">العصر</option>
                  <option value="MAGHRIB">المغرب</option>
                </Select>
              </Field>
              <Field label="الجنس">
                <Select name="gender" required defaultValue="MALE">
                  <option value="MALE">بنون</option>
                  <option value="FEMALE">بنات</option>
                </Select>
              </Field>
              <Field label="المكان (اختياري)"><input style={inputStyle} name="location" /></Field>
              {err && <p style={{ color: ui.color.danger }}>{err}</p>}
              <Button type="submit">إنشاء</Button>
            </form>
          </Card>

          {circles.length === 0 ? <EmptyState title="لا حلقات بعد" description="أنشئ الأولى من النموذج أعلاه." />
            : <Table columns={cols} rows={circles} />}
        </>
      )}
    </AppShell>
  );
}
