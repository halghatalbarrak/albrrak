"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { AppShell, Button, Card, Stat, Badge, Skeleton, ui, sp } from "@/components/ui";

interface MyPage { userId: string; name: string; roles: string[]; student: { id: string; state: string } | null }
interface MySession {
  hasStudent: boolean; program: string | null; state: string | null; started: boolean;
  positionLabel: string | null; raasikhCount: number | null;
  today: { mustRepeat: boolean; repeatRange: string | null; tarseekhCount: number; khums: number } | null;
  weekly: { done: number; required: number; percent: number; complete: boolean } | null;
  suggestions: { memorize: string; review: string } | null;
}
interface Forecast { hasPace: boolean; pacePerDay: number | null; hizbDoneDate: string | null; graduationDate: string | null; note: string }

const STATE_AR: Record<string, string> = {
  APPLIED: "قيد مُقدَّم", PENDING_ACCEPTANCE: "بانتظار القبول", WAITLISTED: "قائمة الانتظار",
  AWAITING_READING_TEST: "بانتظار اختبار القراءة", IN_QAIDAH: "القاعدة المدنية", AWAITING_PACE_TEST: "بانتظار اختبار المقطع",
  PACE_RETEST_SCHEDULED: "يُعاد اختباره", IN_MARAQI: "مراقي", COMPLETED: "أتمّ", GRADUATED: "متخرّج", WITHDRAWN: "منسحب",
};

const centered: React.CSSProperties = {
  minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
  background: ui.color.bg, fontFamily: ui.font, color: ui.color.text,
};

export default function MePage() {
  const [me, setMe] = useState<MyPage | null>(null);
  const [sess, setSess] = useState<MySession | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabaseBrowser().auth.getSession();
        if (!session) { window.location.href = "/login"; return; }
        const auth = { authorization: `Bearer ${session.access_token}` };
        const res = await fetch("/api/me", { headers: auth });
        if (!res.ok) { setErr("تعذّر جلب صفحتك."); return; }
        setMe((await res.json()) as MyPage);
        const sres = await fetch("/api/me/session", { headers: auth });
        if (sres.ok) setSess((await sres.json()) as MySession);
        const fres = await fetch("/api/me/forecast", { headers: auth });
        if (fres.ok) setForecast((await fres.json()) as Forecast);
      } catch {
        setErr("تعذّر الاتصال بالخادم.");
      }
    })();
  }, []);

  if (err) return <main dir="rtl" style={centered}>{err}</main>;
  if (!me) return <main dir="rtl" style={centered}>جارٍ التحميل…</main>;

  const signOut = async () => { await supabaseBrowser().auth.signOut(); window.location.href = "/login"; };

  return (
    <AppShell roles={me.roles} userName={me.name} activeHref="/me"
      title={`مرحبًا، ${me.name}`} crumbs={[{ label: "الرئيسة", href: "/" }, { label: "التعلّم" }, { label: "صفحتي" }]}>

      {!sess ? (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(4) }}>
          <Skeleton height={72} /><Skeleton height={110} />
        </div>
      ) : !sess.hasStudent ? (
        <Card style={{ maxWidth: 520 }}><p style={{ margin: 0 }}>لا سجلّ طالبٍ مرتبطٌ بحسابك.</p></Card>
      ) : sess.program !== "MARAQI" ? (
        // قاعدة مدنية أو لم يبدأ مراقي
        <>
          <Card style={{ marginBottom: sp(6), maxWidth: 640 }}>
            <div style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.muted, marginBottom: 2 }}>حالتك</div>
            <div style={{ fontSize: ui.text.lg, fontWeight: 700 }}>{STATE_AR[sess.state ?? ""] ?? sess.state}</div>
            {sess.positionLabel && <p style={{ color: ui.color.muted, margin: `${sp(2)} 0 0` }}>موضعك: {sess.positionLabel}</p>}
          </Card>
          {sess.program === "QAIDAH_MADANIYYAH" && (
            <a href="/programs/civil-base" style={{ textDecoration: "none" }}><Button variant="bronze">افتح سلّم القاعدة المدنية</Button></a>
          )}
        </>
      ) : (
        // لوحة مراقي: موضعه · رسوخه · اليوم · الدورة + اقتراحات
        <>
          {sess.suggestions && (
            <Card style={{ marginBottom: sp(6), borderInlineStart: `4px solid ${ui.color.primary}` }}>
              <div style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.muted, marginBottom: sp(2) }}>يقترح النظام</div>
              <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
                <div><Badge tone="primary">تحفظ</Badge> <span style={{ marginInlineStart: sp(2) }}>{sess.suggestions.memorize}</span></div>
                <div><Badge tone="bronze">تراجع</Badge> <span style={{ marginInlineStart: sp(2) }}>{sess.suggestions.review}</span></div>
              </div>
            </Card>
          )}

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: sp(4), marginBottom: sp(6) }}>
            <Stat label="موضعك" value={sess.positionLabel ?? "—"} hint="ما تحفظه الآن" />
            <Stat label="ما رسّختَه" value={sess.raasikhCount != null ? `${sess.raasikhCount} مقطعًا` : "—"} tone="bronze" hint="راسخٌ في محفوظك" />
            {sess.today && <Stat label="عليك اليوم" value={`${sess.today.tarseekhCount} ترسيخ · خُمس ${sess.today.khums}`} tone="primary" />}
            {sess.weekly && <Stat label="دورة المراجعة" value={`${sess.weekly.percent}٪`} tone={sess.weekly.complete ? "success" : "primary"} hint={`أُنجِز ${sess.weekly.done} من ${sess.weekly.required}`} />}
          </section>

          {forecast?.hasPace && (
            <Card style={{ marginBottom: sp(6), borderInlineStart: `4px solid ${ui.color.bronze}` }}>
              <div style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.muted, marginBottom: sp(2) }}>تقديرٌ إرشاديّ (لا موعد يُحاسَب عليه)</div>
              <div style={{ fontSize: ui.text.base }}>
                على وتيرتك الحاليّة (~{forecast.pacePerDay} آية في يوم الحلقة):
                {forecast.hizbDoneDate && <> تُتمّ ما بين يديك نحو <strong>{forecast.hizbDoneDate}</strong>؛</>}
                {forecast.graduationDate && <> وتُتمّ مراقي بإذن الله نحو <strong>{forecast.graduationDate}</strong>.</>}
              </div>
            </Card>
          )}

          {sess.today?.mustRepeat && sess.today.repeatRange && (
            <Card style={{ marginBottom: sp(6), background: "#fdf0d5" }}>
              ⚠️ عليك إعادة مقطع أمس (لم يُتقن): <strong>{sess.today.repeatRange}</strong> — لا حفظ جديد قبله.
            </Card>
          )}

          <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap" }}>
            <a href="/me/weakness" style={{ textDecoration: "none" }}><Button variant="bronze">مواضع تحتاج مراجعة</Button></a>
            <a href="/programs/maraqi" style={{ textDecoration: "none" }}><Button variant="ghost">افتح سلّم مراقي</Button></a>
          </div>
        </>
      )}

      <div style={{ marginTop: sp(8) }}>
        <Button variant="ghost" onClick={signOut}>خروج</Button>
      </div>
    </AppShell>
  );
}
