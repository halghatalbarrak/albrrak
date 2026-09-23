"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, Button, Badge, Card, ui, sp } from "@/components/ui";

interface Guarded { studentId: string; name: string }
interface BidderItem { id: string; nameAr: string; imageUrl: string | null; pricePoints: number; stock: number | null }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

// صفحة وليّ الأمر — بيدر أبنائه (م٦ب-٢): تبويباتٌ لأبنائه · عرض بيدر كلّ ابن (نافذة) ·
// زرّ «+ جديد» ينقل لصفحة إضافة الثمرة. مصطلحات الحصاد: بيدر · ثمرة · جَنْي.
export default function BidderPage() {
  const { me } = useMe();
  const router = useRouter();
  const [guarded, setGuarded] = useState<Guarded[] | null>(null);
  const [active, setActive] = useState<string>("");
  const [items, setItems] = useState<BidderItem[]>([]);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    // رسالة نجاحٍ بعد العودة من صفحة الإضافة.
    if (typeof window !== "undefined" && window.sessionStorage.getItem("bidderGiftSent")) {
      setOk("أُرسِلت ثمرتك — بانتظار موافقة الإدارة.");
      window.sessionStorage.removeItem("bidderGiftSent");
    }
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), marginBottom: sp(3) }}>
            <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, margin: 0 }}>بيدر {activeName}</h2>
            <Button onClick={() => router.push(`/bidder/new?studentId=${encodeURIComponent(active)}`)}>+ جديد</Button>
          </div>
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
        </>
      )}
    </AppShell>
  );
}
