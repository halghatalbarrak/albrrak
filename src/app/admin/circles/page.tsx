"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Button, Select, EmptyState, Skeleton, Table, ui, sp, type Column } from "@/components/ui";

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
  const router = useRouter();
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

  // البرنامج الافتراضيّ للحلقة (للمنضمّ الجديد، ق١) — لا يمسّ برامج القيود القائمة.
  async function changeProgram(circleId: string, programId: string) {
    const t = await token(); if (!t) return;
    const res = await fetch(`/api/admin/circles/${circleId}/program`, {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify({ programId }),
    });
    if (res.ok) void load(); else setErr("تعذّر تغيير البرنامج الافتراضيّ.");
  }

  const cols: Column<Circle>[] = [
    { key: "name", header: "الاسم", cell: (c) => <strong>{c.nameAr}</strong> },
    { key: "program", header: "البرنامج الافتراضيّ", cell: (c) => (
      programs.length ? (
        <Select value={programs.find((p) => p.key === c.programKey)?.id ?? ""} onChange={(e) => void changeProgram(c.id, e.target.value)} style={{ minWidth: 150 }}>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
        </Select>
      ) : c.programNameAr
    ) },
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
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: sp(4) }}>
            <Button onClick={() => router.push("/admin/circles/new")}>+ جديد</Button>
          </div>

          {circles.length === 0 ? <EmptyState title="لا حلقات بعد" description="أنشئ الأولى بزرّ «+ جديد»." />
            : <Table columns={cols} rows={circles} />}
        </>
      )}
    </AppShell>
  );
}
