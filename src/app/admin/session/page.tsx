"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Input, Badge, ui, sp } from "@/components/ui";

// شاشة الجلسة اليومية (م٤ب — §٨٫٣): المعلم يفتحها، تعرض موضع الطالب في سلّمه (ومع
// مراقي: سلّمها مع تمييز الحزب الحاليّ)، ويسجّل الحفظ (المعلم وحده) والترسيخ/المراجعة
// «تمّ/لم يتم». حالات صريحة (تحميل/دخول/خطأ/فارغ)، لا انهيار.

interface Circle { id: string; nameAr: string }
interface StudentLite { id: string; name: string }
interface Position {
  program: string;
  started: boolean;
  current: {
    stageId: string; label: string; hizb: number | null;
    fromSurah: number | null; fromAyah: number | null;
    toSurah: number | null; toAyah: number | null;
  } | null;
}
interface SessionToday {
  hifzFromSurah: number | null; hifzFromAyah: number | null;
  hifzToSurah: number | null; hifzToAyah: number | null;
  hifzAttempts: number | null; hifzMastered: boolean | null;
  tarseekhDone: boolean | null; murajaahDone: boolean | null; murajaahCount: number | null;
}
interface Segment {
  id: string;
  date: string;
  fromSurah: number; fromAyah: number; toSurah: number; toAyah: number;
}
interface Consolidation {
  tarseekh: { windowSize: number; segments: Segment[] };
  review: { stockCount: number; khums: number; segments: Segment[] };
}
interface WeeklyReview {
  required: number; done: number; remaining: number; percent: number; complete: boolean;
}
interface HifzGate {
  mustRepeat: boolean;
  range: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number } | null;
}
interface SessionView {
  student: { id: string; name: string };
  program: string;
  position: Position;
  session: SessionToday | null;
  consolidation: Consolidation | null;
  weeklyReview: WeeklyReview | null;
  hifzGate: HifzGate | null;
}
interface SubStage { stageId: string; label: string; hizb: number | null; juz: number | null }
interface MainStage { stageId: string; nameAr: string; subStages: SubStage[] }
interface Ladder { mainStages: MainStage[] }

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const num: React.CSSProperties = { width: 72 };
const sectionTitle: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` };

export default function DailySessionPage() {
  const { me } = useMe();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState("");
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [view, setView] = useState<SessionView | null>(null);
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  // الحفظ — مدخلات المعلم
  const [hifz, setHifz] = useState({ fromSurah: "", fromAyah: "", toSurah: "", toAyah: "", attempts: "1", mastered: false });
  // المراجعة — مقدار ما رُوجِع اليوم (الحكم ٤ الموسّع)
  const [reviewCount, setReviewCount] = useState("");

  useEffect(() => {
    void (async () => {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch("/api/attendance/circles", { headers: { authorization: `Bearer ${t}` } });
      if (res.ok) setCircles(((await res.json()) as { circles?: Circle[] }).circles ?? []);
      else if (res.status === 401 || res.status === 403) setStatus("unauth");
    })();
  }, []);

  useEffect(() => {
    if (!circleId) { setStudents([]); setStudentId(""); return; }
    void (async () => {
      const t = await token();
      if (!t) return;
      const res = await fetch(`/api/circles/${circleId}/students`, { headers: { authorization: `Bearer ${t}` } });
      if (res.ok) setStudents(((await res.json()) as { students?: StudentLite[] }).students ?? []);
    })();
  }, [circleId]);

  const loadSession = useCallback(async () => {
    if (!studentId || !date) return;
    setStatus("loading"); setMsg(null);
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch(`/api/students/${studentId}/session?date=${encodeURIComponent(date)}`, {
        headers: { authorization: `Bearer ${t}` },
      });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      const v = (await res.json()) as SessionView;
      setView(v);
      if (v.program === "MARAQI") {
        const lr = await fetch("/api/programs/maraqi/ladder", { headers: { authorization: `Bearer ${t}` } });
        setLadder(lr.ok ? ((await lr.json()) as Ladder) : null);
      } else setLadder(null);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [studentId, date]);

  useEffect(() => { void loadSession(); }, [loadSession]);

  async function post(body: Record<string, unknown>) {
    setMsg(null);
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/students/${studentId}/session`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ ...body, date }),
    });
    if (res.ok) { setMsg("حُفظ."); await loadSession(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر الحفظ."); }
  }

  function saveHifz() {
    void post({
      kind: "hifz",
      fromSurah: Number(hifz.fromSurah), fromAyah: Number(hifz.fromAyah),
      toSurah: Number(hifz.toSurah), toAyah: Number(hifz.toAyah),
      attempts: Number(hifz.attempts), mastered: hifz.mastered,
    });
  }

  // الترميم (الحكم ٥): رصد أخطاء مراجعة مقطعٍ راسخ. خطآن ⟵ يعود حفظًا جديدًا.
  async function reviewError(sessionId: string, errorCount: number) {
    setMsg(null);
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/students/${studentId}/review-error`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ sessionId, errorCount, date }),
    });
    if (res.ok) {
      const j = (await res.json()) as { reverted: boolean };
      setMsg(j.reverted ? "خطآن — عاد المقطع حفظًا جديدًا (خرج من الراسخ)." : "خطأٌ واحد — تنبيهٌ, يبقى راسخًا.");
      await loadSession();
    } else {
      const j = (await res.json()) as { error?: string };
      setMsg(j.error ?? "تعذّر الرصد.");
    }
  }

  // إعلان الجاهزية للحصاد (المعلم فقط — الحصاد نفسه يُجريه المُسمِّع في شاشة الحصاد).
  async function declareReadiness(stageId: string) {
    setMsg(null);
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/students/${studentId}/hasad-readiness`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ stageId }),
    });
    if (res.ok) { setMsg("أُعلنت الجاهزية للحصاد — يُسنَد مُسمِّعٌ لحصاده."); await loadSession(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر إعلان الجاهزية."); }
  }

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );

  const cur = view?.position.current;
  const s = view?.session;

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/session"
      title="الجلسة اليومية" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "التشغيل" }, { label: "الجلسة اليومية" }]}>

      <div style={{ display: "flex", gap: sp(3), flexWrap: "wrap", marginBottom: sp(4) }}>
        <Select value={circleId} onChange={(e) => setCircleId(e.target.value)} style={{ width: "auto", minWidth: 180 }}>
          <option value="">— اختر حلقة —</option>
          {circles.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
        </Select>
        <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={!circleId} style={{ width: "auto", minWidth: 180 }}>
          <option value="">— اختر طالبًا —</option>
          {students.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
        </Select>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} />
      </div>

      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {status === "loading" && <p style={{ color: ui.color.muted }}>…جارٍ التحميل</p>}
      {status === "error" && (
        <p style={{ color: ui.color.danger }}>تعذّر تحميل الجلسة. <Button variant="ghost" size="sm" type="button" onClick={() => void loadSession()}>إعادة</Button></p>
      )}
      {status === "idle" && <p style={{ color: ui.color.muted }}>اختر حلقةً وطالبًا لفتح الجلسة.</p>}

      {status === "ready" && view && (
        <>
          {/* الموضع الحاليّ */}
          <Card style={{ marginBottom: sp(3) }}>
            <strong>{view.student.name}</strong>
            {" — "}
            {!view.position.started || !cur ? (
              <span style={{ color: ui.color.muted }}>لم يبدأ بعد.</span>
            ) : (
              <span>
                موضعه: <strong>{cur.label}</strong>
                {cur.hizb != null ? ` · الحزب ${cur.hizb}` : ""}
              </span>
            )}
            {view.program === "MARAQI" && cur && (
              <Button
                variant="bronze" size="sm" type="button"
                style={{ marginInlineStart: sp(3) }}
                onClick={() => void declareReadiness(cur.stageId)}
                title="الحصاد يُجريه مُسمِّعٌ ليس معلمه — أنت تُعلن الجاهزية فقط"
              >
                أعلن الجاهزية للحصاد
              </Button>
            )}
          </Card>

          {/* سلّم مراقي مع تمييز الحزب الحاليّ */}
          {view.program === "MARAQI" && ladder && (
            <Card style={{ marginBottom: sp(3) }}>
              <h2 style={sectionTitle}>سلّم مراقي</h2>
              {ladder.mainStages.map((m) => (
                <div key={m.stageId} style={{ marginBottom: sp(2) }}>
                  <div style={{ fontWeight: 600, fontSize: ui.text.xs, color: ui.color.primary }}>{m.nameAr}</div>
                  <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0" }}>
                    {m.subStages.map((sub) => {
                      const here = cur?.stageId === sub.stageId;
                      return (
                        <li key={sub.stageId} style={{
                          padding: "2px 8px", borderRadius: ui.radius.sm,
                          background: here ? ui.color.bronze : "transparent",
                          color: here ? "#fff" : "inherit",
                          fontSize: ui.text.xs,
                        }}>
                          {here ? "◀ " : ""}{sub.label}
                          {sub.hizb != null ? ` · حزب ${sub.hizb}` : ""}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </Card>
          )}

          {/* التسجيل — مراقي فقط */}
          {view.program === "MARAQI" ? (
            <>
              <Card style={{ marginBottom: sp(3) }}>
                <h2 style={sectionTitle}>الحفظ (المعلم وحده)</h2>
                {view.hifzGate?.mustRepeat && view.hifzGate.range && (
                  <p style={{ margin: `0 0 ${sp(2)}`, padding: `${sp(2)} ${sp(3)}`, background: "#fdf0d5", borderRadius: ui.radius.md, fontSize: ui.text.xs }}>
                    ⚠️ الحكم ١: لم يُتقن مقطع اليوم السابق — يعيد <strong>نفس المقطع</strong> (
                    {view.hifzGate.range.fromSurah}:{view.hifzGate.range.fromAyah} ← {view.hifzGate.range.toSurah}:{view.hifzGate.range.toAyah}
                    )، لا حفظ جديد.
                    <Button
                      variant="ghost" size="sm" type="button" style={{ marginInlineStart: sp(2) }}
                      onClick={() => setHifz((h) => ({
                        ...h,
                        fromSurah: String(view.hifzGate!.range!.fromSurah), fromAyah: String(view.hifzGate!.range!.fromAyah),
                        toSurah: String(view.hifzGate!.range!.toSurah), toAyah: String(view.hifzGate!.range!.toAyah),
                      }))}
                    >
                      املأ المقطع
                    </Button>
                  </p>
                )}
                <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center", fontSize: ui.text.xs }}>
                  <span>من سورة</span>
                  <Input style={num} type="number" value={hifz.fromSurah} onChange={(e) => setHifz({ ...hifz, fromSurah: e.target.value })} />
                  <span>آية</span>
                  <Input style={num} type="number" value={hifz.fromAyah} onChange={(e) => setHifz({ ...hifz, fromAyah: e.target.value })} />
                  <span>إلى سورة</span>
                  <Input style={num} type="number" value={hifz.toSurah} onChange={(e) => setHifz({ ...hifz, toSurah: e.target.value })} />
                  <span>آية</span>
                  <Input style={num} type="number" value={hifz.toAyah} onChange={(e) => setHifz({ ...hifz, toAyah: e.target.value })} />
                  <span>المحاولات</span>
                  <Input style={num} type="number" min={1} value={hifz.attempts} onChange={(e) => setHifz({ ...hifz, attempts: e.target.value })} />
                  <label style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={hifz.mastered} onChange={(e) => setHifz({ ...hifz, mastered: e.target.checked })} /> أتقن</label>
                  <Button size="sm" type="button" onClick={saveHifz}>حفظ</Button>
                </div>
                {s?.hifzFromSurah != null && (
                  <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: `${sp(2)} 0 0` }}>
                    مُسجَّل اليوم: {s.hifzFromSurah}:{s.hifzFromAyah} ← {s.hifzToSurah}:{s.hifzToAyah} · محاولات {s.hifzAttempts} · {s.hifzMastered ? "أتقن" : "لم يُتقن"}
                  </p>
                )}
              </Card>

              {/* ما يُسمَّع اليوم (الأحكام ٢، ٤، ٩): الترسيخ آخر ١٠ مقاطع، والمراجعة خُمس الراسخ */}
              {view.consolidation && (
                <Card style={{ marginBottom: sp(3) }}>
                  <h2 style={sectionTitle}>ما يُسمَّع اليوم</h2>
                  <p style={{ margin: "0 0 4px", fontSize: ui.text.xs }}>
                    <strong>الترسيخ</strong> (آخر {view.consolidation.tarseekh.windowSize} مقاطع — يوميًّا):
                    {view.consolidation.tarseekh.segments.length === 0 ? " — لا مقاطع بعد" : ""}
                  </p>
                  <ul style={{ margin: `0 0 ${sp(2)}`, paddingInlineStart: 18, fontSize: ui.text.xs }}>
                    {view.consolidation.tarseekh.segments.map((sg, i) => (
                      <li key={i}>{sg.fromSurah}:{sg.fromAyah} ← {sg.toSurah}:{sg.toAyah}</li>
                    ))}
                  </ul>
                  <p style={{ margin: 0, fontSize: ui.text.xs }}>
                    <strong>المراجعة الأسبوعية</strong>: الراسخ {view.consolidation.review.stockCount} مقطعًا · خُمس اليوم ≈ {view.consolidation.review.khums}
                    <span style={{ color: ui.color.muted }}> (حرٌّ في التعجيل — المهم إتمام الدورة أسبوعيًّا)</span>
                  </p>
                  {view.weeklyReview && (
                    <div style={{ marginTop: sp(2), fontSize: ui.text.xs }}>
                      دورة الأسبوع: أُنجِز <strong>{view.weeklyReview.done}</strong> من <strong>{view.weeklyReview.required}</strong>
                      {" — "}المتبقّي <strong>{view.weeklyReview.remaining}</strong> ({view.weeklyReview.percent}٪)
                      {view.weeklyReview.complete && <span style={{ color: ui.color.success }}> · اكتملت ✓</span>}
                      <div style={{ height: 6, background: ui.color.border, borderRadius: ui.radius.sm, marginTop: 4 }}>
                        <div style={{ width: `${view.weeklyReview.percent}%`, height: "100%", background: ui.color.success, borderRadius: ui.radius.sm }} />
                      </div>
                    </div>
                  )}
                  {/* الترميم (الحكم ٥): رصد خطأ المراجعة لكل مقطعٍ راسخ */}
                  {view.consolidation.review.segments.length > 0 && (
                    <ul style={{ margin: `${sp(2)} 0 0`, paddingInlineStart: 0, listStyle: "none", fontSize: ui.text.xs }}>
                      {view.consolidation.review.segments.map((sg) => (
                        <li key={sg.id} style={{ display: "flex", gap: sp(2), alignItems: "center", marginBottom: 3 }}>
                          <span>{sg.fromSurah}:{sg.fromAyah} ← {sg.toSurah}:{sg.toAyah}</span>
                          <Button variant="ghost" size="sm" type="button" onClick={() => void reviewError(sg.id, 1)}>خطأ واحد</Button>
                          <Button variant="danger" size="sm" type="button" onClick={() => void reviewError(sg.id, 2)}>خطآن ← ترميم</Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}

              <Card style={{ marginBottom: sp(3) }}>
                <h2 style={sectionTitle}>الترسيخ والمراجعة (تمّ/لم يتم)</h2>
                <div style={{ display: "flex", gap: sp(5), flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: sp(2) }}>
                    <span>الترسيخ: {s?.tarseekhDone == null ? "—" : s.tarseekhDone ? <Badge tone="success">تمّ</Badge> : <Badge tone="neutral">لم يتم</Badge>}</span>
                    <Button variant="ghost" size="sm" type="button" onClick={() => void post({ kind: "tarseekh", done: true })}>تمّ</Button>
                    <Button variant="ghost" size="sm" type="button" onClick={() => void post({ kind: "tarseekh", done: false })}>لم يتم</Button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: sp(2) }}>
                    <span>المراجعة اليوم (مقاطع): {s?.murajaahCount ?? "—"}</span>
                    <Input
                      type="number" min={0} value={reviewCount} style={num}
                      onChange={(e) => setReviewCount(e.target.value)}
                    />
                    <Button size="sm" type="button" onClick={() => void post({ kind: "murajaah", count: Number(reviewCount || 0) })}>
                      رصد المقدار
                    </Button>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <p style={{ color: ui.color.muted }}>الجلسة اليومية لطلاب مراقي. هذا الطالب في {view.program === "QAIDAH_MADANIYYAH" ? "القاعدة المدنية" : "برنامجٍ آخر"}.</p>
          )}
        </>
      )}
    </AppShell>
  );
}
