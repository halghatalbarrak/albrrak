"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Input, Field, Select, ui, sp } from "@/components/ui";

interface Guarded { studentId: string; name: string }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const LIST = "/bidder";
const EMPTY = { nameAr: "", proposedPricePoints: "", imageUrl: "", scope: "child" as "child" | "public" };

// صفحة إضافة ثمرة (وليّ الأمر) — النموذج وحده بمساحته. نفس API/التحقّق (POST /api/market/gifts)؛
// بعد الإرسال يعود لبيدره (برسالة نجاحٍ عبر sessionStorage). الثمرة تبدأ بانتظار اعتماد الإدارة.
export default function NewGiftPage() {
  const { me } = useMe();
  const router = useRouter();
  const [guarded, setGuarded] = useState<Guarded[] | null>(null);
  const [student, setStudent] = useState<string>("");
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const initial = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("studentId") ?? "" : "";
    void (async () => {
      const t = await token();
      if (!t) { window.location.href = "/login"; return; }
      const res = await fetch("/api/me/guarded", { headers: { authorization: `Bearer ${t}` } });
      if (res.ok) {
        const list = ((await res.json()) as { students: Guarded[] }).students;
        setGuarded(list);
        setStudent(list.some((g) => g.studentId === initial) ? initial : list[0]?.studentId ?? "");
      } else setGuarded([]);
    })();
  }, []);

  const activeName = guarded?.find((g) => g.studentId === student)?.name ?? "";

  async function addGift() {
    setErr(null);
    const t = await token();
    if (!t) return;
    setSaving(true);
    const res = await fetch("/api/market/gifts", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({
        nameAr: form.nameAr.trim(),
        proposedPricePoints: Number(form.proposedPricePoints),
        imageUrl: form.imageUrl.trim() || null,
        targetStudentId: form.scope === "child" ? student : null,
      }),
    });
    if (res.ok) {
      if (typeof window !== "undefined") window.sessionStorage.setItem("bidderGiftSent", "1");
      router.push(LIST);
    } else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر إرسال الثمرة."); setSaving(false); }
  }

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/bidder"
      title="أضِف ثمرة"
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "البيدر", href: LIST }, { label: "ثمرة جديدة" }]}>

      {guarded == null ? (
        <p style={{ color: ui.color.muted }}>جارٍ التحميل…</p>
      ) : guarded.length === 0 ? (
        <Card style={{ maxWidth: 520 }}><p style={{ margin: 0 }}>لا أبناء مرتبطون بحسابك.</p></Card>
      ) : (
        <Card style={{ maxWidth: 640 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp(3) }}>
            {guarded.length > 1 && (
              <Field label="الابن">
                <Select value={student} onChange={(e) => setStudent(e.target.value)}>
                  {guarded.map((g) => <option key={g.studentId} value={g.studentId}>{g.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="اسم الثمرة"><Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} placeholder="مثال: دراجة" /></Field>
            <Field label="القيمة المقترحة (نقاط)"><Input type="number" value={form.proposedPricePoints} onChange={(e) => setForm((f) => ({ ...f, proposedPricePoints: e.target.value }))} placeholder="50" /></Field>
            <Field label="رابط الصورة (اختياريّ)"><Input value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" style={{ direction: "ltr" }} /></Field>
            <Field label="لمن؟">
              <Select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as "child" | "public" }))}>
                <option value="child">خاصّة بـ {activeName}</option>
                <option value="public">عامّة لكلّ البيدر</option>
              </Select>
            </Field>
          </div>
          <p style={{ fontSize: ui.text.xs, color: ui.color.muted, marginTop: sp(2) }}>تُعرَض بعد اعتماد الإدارة للقيمة.</p>
          {err && <p style={{ color: ui.color.danger }}>{err}</p>}
          <div style={{ display: "flex", gap: sp(2), marginTop: sp(2) }}>
            <Button onClick={() => void addGift()} disabled={saving}>{saving ? "جارٍ…" : "أرسِل للاعتماد"}</Button>
            <Button variant="ghost" onClick={() => router.push(LIST)}>إلغاء</Button>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
