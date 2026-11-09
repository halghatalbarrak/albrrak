"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Field, inputStyle, ui, sp } from "@/components/ui";
import { tCircles as t } from "@/i18n/ar/circles";
import type { CircleEditData, TeacherRow } from "@/server/circles";

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const LIST = "/admin/circles";

export default function EditCirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useMe();
  const router = useRouter();
  const [circle, setCircle] = useState<CircleEditData | null>(null);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    token().then(async (tok) => {
      if (!tok) return;
      const auth = { authorization: `Bearer ${tok}` };
      const [cr, tr] = await Promise.all([
        fetch(`/api/admin/circles/${id}`, { headers: auth }),
        fetch("/api/admin/circles", { headers: auth }),
      ]);
      if (!cr.ok) { setErr(t("errLoadCircle")); return; }
      const cd = (await cr.json()) as { circle: CircleEditData };
      setCircle(cd.circle);
      if (tr.ok) {
        const td = (await tr.json()) as { teachers?: TeacherRow[] };
        if (td.teachers) setTeachers(td.teachers);
      }
    });
  }, [id]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!circle) return;
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    if (data.teacherId === "") delete data.teacherId;
    const tok = await token();
    if (!tok) return;
    setSaving(true);
    const res = await fetch(`/api/admin/circles/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify(data),
    });
    if (res.status === 204) {
      router.push(LIST);
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? t("errUpdateCircle"));
      setSaving(false);
    }
  }

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/circles"
      title={circle ? `${t("editTitle")}: ${circle.nameAr}` : t("editTitle")}
      crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbCircles"), href: LIST }, { label: t("crumbEdit") }]}>

      {err && !circle && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!circle && !err && <p style={{ color: ui.color.muted }}>{t("savingBtn")}</p>}

      {circle && (
        <Card style={{ maxWidth: 560 }}>
          <form onSubmit={onSubmit}>
            <Field label={t("fieldName")}>
              <input style={inputStyle} name="nameAr" required defaultValue={circle.nameAr} />
            </Field>
            <Field label={t("fieldSlot")}>
              <Select name="timeSlot" required defaultValue={circle.timeSlot}>
                <option value="ASR">{t("slotAsr")}</option>
                <option value="MAGHRIB">{t("slotMaghrib")}</option>
                <option value="ISHA">{t("slotIsha")}</option>
              </Select>
            </Field>
            <Field label={t("fieldGender")}>
              <Select name="gender" required defaultValue={circle.gender}>
                <option value="MALE">{t("genderMale")}</option>
                <option value="FEMALE">{t("genderFemale")}</option>
              </Select>
            </Field>
            <Field label={t("fieldLocation")}>
              <input style={inputStyle} name="location" defaultValue={circle.location ?? ""} />
            </Field>
            <Field label={t("fieldTeacher")}>
              <Select name="teacherId" defaultValue={circle.teacherId ?? ""}>
                <option value="">{t("teacherPlaceholder")}</option>
                {teachers.length === 0
                  ? <option disabled>{t("noTeachers")}</option>
                  : teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
              </Select>
            </Field>
            {err && <p style={{ color: ui.color.danger }}>{err}</p>}
            <div style={{ display: "flex", gap: sp(2), marginTop: sp(2) }}>
              <Button type="submit" disabled={saving}>{saving ? t("savingBtn") : t("saveBtn")}</Button>
              <Button type="button" variant="ghost" onClick={() => router.push(LIST)}>{t("cancelBtn")}</Button>
            </div>
          </form>
        </Card>
      )}
    </AppShell>
  );
}
