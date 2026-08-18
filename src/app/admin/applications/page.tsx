"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Badge, EmptyState, Skeleton, Table, ui, sp, type Column } from "@/components/ui";

interface Row {
  id: string;
  name: string;
  age: number;
  gender: string;
  nationality: string;
  schoolStage: string | null;
  guardianPhone: string;
  studentPhone: string | null;
  priorHifzJuz: number | null;
  status: string;
  createdAt: string;
}

async function token(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function AdminApplicationsPage() {
  const { me } = useMe();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const t = await token();
    if (!t) {
      window.location.href = "/login";
      return;
    }
    const auth = { authorization: `Bearer ${t}` };
    const [meRes, appsRes] = await Promise.all([
      fetch("/api/me", { headers: auth }),
      fetch("/api/applications", { headers: auth }),
    ]);
    if (meRes.ok) setRoles(((await meRes.json()) as { roles: string[] }).roles);
    if (appsRes.status === 403) {
      setErr("لا صلاحية — هذه الشاشة للمدير.");
      return;
    }
    if (!appsRes.ok) {
      setErr("تعذّر جلب الطلبات.");
      return;
    }
    const data = (await appsRes.json().catch(() => ({}))) as { applications?: Row[] };
    const list = Array.isArray(data.applications) ? data.applications : [];
    // الاستثناء أولاً: قائمة الانتظار قبل المعلّق، ثم الأقدم.
    const sorted = [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === "WAITLISTED" ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
    setRows(sorted);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: "accept" | "reject" | "waitlist") {
    const t = await token();
    if (!t) return;
    let note: string | undefined;
    if (decision === "reject") {
      note = window.prompt("سبب الرفض (إلزامي):") ?? "";
      if (!note.trim()) return;
    }
    const res = await fetch(`/api/applications/${id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) void load();
    else setErr("تعذّر تنفيذ القرار.");
  }

  async function revealId(id: string) {
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/applications/${id}/reveal-id`, {
      method: "POST",
      headers: { authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const { nationalId } = (await res.json()) as { nationalId: string };
      setRevealed((r) => ({ ...r, [id]: nationalId }));
    } else {
      setErr("تعذّر كشف رقم الهوية.");
    }
  }

  const canReveal = roles.includes("REGISTRAR") || roles.includes("SUPER_ADMIN");

  // النظام يقترح: أقدم طلبٍ معلّق (بالأيام) ليُبدأ به.
  const oldestDays = rows && rows.length
    ? Math.floor((Date.now() - Date.parse(rows[0].createdAt)) / 86_400_000)
    : null;

  const cols: Column<Row>[] = [
    { key: "name", header: "الاسم", cell: (r) => <strong>{r.name}</strong> },
    { key: "status", header: "الحالة", cell: (r) => (r.status === "WAITLISTED" ? <Badge tone="bronze">قائمة الانتظار</Badge> : <Badge tone="neutral">جديد</Badge>) },
    { key: "info", header: "البيانات", cell: (r) => `${r.age} سنة · ${r.gender === "MALE" ? "ذكر" : "أنثى"} · ${r.nationality}` },
    { key: "guardian", header: "ولي الأمر", cell: (r) => r.guardianPhone },
    { key: "hifz", header: "الحفظ", cell: (r) => (r.priorHifzJuz != null ? `${r.priorHifzJuz} جزء` : "—") },
    {
      key: "actions", header: "إجراءات", cell: (r) => (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button size="sm" onClick={() => decide(r.id, "accept")}>قبول</Button>
          <Button variant="danger" size="sm" onClick={() => decide(r.id, "reject")}>رفض</Button>
          <Button variant="ghost" size="sm" onClick={() => decide(r.id, "waitlist")}>انتظار</Button>
          {canReveal && <Button variant="ghost" size="sm" onClick={() => revealId(r.id)}>{revealed[r.id] ? `الهوية: ${revealed[r.id]}` : "كشف الهوية"}</Button>}
        </div>
      ),
    },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/applications"
      title={`طلبات القيد${rows ? ` (${rows.length})` : ""}`}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "الطلبات" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !rows && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={44} />)}
        </div>
      )}
      {rows && rows.length === 0 && <EmptyState title="لا طلبات معلّقة" description="ستظهر هنا طلبات القيد الجديدة عند ورودها." />}

      {rows && rows.length > 0 && (
        <>
          {oldestDays != null && oldestDays >= 1 && (
            <Card style={{ marginBottom: sp(4), borderInlineStart: `4px solid ${ui.color.bronze}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3), flexWrap: "wrap" }}>
              <span>أقدم طلبٍ معلّق منذ <strong>{oldestDays}</strong> يومًا — ابدأ به.</span>
              <Badge tone="bronze">{rows.length} بانتظار المراجعة</Badge>
            </Card>
          )}
          <Table columns={cols} rows={rows} />
        </>
      )}
    </AppShell>
  );
}
