"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { arNum } from "@/lib/format";
import { Button, Card, ui, sp } from "@/components/ui";

interface Guarded { studentId: string; name: string }
interface Issued { code: string; qrDataUrl: string; expiresAt: string }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

// كود الطالب في «صفحتي» (م٦ب): زرّ «أظهر كودي» للطالب، وأزرارٌ لكلّ ابنٍ للوليّ (دون ١٣
// لا حساب له فيُظهر وليّه كودَه). يُعرَض QR + الرقم الاحتياطيّ مع عدّادِ انتهاء (~٥ دقائق).
export function CodeSection({ hasOwnStudent }: { hasOwnStudent: boolean }) {
  const [guarded, setGuarded] = useState<Guarded[]>([]);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [lastTarget, setLastTarget] = useState<string | undefined>(undefined);
  const [remaining, setRemaining] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await token();
      if (!t) return;
      const res = await fetch("/api/me/guarded", { headers: { authorization: `Bearer ${t}` } });
      if (res.ok) setGuarded(((await res.json()) as { students: Guarded[] }).students);
    })();
  }, []);

  // عدّاد الانتهاء — يُحدَّث كلّ ثانية من expiresAt.
  useEffect(() => {
    if (!issued) return;
    const tick = () => setRemaining(Math.max(0, Math.floor((new Date(issued.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [issued]);

  const generate = useCallback(async (studentId?: string) => {
    setErr(null); setBusy(true); setIssued(null); setLastTarget(studentId);
    const t = await token();
    if (!t) { setBusy(false); return; }
    const res = await fetch("/api/me/code", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(studentId ? { studentId } : {}),
    });
    if (res.ok) setIssued((await res.json()) as Issued);
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر توليد الرمز."); }
    setBusy(false);
  }, []);

  if (!hasOwnStudent && guarded.length === 0) return null;

  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <section style={{ marginBottom: sp(6) }}>
      <div style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.muted, marginBottom: sp(2) }}>رمز الحاصد</div>
      <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(3) }}>
        {hasOwnStudent && <Button variant="bronze" onClick={() => void generate()} disabled={busy}>أظهر رمزي</Button>}
        {guarded.map((g) => (
          <Button key={g.studentId} variant="ghost" onClick={() => void generate(g.studentId)} disabled={busy}>
            رمز {g.name}
          </Button>
        ))}
      </div>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}

      {issued && (
        <Card style={{ maxWidth: 320, textAlign: "center" }}>
          {remaining > 0 ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={issued.qrDataUrl} alt="رمز الاستجابة السريعة" width={220} height={220} style={{ maxWidth: "100%", height: "auto" }} />
              <div style={{ fontSize: ui.text.xl, fontWeight: 700, letterSpacing: 4, direction: "ltr", marginTop: sp(2) }}>{issued.code}</div>
              <div style={{ color: ui.color.muted, marginTop: sp(1) }}>ينتهي بعد {arNum(mmss)}</div>
              <p style={{ fontSize: ui.text.xs, color: ui.color.muted, marginTop: sp(2) }}>أظهِر هذا الرمز لأمين البيدر.</p>
            </>
          ) : (
            <>
              <p style={{ margin: 0, color: ui.color.muted }}>انتهت صلاحيّة الرمز.</p>
              <div style={{ marginTop: sp(2) }}><Button variant="bronze" size="sm" onClick={() => void generate(lastTarget)} disabled={busy}>أعد الطلب</Button></div>
            </>
          )}
        </Card>
      )}
    </section>
  );
}
