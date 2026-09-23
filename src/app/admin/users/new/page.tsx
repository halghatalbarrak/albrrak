"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Input, Field, ui, sp } from "@/components/ui";
import { type Role, STAFF_ROLES, ROLE_AR, toggleIn, LinkBox, linkBoxCard } from "../shared";

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
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function addStaff() {
    setErr(null);
    const t = await token();
    if (!t) return;
    setSaving(true);
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ name: fName.trim(), phone: fPhone.trim(), roles: fRoles }),
    });
    if (res.ok) {
      const j = (await res.json()) as { activationUrl: string };
      setLink(j.activationUrl);
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "تعذّر إنشاء الكادر."); setSaving(false);
    }
  }

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/users"
      title="إضافة كادر"
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "المستخدمون", href: LIST }, { label: "كادر جديد" }]}>

      {link ? (
        <div style={{ ...linkBoxCard, maxWidth: 640, marginBottom: sp(4) }}>
          <div style={{ fontWeight: 700, marginBottom: sp(1) }}>أُنشئ الكادر ✓ — أرسِل له رابط التفعيل في واتساب</div>
          <p style={{ color: ui.color.muted, marginTop: 0, fontSize: ui.text.xs }}>انسخ الرابط الآن؛ لن يظهر مرّةً أخرى.</p>
          <LinkBox url={link} />
          <div style={{ marginTop: sp(3) }}><Button onClick={() => router.push(LIST)}>رجوع للقائمة</Button></div>
        </div>
      ) : (
        <Card style={{ maxWidth: 560 }}>
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
          {err && <p style={{ color: ui.color.danger }}>{err}</p>}
          <div style={{ display: "flex", gap: sp(2), marginTop: sp(2) }}>
            <Button onClick={() => void addStaff()} disabled={saving}>{saving ? "جارٍ…" : "إنشاء"}</Button>
            <Button variant="ghost" onClick={() => router.push(LIST)}>إلغاء</Button>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
