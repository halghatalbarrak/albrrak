"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Field, inputStyle, ui, sp } from "@/components/ui";
import { tCircles as t } from "@/i18n/ar/circles";

interface Program { id: string; key: string; nameAr: string }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const LIST = "/admin/circles";

// صفحة إضافة حلقة — النموذج وحده بمساحته (نمط «صفحة إضافة»). نفس API ونفس التحقّق؛
// بعد الإنشاء يعود للقائمة تلقائياً. لا منطق إنشاءٍ جديد — طبقة تنقّلٍ وعرض.
export default function NewCirclePage() {
  const { me } = useMe();
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const tok = await token();
      if (!tok) { window.location.href = "/login"; return; }
      const res = await fetch("/api/admin/circles", { headers: { authorization: `Bearer ${tok}` } });
      if (res.status === 403) { setErr(t("errForbidden")); return; }
      if (!res.ok) { setErr(t("errLoadPrograms")); return; }
      const data = (await res.json().catch(() => ({}))) as { programs?: Program[] };
      setPrograms(Array.isArray(data.programs) ? data.programs : []);
    })();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    const tok = await token();
    if (!tok) return;
    setSaving(true);
    const res = await fetch("/api/admin/circles", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify(body),
    });
    if (res.status === 201) { router.push(LIST); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? t("errCreateCircle")); setSaving(false); }
  }

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/circles"
      title={t("newTitle")}
      crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbCircles"), href: LIST }, { label: t("crumbNew") }]}>

      <Card style={{ maxWidth: 560 }}>
        <form onSubmit={onSubmit}>
          <Field label={t("fieldName")}><input style={inputStyle} name="nameAr" required /></Field>
          <Field label={t("fieldProgram")}>
            <Select name="programId" required defaultValue="">
              <option value="" disabled>{t("selectPlaceholder")}</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
            </Select>
          </Field>
          <Field label={t("fieldSlot")}>
            <Select name="timeSlot" required defaultValue="MAGHRIB">
              <option value="ASR">{t("slotAsr")}</option>
              <option value="MAGHRIB">{t("slotMaghrib")}</option>
            </Select>
          </Field>
          <Field label={t("fieldGender")}>
            <Select name="gender" required defaultValue="MALE">
              <option value="MALE">{t("genderMale")}</option>
              <option value="FEMALE">{t("genderFemale")}</option>
            </Select>
          </Field>
          <Field label={t("fieldLocation")}><input style={inputStyle} name="location" /></Field>
          {err && <p style={{ color: ui.color.danger }}>{err}</p>}
          <div style={{ display: "flex", gap: sp(2), marginTop: sp(2) }}>
            <Button type="submit" disabled={saving}>{saving ? t("savingBtn") : t("createBtn")}</Button>
            <Button type="button" variant="ghost" onClick={() => router.push(LIST)}>{t("cancelBtn")}</Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
