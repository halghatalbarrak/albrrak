"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Field, inputStyle, ui, sp } from "@/components/ui";

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
      const t = await token();
      if (!t) { window.location.href = "/login"; return; }
      const res = await fetch("/api/admin/circles", { headers: { authorization: `Bearer ${t}` } });
      if (res.status === 403) { setErr("لا صلاحية — هذه الشاشة للمدير."); return; }
      if (!res.ok) { setErr("تعذّر جلب البرامج."); return; }
      const data = (await res.json().catch(() => ({}))) as { programs?: Program[] };
      setPrograms(Array.isArray(data.programs) ? data.programs : []);
    })();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    const t = await token();
    if (!t) return;
    setSaving(true);
    const res = await fetch("/api/admin/circles", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    });
    if (res.status === 201) { router.push(LIST); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر إنشاء الحلقة."); setSaving(false); }
  }

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/circles"
      title="حلقة جديدة"
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "الحلقات", href: LIST }, { label: "جديدة" }]}>

      <Card style={{ maxWidth: 560 }}>
        <form onSubmit={onSubmit}>
          <Field label="الاسم"><input style={inputStyle} name="nameAr" required /></Field>
          <Field label="البرنامج">
            <Select name="programId" required defaultValue="">
              <option value="" disabled>اختر…</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
            </Select>
          </Field>
          <Field label="الوقت">
            <Select name="timeSlot" required defaultValue="MAGHRIB">
              <option value="ASR">العصر</option>
              <option value="MAGHRIB">المغرب</option>
            </Select>
          </Field>
          <Field label="الجنس">
            <Select name="gender" required defaultValue="MALE">
              <option value="MALE">بنون</option>
              <option value="FEMALE">بنات</option>
            </Select>
          </Field>
          <Field label="المكان (اختياري)"><input style={inputStyle} name="location" /></Field>
          {err && <p style={{ color: ui.color.danger }}>{err}</p>}
          <div style={{ display: "flex", gap: sp(2), marginTop: sp(2) }}>
            <Button type="submit" disabled={saving}>{saving ? "جارٍ…" : "إنشاء"}</Button>
            <Button type="button" variant="ghost" onClick={() => router.push(LIST)}>إلغاء</Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
