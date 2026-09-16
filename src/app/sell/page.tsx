"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, Button, Input, Field, Badge, Stat, Card, ui, sp } from "@/components/ui";

interface Sellable { id: string; nameAr: string; imageUrl: string | null; pricePoints: number; stock: number | null }
interface Lookup { studentId: string; name: string; balance: number }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

// شاشة البائع (م٦ب) كنقطة بيع: امسح كود الطالب بالكاميرا أو أدخل الرقم ← بطاقته (اسم +
// رصيد فقط) ← شبكة السلع ← تأكيد الخصم. الكاميرا طبقةُ راحةٍ فوق منطق البيع؛ إن رُفض
// إذنها أو تعذّرت سقطنا لخانة الرقم بلا تعطّل. القواعد المطلقة كلّها في الخادم.
export default function SellPage() {
  const { me } = useMe();
  const [items, setItems] = useState<Sellable[]>([]);
  const [manual, setManual] = useState("");
  const [code, setCode] = useState("");
  const [student, setStudent] = useState<Lookup | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const loadItems = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch("/api/market/items", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — شاشة البيع للبائع وحده."); return; }
    if (res.ok) { const d = (await res.json()) as { items: Sellable[] }; setItems(d.items); }
  }, []);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    if (s) {
      try { await s.stop(); await s.clear(); } catch { /* توقّفٌ آمن */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  // إيقاف الكاميرا عند مغادرة الشاشة (تحرير المورد).
  useEffect(() => () => { void stopScanner(); }, [stopScanner]);

  const lookup = useCallback(async (raw: string) => {
    setErr(null); setOk(null); setStudent(null);
    const c = raw.trim();
    if (!c) { setErr("أدخل الكود."); return; }
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/market/lookup?code=${encodeURIComponent(c)}`, { headers: { authorization: `Bearer ${t}` } });
    if (res.ok) { setCode(c.toUpperCase()); setStudent((await res.json()) as Lookup); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "كود غير صالح."); }
  }, []);

  // بدء المسح بضغطة (لا نطلب إذن الكاميرا تلقائيًّا) — لطفًا بالمستخدم.
  async function startScan() {
    setScanError(null); setErr(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      setScanning(true);
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 220 },
        (decoded: string) => {
          void (async () => {
            await stopScanner();
            setManual(decoded.trim().toUpperCase());
            await lookup(decoded);
          })();
        },
        () => { /* تجاهل إخفاقات فكّ الإطار لحظةً بلحظة */ },
      );
    } catch {
      // رُفض الإذن أو لا كاميرا ⟵ اسقط لخانة الرقم بلا تعطّل.
      scannerRef.current = null;
      setScanning(false);
      setScanError("تعذّر فتح الكاميرا — أدخِل الرقم يدويًّا.");
    }
  }

  async function sell(itemId: string) {
    if (!student || busy) return;
    setBusy(true); setErr(null); setOk(null);
    const t = await token();
    if (!t) { setBusy(false); return; }
    const res = await fetch("/api/market/sell", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ code, marketItemId: itemId }),
    });
    if (res.ok) {
      const r = (await res.json()) as { itemName: string; pricePaid: number; balanceAfter: number };
      setOk(`تمّ البيع: ${r.itemName} (−${arNum(r.pricePaid)}) — رصيد ${student.name} الآن ${arNum(r.balanceAfter)}.`);
      // ابدأ عمليّةً جديدة — الكود استُعمل مرّةً.
      setStudent(null); setCode(""); setManual("");
      void loadItems(); // تحديث المخزون
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "تعذّر البيع.");
      // الكود قد يكون استُعمل/انتهى أثناء ذلك ⟵ اطلب كودًا جديدًا.
      setStudent(null); setCode(""); setManual("");
    }
    setBusy(false);
  }

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/sell"
      title="البيع" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "السوق" }, { label: "البيع" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {ok && <p style={{ color: ui.color.success, fontWeight: 600 }}>{ok}</p>}

      {!student ? (
        <section style={{ maxWidth: 480 }}>
          <p style={{ color: ui.color.muted }}>امسح كود الطالب بالكاميرا، أو أدخِل رقمه الاحتياطيّ.</p>

          {/* حاوية الماسح — تبقى في DOM ليجدها html5-qrcode، وتظهر حين المسح. */}
          <div id="qr-reader" style={{ display: scanning ? "block" : "none", width: "100%", maxWidth: 320, marginBottom: sp(3), borderRadius: ui.radius.lg, overflow: "hidden" }} />

          <div style={{ display: "flex", gap: sp(2), marginBottom: sp(4), flexWrap: "wrap" }}>
            {!scanning
              ? <Button onClick={() => void startScan()}>امسح بالكاميرا</Button>
              : <Button variant="ghost" onClick={() => void stopScanner()}>إيقاف الكاميرا</Button>}
          </div>
          {scanError && <p style={{ color: ui.color.muted }}>{scanError}</p>}

          <div style={{ display: "flex", gap: sp(2), alignItems: "flex-end" }}>
            <Field label="الرقم الاحتياطيّ"><Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="مثال: A7K2M9" style={{ direction: "ltr", textTransform: "uppercase" }} /></Field>
            <Button onClick={() => void lookup(manual)}>بحث</Button>
          </div>
        </section>
      ) : (
        <>
          <Card style={{ marginBottom: sp(5), maxWidth: 480, borderInlineStart: `4px solid ${ui.color.primary}` }}>
            <div style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.muted }}>الطالب</div>
            <div style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(2) }}>{student.name}</div>
            <Stat label="الرصيد" value={arNum(student.balance)} tone="bronze" hint="نقاط" />
            <div style={{ marginTop: sp(3) }}>
              <Button variant="ghost" size="sm" onClick={() => { setStudent(null); setCode(""); setManual(""); setOk(null); }}>إلغاء / طالبٌ آخر</Button>
            </div>
          </Card>

          <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(3) }}>اختر السلعة</h2>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: sp(3) }}>
            {items.map((i) => {
              const afford = student.balance >= i.pricePoints;
              return (
                <button key={i.id} disabled={!afford || busy} onClick={() => void sell(i.id)}
                  style={{
                    textAlign: "start", cursor: afford && !busy ? "pointer" : "not-allowed", opacity: afford ? 1 : 0.5,
                    background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg,
                    padding: sp(3), display: "flex", flexDirection: "column", gap: sp(2), font: "inherit", color: ui.color.text,
                  }}>
                  {i.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={i.imageUrl} alt="" style={{ width: "100%", height: 96, objectFit: "cover", borderRadius: ui.radius.sm }} />
                    : <div style={{ width: "100%", height: 96, background: ui.color.bg, borderRadius: ui.radius.sm }} />}
                  <div style={{ fontWeight: 600 }}>{i.nameAr}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Badge tone="bronze">{arNum(i.pricePoints)} نقطة</Badge>
                    {i.stock != null && <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>متبقٍّ {arNum(i.stock)}</span>}
                  </div>
                  {!afford && <span style={{ fontSize: ui.text.xs, color: ui.color.danger }}>الرصيد لا يكفي</span>}
                </button>
              );
            })}
          </section>
          {items.length === 0 && <p style={{ color: ui.color.muted }}>لا سلع متاحة الآن.</p>}
        </>
      )}
    </AppShell>
  );
}
