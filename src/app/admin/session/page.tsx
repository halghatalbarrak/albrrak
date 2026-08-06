"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

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

const box: React.CSSProperties = {
  maxWidth: 860, margin: "0 auto", padding: "1.5rem", fontFamily: "system-ui, sans-serif",
};
const card: React.CSSProperties = {
  border: "1px solid #ccc", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: 12,
};
const num: React.CSSProperties = { width: 64 };

export default function DailySessionPage() {
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
      setMsg(j.reverted ? "خطآن — عاد المقطع حفظًا جديدًا (خرج من الراسخ)." : "خطأٌ واحد — تنبيهٌ، يبقى راسخًا.");
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
    return <main dir="rtl" style={box}><p>تحتاج دخولًا.</p><a href="/login" style={{ color: "#1F5C3D" }}>دخول</a></main>;

  const cur = view?.position.current;
  const s = view?.session;

  return (
    <main dir="rtl" style={box}>
      <h1 style={{ fontSize: "1.4rem" }}>الجلسة اليومية</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
          <option value="">— اختر حلقة —</option>
          {circles.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
        </select>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={!circleId}>
          <option value="">— اختر طالبًا —</option>
          {students.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {msg && <p style={{ color: "#1F5C3D" }}>{msg}</p>}
      {status === "loading" && <p style={{ opacity: 0.6 }}>…جارٍ التحميل</p>}
      {status === "error" && (
        <p style={{ color: "#b00020" }}>تعذّر تحميل الجلسة. <button type="button" onClick={() => void loadSession()}>إعادة</button></p>
      )}
      {status === "idle" && <p style={{ opacity: 0.6 }}>اختر حلقةً وطالبًا لفتح الجلسة.</p>}

      {status === "ready" && view && (
        <>
          {/* الموضع الحاليّ */}
          <div style={{ ...card, background: "#FBFAF5" }}>
            <strong>{view.student.name}</strong>
            {" — "}
            {!view.position.started || !cur ? (
              <span style={{ opacity: 0.6 }}>لم يبدأ بعد.</span>
            ) : (
              <span>
                موضعه: <strong>{cur.label}</strong>
                {cur.hizb != null ? ` · الحزب ${cur.hizb}` : ""}
              </span>
            )}
            {view.program === "MARAQI" && cur && (
              <button
                type="button"
                style={{ marginInlineStart: 12 }}
                onClick={() => void declareReadiness(cur.stageId)}
                title="الحصاد يُجريه مُسمِّعٌ ليس معلمه — أنت تُعلن الجاهزية فقط"
              >
                أعلن الجاهزية للحصاد
              </button>
            )}
          </div>

          {/* سلّم مراقي مع تمييز الحزب الحاليّ */}
          {view.program === "MARAQI" && ladder && (
            <div style={card}>
              <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>سلّم مراقي</h2>
              {ladder.mainStages.map((m) => (
                <div key={m.stageId} style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{m.nameAr}</div>
                  <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0" }}>
                    {m.subStages.map((sub) => {
                      const here = cur?.stageId === sub.stageId;
                      return (
                        <li key={sub.stageId} style={{
                          padding: "2px 8px", borderRadius: 6,
                          background: here ? "#1F5C3D" : "transparent",
                          color: here ? "#fff" : "inherit",
                          fontSize: "0.85rem",
                        }}>
                          {here ? "◀ " : ""}{sub.label}
                          {sub.hizb != null ? ` · حزب ${sub.hizb}` : ""}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* التسجيل — مراقي فقط */}
          {view.program === "MARAQI" ? (
            <>
              <div style={card}>
                <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>الحفظ (المعلم وحده)</h2>
                {view.hifzGate?.mustRepeat && view.hifzGate.range && (
                  <p style={{ margin: "0 0 8px", padding: "0.4rem 0.6rem", background: "#fdf0d5", borderRadius: 6, fontSize: "0.9rem" }}>
                    ⚠️ الحكم ١: لم يُتقن مقطع اليوم السابق — يعيد <strong>نفس المقطع</strong> (
                    {view.hifzGate.range.fromSurah}:{view.hifzGate.range.fromAyah} ← {view.hifzGate.range.toSurah}:{view.hifzGate.range.toAyah}
                    )، لا حفظ جديد.
                    <button
                      type="button" style={{ marginInlineStart: 8 }}
                      onClick={() => setHifz((h) => ({
                        ...h,
                        fromSurah: String(view.hifzGate!.range!.fromSurah), fromAyah: String(view.hifzGate!.range!.fromAyah),
                        toSurah: String(view.hifzGate!.range!.toSurah), toAyah: String(view.hifzGate!.range!.toAyah),
                      }))}
                    >
                      املأ المقطع
                    </button>
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: "0.9rem" }}>
                  <span>من سورة</span>
                  <input style={num} type="number" value={hifz.fromSurah} onChange={(e) => setHifz({ ...hifz, fromSurah: e.target.value })} />
                  <span>آية</span>
                  <input style={num} type="number" value={hifz.fromAyah} onChange={(e) => setHifz({ ...hifz, fromAyah: e.target.value })} />
                  <span>إلى سورة</span>
                  <input style={num} type="number" value={hifz.toSurah} onChange={(e) => setHifz({ ...hifz, toSurah: e.target.value })} />
                  <span>آية</span>
                  <input style={num} type="number" value={hifz.toAyah} onChange={(e) => setHifz({ ...hifz, toAyah: e.target.value })} />
                  <span>المحاولات</span>
                  <input style={num} type="number" min={1} value={hifz.attempts} onChange={(e) => setHifz({ ...hifz, attempts: e.target.value })} />
                  <label><input type="checkbox" checked={hifz.mastered} onChange={(e) => setHifz({ ...hifz, mastered: e.target.checked })} /> أتقن</label>
                  <button type="button" onClick={saveHifz}>حفظ</button>
                </div>
                {s?.hifzFromSurah != null && (
                  <p style={{ opacity: 0.6, fontSize: "0.85rem", margin: "6px 0 0" }}>
                    مُسجَّل اليوم: {s.hifzFromSurah}:{s.hifzFromAyah} ← {s.hifzToSurah}:{s.hifzToAyah} · محاولات {s.hifzAttempts} · {s.hifzMastered ? "أتقن" : "لم يُتقن"}
                  </p>
                )}
              </div>

              {/* ما يُسمَّع اليوم (الأحكام ٢، ٤، ٩): الترسيخ آخر ١٠ مقاطع، والمراجعة خُمس الراسخ */}
              {view.consolidation && (
                <div style={card}>
                  <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>ما يُسمَّع اليوم</h2>
                  <p style={{ margin: "0 0 4px", fontSize: "0.9rem" }}>
                    <strong>الترسيخ</strong> (آخر {view.consolidation.tarseekh.windowSize} مقاطع — يوميًّا):
                    {view.consolidation.tarseekh.segments.length === 0 ? " — لا مقاطع بعد" : ""}
                  </p>
                  <ul style={{ margin: "0 0 8px", paddingInlineStart: 18, fontSize: "0.85rem" }}>
                    {view.consolidation.tarseekh.segments.map((sg, i) => (
                      <li key={i}>{sg.fromSurah}:{sg.fromAyah} ← {sg.toSurah}:{sg.toAyah}</li>
                    ))}
                  </ul>
                  <p style={{ margin: 0, fontSize: "0.9rem" }}>
                    <strong>المراجعة الأسبوعية</strong>: الراسخ {view.consolidation.review.stockCount} مقطعًا · خُمس اليوم ≈ {view.consolidation.review.khums}
                    <span style={{ opacity: 0.6 }}> (حرٌّ في التعجيل — المهم إتمام الدورة أسبوعيًّا)</span>
                  </p>
                  {view.weeklyReview && (
                    <div style={{ marginTop: 6, fontSize: "0.9rem" }}>
                      دورة الأسبوع: أُنجِز <strong>{view.weeklyReview.done}</strong> من <strong>{view.weeklyReview.required}</strong>
                      {" — "}المتبقّي <strong>{view.weeklyReview.remaining}</strong> ({view.weeklyReview.percent}٪)
                      {view.weeklyReview.complete && <span style={{ color: "#1F5C3D" }}> · اكتملت ✓</span>}
                      <div style={{ height: 6, background: "#eee", borderRadius: 4, marginTop: 4 }}>
                        <div style={{ width: `${view.weeklyReview.percent}%`, height: "100%", background: "#1F5C3D", borderRadius: 4 }} />
                      </div>
                    </div>
                  )}
                  {/* الترميم (الحكم ٥): رصد خطأ المراجعة لكل مقطعٍ راسخ */}
                  {view.consolidation.review.segments.length > 0 && (
                    <ul style={{ margin: "8px 0 0", paddingInlineStart: 0, listStyle: "none", fontSize: "0.85rem" }}>
                      {view.consolidation.review.segments.map((sg) => (
                        <li key={sg.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                          <span>{sg.fromSurah}:{sg.fromAyah} ← {sg.toSurah}:{sg.toAyah}</span>
                          <button type="button" onClick={() => void reviewError(sg.id, 1)}>خطأ واحد</button>
                          <button type="button" onClick={() => void reviewError(sg.id, 2)}>خطآن ← ترميم</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div style={card}>
                <h2 style={{ fontSize: "1rem", margin: "0 0 8px" }}>الترسيخ والمراجعة (تمّ/لم يتم)</h2>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    الترسيخ: {s?.tarseekhDone == null ? "—" : s.tarseekhDone ? "تمّ" : "لم يتم"}
                    <button type="button" style={{ marginInlineStart: 8 }} onClick={() => void post({ kind: "tarseekh", done: true })}>تمّ</button>
                    <button type="button" onClick={() => void post({ kind: "tarseekh", done: false })}>لم يتم</button>
                  </div>
                  <div>
                    المراجعة اليوم (مقاطع): {s?.murajaahCount ?? "—"}
                    <input
                      type="number" min={0} value={reviewCount} style={{ ...num, marginInlineStart: 8 }}
                      onChange={(e) => setReviewCount(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => void post({ kind: "murajaah", count: Number(reviewCount || 0) })}
                    >
                      رصد المقدار
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p style={{ opacity: 0.6 }}>الجلسة اليومية لطلاب مراقي. هذا الطالب في {view.program === "QAIDAH_MADANIYYAH" ? "القاعدة المدنية" : "برنامجٍ آخر"}.</p>
          )}
        </>
      )}
    </main>
  );
}
