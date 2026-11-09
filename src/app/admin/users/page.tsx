"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { formatPhoneForDisplay } from "@/lib/phone";
import { useMe } from "@/lib/useMe";
import { tUsers as t } from "@/i18n/ar/users";
import {
  AppShell, Button, Badge, Table, Modal, ListToolbar, ui, sp, type Column,
} from "@/components/ui";
import { normalizeArabic } from "@/lib/normalize-arabic";
import {
  type Role, type MuddakirStaffRole, STAFF_ROLES, ROLE_AR, toggleIn,
  MUDDAKIR_STAFF, MUDDAKIR_STAFF_AR, MUDDAKIR_SECTION, MUDDAKIR_NO_PERM, MUDDAKIR_SENT,
  MUDDAKIR_EXCLUSIVE, MUDDAKIR_NONE, violatesExclusivity,
  muddakirStaffCaps, LinkBox, linkBoxCard,
} from "./shared";

interface UserRow {
  id: string; name: string; phone: string | null; email: string | null;
  roles: Role[]; isActive: boolean; isStudent: boolean; muddakirStaff: MuddakirStaffRole[];
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
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "staff" | "guardians" | "students">("all");

  // role editing modal (platform + muddakir)
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editRoles, setEditRoles] = useState<Role[]>([]);
  const [editStaff, setEditStaff] = useState<MuddakirStaffRole[]>([]);
  const caps = muddakirStaffCaps(me?.roles ?? [], me?.muddakirStaff ?? []);

  // edit data modal (name + phone)
  const [editDataUser, setEditDataUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  // delete confirmation
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);

  // ⋯ menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const load = useCallback(async () => {
    const tok = await token();
    if (!tok) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/users", { headers: { authorization: `Bearer ${tok}` } });
    if (res.status === 403) { setErr(t("errNoPermission")); return; }
    if (!res.ok) { setErr(t("errLoad")); return; }
    setUsers(((await res.json()) as { users: UserRow[] }).users);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const canImpersonate = (u: UserRow) => (me?.roles?.includes("TECH_ADMIN") ?? false) && !u.roles.includes("TECH_ADMIN");

  async function startImpersonate(u: UserRow) {
    setOpenMenuId(null);
    const tok = await token();
    if (!tok) return;
    const res = await fetch("/api/impersonate/start", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ targetUserId: u.id }),
    });
    if (res.ok) { window.location.href = "/"; }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? t("errImpersonate")); }
  }

  async function toggleActive(u: UserRow) {
    setOpenMenuId(null);
    const tok = await token();
    if (!tok) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    if (res.ok) void load();
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? t("errToggleActive")); }
  }

  async function reset(u: UserRow) {
    setOpenMenuId(null);
    const tok = await token();
    if (!tok) return;
    const res = await fetch("/api/admin/users/reset", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ userId: u.id }),
    });
    if (res.ok) {
      const j = (await res.json()) as { activationUrl: string };
      setLinkBox({ title: `${t("resetLinkTitlePrefix")}${u.name}`, url: j.activationUrl });
    } else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? t("errReset")); }
  }

  async function saveRoles() {
    if (!editUser) return;
    const tok = await token();
    if (!tok) return;
    const body: Record<string, unknown> = { roles: editRoles };
    if (caps.canEdit) body.muddakirRoles = editStaff;
    const res = await fetch(`/api/admin/users/${editUser.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const j = (await res.json()) as { muddakir?: { requested: string[] }; muddakirError?: string };
      if (j.muddakirError) setErr(`${t("saveRolesPartialPrefix")}${j.muddakirError}`);
      else if (j.muddakir?.requested?.length) setErr(MUDDAKIR_SENT);
      else setErr(null);
      setEditUser(null); void load();
    } else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? t("errSaveRoles")); }
  }

  const STAFF_ROLE_SET = new Set<string>(["SUPER_ADMIN", "TECH_ADMIN", "CIRCLE_MANAGER", "TEACHER", "REGISTRAR", "ATTENDANCE_MARKER"]);
  const visibleUsers = users?.filter((u) => {
    if (tab === "staff" && !u.roles.some((r) => STAFF_ROLE_SET.has(r))) return false;
    if (tab === "guardians" && !u.roles.includes("GUARDIAN" as (typeof u.roles)[number])) return false;
    if (tab === "students" && !u.isStudent) return false;
    if (search) {
      const q = normalizeArabic(search);
      const nameMatch = normalizeArabic(u.name).includes(q);
      const phoneMatch = u.phone ? u.phone.includes(search) : false;
      const emailMatch = u.email ? u.email.toLowerCase().includes(search.toLowerCase()) : false;
      if (!nameMatch && !phoneMatch && !emailMatch) return false;
    }
    return true;
  }) ?? null;

  async function saveEditData() {
    if (!editDataUser) return;
    const tok = await token();
    if (!tok) return;
    const body: Record<string, unknown> = {};
    if (editName.trim() !== editDataUser.name) body.name = editName.trim();
    const displayPhone = editDataUser.phone ? formatPhoneForDisplay(editDataUser.phone) : "";
    const rawPhone = editPhone.trim();
    if (rawPhone && rawPhone !== displayPhone) body.phone = rawPhone;
    if (editIsActive !== editDataUser.isActive) body.isActive = editIsActive;
    if (Object.keys(body).length === 0) { setEditDataUser(null); return; }
    const res = await fetch(`/api/admin/users/${editDataUser.id}`, {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify(body),
    });
    if (res.ok) { setEditDataUser(null); void load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? t("errEdit")); }
  }

  async function confirmDelete() {
    if (!deleteUser) return;
    const tok = await token();
    if (!tok) return;
    const res = await fetch(`/api/admin/users/${deleteUser.id}`, {
      method: "DELETE", headers: { authorization: `Bearer ${tok}` },
    });
    if (res.ok) { setDeleteUser(null); void load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? t("errDelete")); setDeleteUser(null); }
  }

  const cols: Column<UserRow>[] = [
    { key: "name", header: t("colName"), cell: (u) => <span style={{ opacity: u.isActive ? 1 : 0.5 }}>{u.name}{u.isStudent ? <Badge tone="neutral">{t("badgeStudent")}</Badge> : null}</span> },
    { key: "phone", header: t("colPhone"), cell: (u) => <span style={{ direction: "ltr", color: ui.color.muted }}>{u.phone ? formatPhoneForDisplay(u.phone) : "—"}</span> },
    { key: "roles", header: t("colRoles"), cell: (u) => (
      <span style={{ display: "flex", gap: sp(1), flexWrap: "wrap", alignItems: "center" }}>
        {u.roles.map((r) => <Badge key={r} tone="primary">{ROLE_AR[r]}</Badge>)}
        {u.muddakirStaff.map((r) => <Badge key={r} tone="bronze">{MUDDAKIR_STAFF_AR[r]}</Badge>)}
        {violatesExclusivity(u.roles, u.muddakirStaff) && (
          <span title={t("conflictTooltip")} style={{ cursor: "help", color: ui.color.danger, fontSize: ui.text.xs }}>⚠</span>
        )}
      </span>
    ) },
    { key: "state", header: t("colState"), cell: (u) => (u.isActive ? <Badge tone="success">{t("stateActive")}</Badge> : <Badge tone="neutral">{t("stateDisabled")}</Badge>) },
    { key: "act", header: t("colAction"), cell: (u) => (
      <div style={{ display: "flex", gap: sp(2), justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
        {/* زر تعديل البيانات — ظاهر دائماً */}
        <Button variant="ghost" size="sm" onClick={() => {
          setEditDataUser(u);
          setEditName(u.name);
          setEditPhone(u.phone ? formatPhoneForDisplay(u.phone) : "");
          setEditIsActive(u.isActive);
        }}>{t("btnEdit")}</Button>

        {/* زر الأدوار — للتعديل السريع لأدوار المدّكر */}
        <Button variant="ghost" size="sm" onClick={() => { setEditUser(u); setEditRoles(u.roles.filter((r) => STAFF_ROLES.includes(r))); setEditStaff(u.muddakirStaff); }}>{t("btnRoles")}</Button>

        {/* قائمة ⋯ */}
        <div style={{ position: "relative" }} ref={openMenuId === u.id ? menuRef : null}>
          <Button variant="ghost" size="sm" onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}>{t("menuMore")}</Button>
          {openMenuId === u.id && (
            <div style={{
              position: "absolute", top: "100%", insetInlineEnd: 0, zIndex: 50,
              background: ui.color.surface, border: `1px solid ${ui.color.border}`,
              borderRadius: 6, padding: `${sp(1)} 0`, minWidth: 140,
              boxShadow: "0 4px 12px rgba(0,0,0,.12)",
            }}>
              {canImpersonate(u) && (
                <button style={menuItemStyle} onClick={() => void startImpersonate(u)}>{t("btnImpersonate")}</button>
              )}
              <button style={menuItemStyle} onClick={() => { setOpenMenuId(null); void reset(u); }}>{t("btnReset")}</button>
              <button style={menuItemStyle} onClick={() => { void toggleActive(u); }}>{u.isActive ? t("btnDisable") : t("btnEnable")}</button>
              <div style={{ borderTop: `1px solid ${ui.color.border}`, margin: `${sp(1)} 0` }} />
              <button style={{ ...menuItemStyle, color: ui.color.danger }} onClick={() => { setOpenMenuId(null); setDeleteUser(u); }}>{t("btnDelete")}</button>
            </div>
          )}
        </div>
      </div>
    ) },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/users"
      title={t("shellTitle")} crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbUsers") }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !users && <p style={{ color: ui.color.muted }}>{t("loading")}</p>}

      {users && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sp(4) }}>
            <p style={{ color: ui.color.muted, margin: 0 }}>{t("intro")}</p>
            <Button onClick={() => router.push("/admin/users/new")}>{t("btnNew")}</Button>
          </div>

          {linkBox && (
            <div style={linkBoxCard}>
              <div style={{ fontWeight: 700, marginBottom: sp(1) }}>{linkBox.title}</div>
              <LinkBox url={linkBox.url} />
              <Button variant="ghost" size="sm" style={{ marginTop: sp(2) }} onClick={() => setLinkBox(null)}>{t("btnCloseLink")}</Button>
            </div>
          )}

          <div style={{ display: "flex", gap: sp(1), marginBottom: sp(3), flexWrap: "wrap" }}>
            {(["all", "staff", "guardians", "students"] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)}
                style={{ padding: `${sp(1.5)} ${sp(3)}`, borderRadius: ui.radius.full, border: `1px solid ${ui.color.border}`, cursor: "pointer", fontSize: ui.text.xs, fontFamily: ui.font, background: tab === k ? ui.color.primary : ui.color.surface, color: tab === k ? "#fff" : ui.color.text }}>
                {t(k === "all" ? "tabAll" : k === "staff" ? "tabStaff" : k === "guardians" ? "tabGuardians" : "tabStudents")}
              </button>
            ))}
          </div>
          <ListToolbar value={search} onChange={setSearch} placeholder={t("searchPlaceholder")} />
          <Table columns={cols} rows={visibleUsers ?? []} empty={t("tableEmpty")} />
        </>
      )}

      {/* نافذة تعديل الأدوار (أدوار المدّكر) */}
      <Modal open={editUser !== null} onClose={() => setEditUser(null)} title={editUser ? `${t("rolesModalTitlePrefix")}${editUser.name}` : ""}
        footer={<><Button onClick={() => void saveRoles()}>{t("btnSave")}</Button><Button variant="ghost" onClick={() => setEditUser(null)}>{t("btnCancel")}</Button></>}>
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap" }}>
          {STAFF_ROLES.map((r) => {
            const blocked = editStaff.length > 0;
            return (
              <label key={r} title={blocked ? MUDDAKIR_EXCLUSIVE : undefined}
                style={{ display: "flex", gap: sp(1), alignItems: "center", cursor: blocked ? "not-allowed" : "pointer", opacity: blocked ? 0.5 : 1 }}>
                <input type="checkbox" disabled={blocked} checked={editRoles.includes(r)} onChange={() => setEditRoles((l) => toggleIn(l, r))} />
                {ROLE_AR[r]}
              </label>
            );
          })}
        </div>
        <div style={{ marginTop: sp(4), paddingTop: sp(3), borderTop: `1px solid ${ui.color.border}` }}>
          <div style={{ fontWeight: 700, fontSize: ui.text.xs, marginBottom: sp(2), color: ui.color.bronze }}>{MUDDAKIR_SECTION}</div>
          <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap" }}>
            {(() => {
              const rolesBlock = editRoles.length > 0;
              const none = (
                <label key="none" title={rolesBlock ? MUDDAKIR_EXCLUSIVE : undefined}
                  style={{ display: "flex", gap: sp(1), alignItems: "center", cursor: rolesBlock ? "not-allowed" : "pointer", opacity: rolesBlock ? 0.5 : 1 }}>
                  <input type="radio" name="muddakirStaff" disabled={rolesBlock} checked={editStaff.length === 0} onChange={() => setEditStaff([])} />
                  {MUDDAKIR_NONE}
                </label>
              );
              const opts = MUDDAKIR_STAFF.map((r) => {
                const allowed = caps.can(r) && !rolesBlock;
                const title = rolesBlock ? MUDDAKIR_EXCLUSIVE : caps.can(r) ? undefined : MUDDAKIR_NO_PERM;
                return (
                  <label key={r} title={title}
                    style={{ display: "flex", gap: sp(1), alignItems: "center", cursor: allowed ? "pointer" : "not-allowed", opacity: allowed ? 1 : 0.5 }}>
                    <input type="radio" name="muddakirStaff" disabled={!allowed} checked={editStaff[0] === r}
                      onChange={() => { setEditStaff([r]); setEditRoles([]); }} />
                    {MUDDAKIR_STAFF_AR[r]}
                  </label>
                );
              });
              return [none, ...opts];
            })()}
          </div>
          {caps.adminActor && <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: `${sp(2)} 0 0` }}>{t("adminActorNote")}</p>}
          {!caps.canEdit && <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: `${sp(2)} 0 0` }}>{MUDDAKIR_NO_PERM}</p>}
        </div>
      </Modal>

      {/* نافذة تعديل البيانات */}
      <Modal open={editDataUser !== null} onClose={() => setEditDataUser(null)}
        title={editDataUser ? `${t("editModalTitlePrefix")}${editDataUser.name}` : ""}
        footer={<><Button onClick={() => void saveEditData()}>{t("btnSaveEdit")}</Button><Button variant="ghost" onClick={() => setEditDataUser(null)}>{t("btnCancel")}</Button></>}>
        <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
          <label style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
            <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("fieldNameLabel")}</span>
            <input style={inputStyle} value={editName} onChange={(e) => setEditName(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
            <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("fieldPhoneLabel")}</span>
            <input style={{ ...inputStyle, direction: "ltr" }} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
          </label>
          <label style={{ display: "flex", gap: sp(2), alignItems: "center" }}>
            <input type="checkbox" checked={editIsActive} onChange={(e) => setEditIsActive(e.target.checked)} />
            <span style={{ fontSize: ui.text.xs }}>{editIsActive ? t("stateActiveLabel") : t("stateDisabledLabel")}</span>
          </label>
        </div>
      </Modal>

      {/* نافذة تأكيد الحذف */}
      <Modal open={deleteUser !== null} onClose={() => setDeleteUser(null)}
        title={deleteUser ? `${t("btnDelete")}: ${deleteUser.name}` : ""}
        footer={
          <>
            <Button variant="danger" onClick={() => void confirmDelete()}>{t("btnConfirmDelete")}</Button>
            <Button variant="ghost" onClick={() => setDeleteUser(null)}>{t("btnCancel")}</Button>
          </>
        }>
        <p>{t("deleteConfirmMsg")}</p>
      </Modal>
    </AppShell>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "right", padding: `${sp(2)} ${sp(3)}`,
  background: "none", border: "none", cursor: "pointer", fontSize: ui.text.xs,
  color: ui.color.text,
};

const inputStyle: React.CSSProperties = {
  padding: `${sp(2)} ${sp(3)}`, borderRadius: 6, border: `1px solid ${ui.color.border}`,
  fontSize: ui.text.xs, background: ui.color.surface, color: ui.color.text, width: "100%",
};
