"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Field, inputStyle, ui, sp } from "@/components/ui";
import { tCircles as t } from "@/i18n/ar/circles";
import type { TeacherRow } from "@/server/circles";

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
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);

  useEffect(() => {
    token().then((tok) => {
      if (!tok) return;
      fetch("/api/admin/circles", { headers: { authorization: `Bearer ${tok}` } })
        .then((r) => r.json())
        .then((j: { teachers?: TeacherRow[] }) => { if (j.teachers) setTeachers(j.teachers); })
        .catch(() => setErr(t("errLoadTeachers")));
    });
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    if (data.teacherId === "") delete data.teacherId;
    const tok = await token();
    if (!tok) return;
    setSaving(true);
    const res = await fetch("/api/admin/circles", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify(data),
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
          <Field label={t("fieldSlot")}>
            <Select name="timeSlot" required defaultValue="MAGHRIB">
              <option value="ASR">{t("slotAsr")}</option>
              <option value="MAGHRIB">{t("slotMaghrib")}</option>
              <option value="ISHA">{t("slotIsha")}</option>
            </Select>
          </Field>
          <Field label={t("fieldGender")}>
            <Select name="gender" required defaultValue="MALE">
              <option value="MALE">{t("genderMale")}</option>
              <option value="FEMALE">{t("genderFemale")}</option>
            </Select>
          </Field>
          <Field label={t("fieldTeacher")}>
            <Select name="teacherId" defaultValue="">
              <option value="">{t("teacherPlaceholder")}</option>
              {teachers.length === 0
                ? <option disabled>{t("noTeachers")}</option>
                : teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
            </Select>
          </Field>
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
