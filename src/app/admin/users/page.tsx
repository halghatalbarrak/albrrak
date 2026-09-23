"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import {
  AppShell, Button, Badge, Table, Modal, ui, sp, type Column,
} from "@/components/ui";
import { type Role, STAFF_ROLES, ROLE_AR, toggleIn, LinkBox, linkBoxCard } from "./shared";

interface UserRow {
  id: string; name: string; phone: string | null; email: string | null;
  roles: Role[]; isActive: boolean; isStudent: boolean;
}

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function AdminUsersPage() {
  const { me } = useMe();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [linkBox, setLinkBox] = useState<{ title: string; url: string } | null>(null);

  // تعديل أدوار
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editRoles, setEditRoles] = useState<Role[]>([]);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/users", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — إدارة المستخدمين للمشرف العام والمدير التقنيّ فقط."); return; }
    if (!res.ok) { setErr("تعذّر جلب المستخدمين."); return; }
    setUsers(((await res.json()) as { users: UserRow[] }).users);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleActive(u: UserRow) {
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/users", {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ userId: u.id, active: !u.isActive }),
    });
    if (res.ok) void load();
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر تغيير الحالة."); }
  }

  async function reset(u: UserRow) {
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/users/reset", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ userId: u.id }),
    });
    if (res.ok) {
      const j = (await res.json()) as { activationUrl: string };
      setLinkBox({ title: `رابط إعادة تعيين كلمة سرّ: ${u.name}`, url: j.activationUrl });
    } else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّرت إعادة التعيين."); }
  }

  async function saveRoles() {
    if (!editUser) return;
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/users", {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ userId: editUser.id, roles: editRoles }),
    });
    if (res.ok) { setEditUser(null); void load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر حفظ الأدوار."); }
  }

  const cols: Column<UserRow>[] = [
    { key: "name", header: "الاسم", cell: (u) => <span style={{ opacity: u.isActive ? 1 : 0.5 }}>{u.name}{u.isStudent ? <Badge tone="neutral">طالب</Badge> : null}</span> },
    { key: "phone", header: "الجوال", cell: (u) => <span style={{ direction: "ltr", color: ui.color.muted }}>{u.phone ?? "—"}</span> },
    { key: "roles", header: "الأدوار", cell: (u) => <span style={{ display: "flex", gap: sp(1), flexWrap: "wrap" }}>{u.roles.map((r) => <Badge key={r} tone="primary">{ROLE_AR[r]}</Badge>)}</span> },
    { key: "state", header: "الحالة", cell: (u) => (u.isActive ? <Badge tone="success">مُفعّل</Badge> : <Badge tone="neutral">معطَّل</Badge>) },
    { key: "act", header: "إجراء", cell: (u) => (
      <div style={{ display: "flex", gap: sp(2), justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Button variant="ghost" size="sm" onClick={() => { setEditUser(u); setEditRoles(u.roles.filter((r) => STAFF_ROLES.includes(r))); }}>الأدوار</Button>
        <Button variant="ghost" size="sm" onClick={() => void reset(u)}>إعادة تعيين</Button>
        <Button variant="ghost" size="sm" onClick={() => void toggleActive(u)}>{u.isActive ? "تعطيل" : "تفعيل"}</Button>
      </div>
    ) },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/users"
      title="المستخدمون" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "المستخدمون" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !users && <p style={{ color: ui.color.muted }}>جارٍ التحميل…</p>}

      {users && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp(4) }}>
            <p style={{ color: ui.color.muted, margin: 0 }}>إضافة كادرٍ · تعطيل/تفعيل (لا حذف) · تعديل الأدوار · إعادة تعيين كلمة السرّ.</p>
            <Button onClick={() => router.push("/admin/users/new")}>+ جديد</Button>
          </div>

          {linkBox && (
            <div style={linkBoxCard}>
              <div style={{ fontWeight: 700, marginBottom: sp(1) }}>{linkBox.title}</div>
              <LinkBox url={linkBox.url} />
              <Button variant="ghost" size="sm" style={{ marginTop: sp(2) }} onClick={() => setLinkBox(null)}>إغلاق</Button>
            </div>
          )}

          <Table columns={cols} rows={users} empty="لا مستخدمين." />
        </>
      )}

      <Modal open={editUser !== null} onClose={() => setEditUser(null)} title={editUser ? `أدوار: ${editUser.name}` : ""}
        footer={<><Button onClick={() => void saveRoles()}>حفظ</Button><Button variant="ghost" onClick={() => setEditUser(null)}>إلغاء</Button></>}>
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap" }}>
          {STAFF_ROLES.map((r) => (
            <label key={r} style={{ display: "flex", gap: sp(1), alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={editRoles.includes(r)} onChange={() => setEditRoles((l) => toggleIn(l, r))} />
              {ROLE_AR[r]}
            </label>
          ))}
        </div>
      </Modal>
    </AppShell>
  );
}
