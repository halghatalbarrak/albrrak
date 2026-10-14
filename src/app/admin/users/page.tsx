"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { formatPhoneForDisplay } from "@/lib/phone";
import { useMe } from "@/lib/useMe";
import { tUsers as t } from "@/i18n/ar/users";
import {
  AppShell, Button, Badge, Table, Modal, ui, sp, type Column,
} from "@/components/ui";
import {
  type Role, type MuddakirStaffRole, STAFF_ROLES, ROLE_AR, toggleIn,
  MUDDAKIR_STAFF, MUDDAKIR_STAFF_AR, MUDDAKIR_SECTION, MUDDAKIR_NO_PERM, MUDDAKIR_SENT,
  MUDDAKIR_EXCLUSIVE, MUDDAKIR_NONE, MUDDAKIR_EXCESS, violatesExclusivity,
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

  // تعديل أدوار (عامّة + مدّكر)
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editRoles, setEditRoles] = useState<Role[]>([]);
  const [editStaff, setEditStaff] = useState<MuddakirStaffRole[]>([]);
  const caps = muddakirStaffCaps(me?.roles ?? [], me?.muddakirStaff ?? []);

  const load = useCallback(async () => {
    const tok = await token();
    if (!tok) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/users", { headers: { authorization: `Bearer ${tok}` } });
    if (res.status === 403) { setErr(t("errNoPermission")); return; }
    if (!res.ok) { setErr(t("errLoad")); return; }
    setUsers(((await res.json()) as { users: UserRow[] }).users);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // انتحال الشخصيّة: يظهر لـTECH_ADMIN فقط، ولا يظهر عند مديرٍ تقنيٍّ آخر (ولا عند نفسه — فهو تقنيّ).
  const canImpersonate = (u: UserRow) => (me?.roles?.includes("TECH_ADMIN") ?? false) && !u.roles.includes("TECH_ADMIN");

  async function startImpersonate(u: UserRow) {
    const tok = await token();
    if (!tok) return;
    const res = await fetch("/api/impersonate/start", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ targetUserId: u.id }),
    });
    if (res.ok) { window.location.href = "/"; } // يرى المنصّة بعينه
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? t("errImpersonate")); }
  }

  async function toggleActive(u: UserRow) {
    const tok = await token();
    if (!tok) return;
    const res = await fetch("/api/admin/users", {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ userId: u.id, active: !u.isActive }),
    });
    if (res.ok) void load();
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? t("errToggleActive")); }
  }

  async function reset(u: UserRow) {
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
    // حفظٌ واحد: الأدوار العامّة + أدوار المدّكر معاً.
    const body: Record<string, unknown> = { userId: editUser.id, roles: editRoles };
    if (caps.canEdit) body.muddakirRoles = editStaff;
    const res = await fetch("/api/admin/users", {
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

  const cols: Column<UserRow>[] = [
    { key: "name", header: t("colName"), cell: (u) => <span style={{ opacity: u.isActive ? 1 : 0.5 }}>{u.name}{u.isStudent ? <Badge tone="neutral">{t("badgeStudent")}</Badge> : null}</span> },
    { key: "phone", header: t("colPhone"), cell: (u) => <span style={{ direction: "ltr", color: ui.color.muted }}>{u.phone ? formatPhoneForDisplay(u.phone) : "—"}</span> },
    { key: "roles", header: t("colRoles"), cell: (u) => (
      <span style={{ display: "flex", gap: sp(1), flexWrap: "wrap" }}>
        {u.roles.map((r) => <Badge key={r} tone="primary">{ROLE_AR[r]}</Badge>)}
        {u.muddakirStaff.map((r) => <Badge key={r} tone="bronze">{MUDDAKIR_STAFF_AR[r]}</Badge>)}
        {violatesExclusivity(u.roles, u.muddakirStaff) && <Badge tone="danger">{MUDDAKIR_EXCESS}</Badge>}
      </span>
    ) },
    { key: "state", header: t("colState"), cell: (u) => (u.isActive ? <Badge tone="success">{t("stateActive")}</Badge> : <Badge tone="neutral">{t("stateDisabled")}</Badge>) },
    { key: "act", header: t("colAction"), cell: (u) => (
      <div style={{ display: "flex", gap: sp(2), justifyContent: "flex-end", flexWrap: "wrap" }}>
        {canImpersonate(u) && <Button variant="bronze" size="sm" onClick={() => void startImpersonate(u)}>{t("btnImpersonate")}</Button>}
        <Button variant="ghost" size="sm" onClick={() => { setEditUser(u); setEditRoles(u.roles.filter((r) => STAFF_ROLES.includes(r))); setEditStaff(u.muddakirStaff); }}>{t("btnRoles")}</Button>
        <Button variant="ghost" size="sm" onClick={() => void reset(u)}>{t("btnReset")}</Button>
        <Button variant="ghost" size="sm" onClick={() => void toggleActive(u)}>{u.isActive ? t("btnDisable") : t("btnEnable")}</Button>
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

          <Table columns={cols} rows={users} empty={t("tableEmpty")} />
        </>
      )}

      <Modal open={editUser !== null} onClose={() => setEditUser(null)} title={editUser ? `${t("rolesModalTitlePrefix")}${editUser.name}` : ""}
        footer={<><Button onClick={() => void saveRoles()}>{t("btnSave")}</Button><Button variant="ghost" onClick={() => setEditUser(null)}>{t("btnCancel")}</Button></>}>
        {/* الأدوار العامّة — تُعطَّل إن اختيرت وظيفة مدّكر (و١: حصر الوظائف). */}
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

        {/* وظيفة المدّكر (و١): اختيارٌ واحدٌ (radio) مع «لا شيء». تُعطَّل إن حُدّد دورٌ عامّ. */}
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
    </AppShell>
  );
}
