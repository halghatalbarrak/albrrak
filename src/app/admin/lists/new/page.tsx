"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Input, Select, Field, ui, sp } from "@/components/ui";

type Kind = "nationality" | "schoolStage" | "guardianRelation";
const KIND_AR: Record<Kind, string> = { nationality: "جنسية", schoolStage: "مرحلة دراسية", guardianRelation: "صفة قرابة" };

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const LIST = "/admin/lists";

// صفحة إضافة قيمة قائمة — نوعٌ (جنسية/مرحلة/قرابة) + اسم. نفس API/التحقّق (POST /api/admin/lists).
export default function NewListItemPage() {
  const { me } = useMe();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("nationality");
  const [nameAr, setNameAr] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const v = nameAr.trim();
    if (!v) { setErr("القيمة مطلوبة."); return; }
    const t = await token();
    if (!t) return;
    setSaving(true); setErr(null);
    const res = await fetch("/api/admin/lists", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ kind, nameAr: v }),
    });
    if (res.ok) { router.push(LIST); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّرت الإضافة."); setSaving(false); }
  }

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/lists"
      title="قيمة جديدة"
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "القوائم", href: LIST }, { label: "جديدة" }]}>

      <Card style={{ maxWidth: 520 }}>
        <Field label="القائمة">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="nationality">{KIND_AR.nationality}</option>
            <option value="schoolStage">{KIND_AR.schoolStage}</option>
            <option value="guardianRelation">{KIND_AR.guardianRelation}</option>
          </Select>
        </Field>
        <Field label="القيمة">
          <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="قيمة جديدة…"
            onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
        </Field>
        {err && <p style={{ color: ui.color.danger }}>{err}</p>}
        <div style={{ display: "flex", gap: sp(2), marginTop: sp(2) }}>
          <Button onClick={() => void save()} disabled={saving}>{saving ? "جارٍ…" : "إضافة"}</Button>
          <Button variant="ghost" onClick={() => router.push(LIST)}>إلغاء</Button>
        </div>
      </Card>
    </AppShell>
  );
}
