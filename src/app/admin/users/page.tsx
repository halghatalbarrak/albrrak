"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import {
  AppShell, Button, Input, Field, Badge, Table, Modal, ui, sp, type Column,
} from "@/components/ui";

type Role =
  | "TECH_ADMIN" | "SUPER_ADMIN" | "CIRCLE_MANAGER" | "REGISTRAR"
  | "TEACHER" | "RECITER" | "ARIF" | "STUDENT" | "GUARDIAN" | "SELLER";

interface UserRow {
  id: string; name: string; phone: string | null; email: string | null;
  roles: Role[]; isActive: boolean; isStudent: boolean;
}

// الأدوار القابلة للإسناد للكادر من الشاشة (لا STUDENT/GUARDIAN — تُنشأ بالقيد).
// SELLER صلاحيّةٌ مستقلّة (م٦ب) تُمنح لأيّ حساب كادرٍ (معلّم/إداريّ/موظّف سوق).
const STAFF_ROLES: Role[] = ["TECH_ADMIN", "SUPER_ADMIN", "CIRCLE_MANAGER", "REGISTRAR", "TEACHER", "RECITER", "SELLER"];
const ROLE_AR: Record<Role, string> = {
  TECH_ADMIN: "مدير تقنيّ", SUPER_ADMIN: "مشرف عام", CIRCLE_MANAGER: "مدير حلقات",
  REGISTRAR: "مُسجِّل", TEACHER: "معلّم", RECITER: "مُسمِّع", ARIF: "عريف",
  STUDENT: "طالب", GUARDIAN: "وليّ", SELLER: "أمين البيدر",
};

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

/** صندوق رابطٍ مع زرّ نسخٍ جاهزٍ للّصق في واتساب. */
function LinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: sp(2), alignItems: "center", marginTop: sp(3) }}>
      <Input readOnly value={url} style={{ flex: 1, direction: "ltr" }} onFocus={(e) => e.currentTarget.select()} />
      <Button size="sm" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>
        {copied ? "نُسخ ✓" : "نسخ"}
      </Button>
    </div>
  );
}

export default function AdminUsersPage() {
  const { me } = useMe();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [linkBox, setLinkBox] = useState<{ title: string; url: string } | null>(null);

  // نموذج إضافة كادر
  const [addOpen, setAddOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fRoles, setFRoles] = useState<Role[]>(["TEACHER"]);

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

  async function addStaff() {
    setErr(null);
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ name: fName.trim(), phone: fPhone.trim(), roles: fRoles }),
    });
    if (res.ok) {
      const j = (await res.json()) as { activationUrl: string };
      setAddOpen(false); setFName(""); setFPhone(""); setFRoles(["TEACHER"]);
      setLinkBox({ title: "رابط تفعيل الكادر الجديد — أرسله له في واتساب", url: j.activationUrl });
      void load();
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "تعذّر إنشاء الكادر.");
    }
  }

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

  const toggleIn = (list: Role[], r: Role): Role[] => (list.includes(r) ? list.filter((x) => x !== r) : [...list, r]);

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
            <p style={{ color: ui.color.muted, margin: 0 }}>إضافة كادرٍ مباشرةً · تعطيل/تفعيل (لا حذف) · تعديل الأدوار · إعادة تعيين كلمة السرّ.</p>
            <Button onClick={() => setAddOpen(true)}>+ إضافة كادر</Button>
          </div>

          {linkBox && (
            <div style={{ background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, padding: sp(4), marginBottom: sp(5) }}>
              <div style={{ fontWeight: 700, marginBottom: sp(1) }}>{linkBox.title}</div>
              <LinkBox url={linkBox.url} />
              <Button variant="ghost" size="sm" style={{ marginTop: sp(2) }} onClick={() => setLinkBox(null)}>إغلاق</Button>
            </div>
          )}

          <Table columns={cols} rows={users} empty="لا مستخدمين." />
        </>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة كادر"
        footer={<><Button onClick={() => void addStaff()}>إنشاء</Button><Button variant="ghost" onClick={() => setAddOpen(false)}>إلغاء</Button></>}>
        <Field label="الاسم"><Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="اسم الكادر" /></Field>
        <Field label="الجوال"><Input value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="9665… أو 05…" style={{ direction: "ltr" }} /></Field>
        <Field label="الأدوار">
          <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap" }}>
            {STAFF_ROLES.map((r) => (
              <label key={r} style={{ display: "flex", gap: sp(1), alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={fRoles.includes(r)} onChange={() => setFRoles((l) => toggleIn(l, r))} />
                {ROLE_AR[r]}
              </label>
            ))}
          </div>
        </Field>
      </Modal>

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
