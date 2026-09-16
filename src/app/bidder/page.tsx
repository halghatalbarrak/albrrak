"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, Button, Input, Field, Select, Badge, Card, ui, sp } from "@/components/ui";

interface Guarded { studentId: string; name: string }
interface BidderItem { id: string; nameAr: string; imageUrl: string | null; pricePoints: number; stock: number | null }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const EMPTY = { nameAr: "", proposedPricePoints: "", imageUrl: "", scope: "child" as "child" | "public" };

// صفحة وليّ الأمر — بيدر أبنائه (م٦ب-٢): تبويباتٌ لأبنائه · عرض بيدر كلّ ابن (نافذة) ·
// زرّ «أضف ثمرة» (تبدأ بانتظار موافقة الإدارة). مصطلحات الحصاد: بيدر · ثمرة · جَنْي.
export default function BidderPage() {
  const { me } = useMe();
  const [guarded, setGuarded] = useState<Guarded[] | null>(null);
  const [active, setActive] = useState<string>("");
  const [items, setItems] = useState<BidderItem[]>([]);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const t = await token();
      if (!t) { window.location.href = "/login"; return; }
      const res = await fetch("/api/me/guarded", { headers: { authorization: `Bearer ${t}` } });
      if (res.ok) {
        const list = ((await res.json()) as { students: Guarded[] }).students;
        setGuarded(list);
        if (list.length > 0) setActive(list[0].studentId);
      } else setGuarded([]);
    })();
  }, []);

  const loadBidder = useCallback(async (studentId: string) => {
    if (!studentId) return;
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/market/bidder?studentId=${encodeURIComponent(studentId)}`, { headers: { authorization: `Bearer ${t}` } });
    if (res.ok) setItems(((await res.json()) as { items: BidderItem[] }).items);
  }, []);

  useEffect(() => { void loadBidder(active); }, [active, loadBidder]);

  async function addGift() {
    setErr(null); setOk(null);
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/market/gifts", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({
        nameAr: form.nameAr.trim(),
        proposedPricePoints: Number(form.proposedPricePoints),
        imageUrl: form.imageUrl.trim() || null,
        targetStudentId: form.scope === "child" ? active : null,
      }),
    });
    if (res.ok) { setOk("أُرسِلت ثمرتك — بانتظار موافقة الإدارة."); setForm(EMPTY); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر إرسال الثمرة."); }
  }

  const activeName = guarded?.find((g) => g.studentId === active)?.name ?? "";

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/bidder"
      title="بيدر أبنائي" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "البيدر" }]}>

      {/* بطاقة تسويقيّة دائمة — تحثّ الوليّ على المشاركة. */}
      <Card style={{ marginBottom: sp(6), borderInlineStart: `4px solid ${ui.color.bronze}` }}>
        <div style={{ fontWeight: 700, marginBottom: sp(1) }}>كن شريكًا في تحفيز ابنك 🌱</div>
        <p style={{ margin: 0, color: ui.color.muted }}>
          أضِف ثمرةً (جائزة) إلى البيدر يجنيها ابنك بنقاطه التي يكسبها بجدّه. تقترح قيمتها،
          وتتكفّل بها وتُحضِرها للحلقة، وتعتمدها الإدارة. ثمرتك تُشجّعه على المثابرة.
        </p>
      </Card>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {ok && <p style={{ color: ui.color.success, fontWeight: 600 }}>{ok}</p>}

      {guarded == null ? (
        <p style={{ color: ui.color.muted }}>جارٍ التحميل…</p>
      ) : guarded.length === 0 ? (
        <Card style={{ maxWidth: 520 }}><p style={{ margin: 0 }}>لا أبناء مرتبطون بحسابك.</p></Card>
      ) : (
        <>
          {/* تبويبات الأبناء */}
          {guarded.length > 1 && (
            <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(4) }}>
              {guarded.map((g) => (
                <Button key={g.studentId} variant={g.studentId === active ? "primary" : "ghost"} size="sm" onClick={() => setActive(g.studentId)}>{g.name}</Button>
              ))}
            </div>
          )}

          {/* عرض بيدر الابن (نافذة) */}
          <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(3) }}>بيدر {activeName}</h2>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: sp(3), marginBottom: sp(6) }}>
            {items.map((i) => (
              <div key={i.id} style={{ background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, padding: sp(3), display: "flex", flexDirection: "column", gap: sp(2) }}>
                {i.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={i.imageUrl} alt="" style={{ width: "100%", height: 96, objectFit: "cover", borderRadius: ui.radius.sm }} />
                  : <div style={{ width: "100%", height: 96, background: ui.color.bg, borderRadius: ui.radius.sm }} />}
                <div style={{ fontWeight: 600 }}>{i.nameAr}</div>
                <Badge tone="bronze">{arNum(i.pricePoints)} نقطة</Badge>
              </div>
            ))}
            {items.length === 0 && <p style={{ color: ui.color.muted }}>لا ثمار في بيدره الآن.</p>}
          </section>

          {/* إضافة ثمرة */}
          <section style={{ background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, padding: sp(4), maxWidth: 640 }}>
            <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(3) }}>أضِف ثمرة</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp(3) }}>
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
            <div style={{ marginTop: sp(2) }}><Button onClick={() => void addGift()}>أرسِل للاعتماد</Button></div>
          </section>
        </>
      )}
    </AppShell>
  );
}
