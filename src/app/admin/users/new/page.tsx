"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { tUsers as t } from "@/i18n/ar/users";
import { AppShell, Card, Button, Input, Field, ui, sp } from "@/components/ui";
import {
  type Role, type MuddakirStaffRole, STAFF_ROLES, ROLE_AR, toggleIn,
  MUDDAKIR_STAFF, MUDDAKIR_STAFF_AR, MUDDAKIR_SECTION, MUDDAKIR_NO_PERM,
  MUDDAKIR_EXCLUSIVE, MUDDAKIR_NONE, muddakirStaffCaps, LinkBox, linkBoxCard,
} from "../shared";

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const LIST = "/admin/users";

// صفحة إضافة كادر — النموذج وحده بمساحته. نفس API/التحقّق (POST /api/admin/users). بعد الإنشاء
// **لا يُعاد تلقائياً** بل يُعرَض رابط التفعيل (لمرّةٍ واحدة، يُنسخ للواتساب) ثمّ زرّ العودة للقائمة.
export default function NewStaffPage() {
  const { me } = useMe();
  const router = useRouter();
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fRoles, setFRoles] = useState<Role[]>(["TEACHER"]);
  const [fStaff, setFStaff] = useState<MuddakirStaffRole[]>([]);
  const caps = muddakirStaffCaps(me?.roles ?? [], me?.muddakirStaff ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function addStaff() {
    setErr(null);
    const tok = await token();
    if (!tok) return;
    setSaving(true);
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ name: fName.trim(), phone: fPhone.trim(), roles: fRoles, ...(caps.canEdit ? { muddakirRoles: fStaff } : {}) }),
    });
    if (res.ok) {
      const j = (await res.json()) as { activationUrl: string; muddakirError?: string };
      if (j.muddakirError) setErr(`${t("createRolesPartialPrefix")}${j.muddakirError}`);
      setLink(j.activationUrl);
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? t("errCreate")); setSaving(false);
    }
  }

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/users"
      title={t("newShellTitle")}
      crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbUsersNav"), href: LIST }, { label: t("crumbNewStaff") }]}>

      {link ? (
        <div style={{ ...linkBoxCard, maxWidth: 640, marginBottom: sp(4) }}>
          <div style={{ fontWeight: 700, marginBottom: sp(1) }}>{t("createdTitle")}</div>
          <p style={{ color: ui.color.muted, marginTop: 0, fontSize: ui.text.xs }}>{t("createdHint")}</p>
          <LinkBox url={link} />
          <div style={{ marginTop: sp(3) }}><Button onClick={() => router.push(LIST)}>{t("btnBackToList")}</Button></div>
        </div>
      ) : (
        <Card style={{ maxWidth: 560 }}>
          <Field label={t("fieldName")}><Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder={t("placeholderName")} /></Field>
          <Field label={t("fieldPhone")}><Input value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder={t("placeholderPhone")} style={{ direction: "ltr" }} /></Field>
          {/* الأدوار العامّة — تُعطَّل إن اختيرت وظيفة مدّكر (و١: حصر الوظائف). */}
          <Field label={t("fieldRoles")}>
            <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap" }}>
              {STAFF_ROLES.map((r) => {
                const blocked = fStaff.length > 0;
                return (
                  <label key={r} title={blocked ? MUDDAKIR_EXCLUSIVE : undefined}
                    style={{ display: "flex", gap: sp(1), alignItems: "center", cursor: blocked ? "not-allowed" : "pointer", opacity: blocked ? 0.5 : 1 }}>
                    <input type="checkbox" disabled={blocked} checked={fRoles.includes(r)} onChange={() => setFRoles((l) => toggleIn(l, r))} />
                    {ROLE_AR[r]}
                  </label>
                );
              })}
            </div>
          </Field>
          {/* وظيفة المدّكر (و١): اختيارٌ واحدٌ مع «لا شيء»، تُعطَّل إن حُدّد دورٌ عامّ. */}
          <Field label={MUDDAKIR_SECTION}>
            <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap" }}>
              {(() => {
                const rolesBlock = fRoles.length > 0;
                const none = (
                  <label key="none" title={rolesBlock ? MUDDAKIR_EXCLUSIVE : undefined}
                    style={{ display: "flex", gap: sp(1), alignItems: "center", cursor: rolesBlock ? "not-allowed" : "pointer", opacity: rolesBlock ? 0.5 : 1 }}>
                    <input type="radio" name="newMuddakirStaff" disabled={rolesBlock} checked={fStaff.length === 0} onChange={() => setFStaff([])} />
                    {MUDDAKIR_NONE}
                  </label>
                );
                const opts = MUDDAKIR_STAFF.map((r) => {
                  const allowed = caps.can(r) && !rolesBlock;
                  const title = rolesBlock ? MUDDAKIR_EXCLUSIVE : caps.can(r) ? undefined : MUDDAKIR_NO_PERM;
                  return (
                    <label key={r} title={title}
                      style={{ display: "flex", gap: sp(1), alignItems: "center", cursor: allowed ? "pointer" : "not-allowed", opacity: allowed ? 1 : 0.5 }}>
                      <input type="radio" name="newMuddakirStaff" disabled={!allowed} checked={fStaff[0] === r}
                        onChange={() => { setFStaff([r]); setFRoles([]); }} />
                      {MUDDAKIR_STAFF_AR[r]}
                    </label>
                  );
                });
                return [none, ...opts];
              })()}
            </div>
            {!caps.canEdit && <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: `${sp(1)} 0 0` }}>{MUDDAKIR_NO_PERM}</p>}
          </Field>
          {err && <p style={{ color: ui.color.danger }}>{err}</p>}
          <div style={{ display: "flex", gap: sp(2), marginTop: sp(2) }}>
            <Button onClick={() => void addStaff()} disabled={saving}>{saving ? t("btnSaving") : t("btnCreate")}</Button>
            <Button variant="ghost" onClick={() => router.push(LIST)}>{t("btnCancel")}</Button>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
