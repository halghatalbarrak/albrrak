"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

// شاشة الرصد (م٢ — DESIGN §١٠٫١): تفترض الجميع حاضرين، والمعلم يؤشّر الغائب فقط.
// تعمل بلا إنترنت: إن تعذّر الإرسال، يُحفظ الرصد محليًّا (localStorage) ويُزامن لاحقًا.
// السجل idempotent في الخادم (مفتاح الطالب+اليوم) ⟵ إعادة المزامنة بلا أثرٍ مضاعف.

interface Circle {
  id: string;
  nameAr: string;
}
interface RosterRow {
  studentId: string;
  name: string;
  status: string;
  note: string | null;
}
interface QueuedSession {
  circleId: string;
  date: string;
  exceptions: { studentId: string; status: string }[];
}

// الحالات القابلة للتأشير على الشاشة (الأعذار تُطبَّق عبر محرّك الاعتمادات لا هنا).
const MARKABLE: { value: string; label: string }[] = [
  { value: "PRESENT", label: "حاضر" },
  { value: "ABSENT_UNEXCUSED", label: "غائب" },
  { value: "LATE", label: "متأخر" },
  { value: "LEFT_EARLY", label: "خرج مبكرًا" },
];
const STATUS_LABEL: Record<string, string> = {
  PRESENT: "حاضر",
  ABSENT_UNEXCUSED: "غائب",
  LATE: "متأخر",
  LEFT_EARLY: "خرج مبكرًا",
  ABSENT_EXCUSED: "غائب بعذر",
  PRE_EXCUSED: "مستأذن مسبقًا",
};
const QUEUE_KEY = "albrrak.attendance.queue";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function token(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

function readQueue(): QueuedSession[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedSession[]) : [];
  } catch {
    return [];
  }
}
function writeQueue(q: QueuedSession[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

const box: React.CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "1.5rem",
  fontFamily: "system-ui, sans-serif",
};
const row: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "space-between",
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: "0.5rem 0.9rem",
  marginBottom: 8,
};

export default function AttendancePage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [ready, setReady] = useState(false);

  const refreshPending = useCallback(() => setPending(readQueue().length), []);

  // مزامنة الطابور المحلي: يُعاد إرسال كل جلسةٍ مؤجَّلة (idempotent في الخادم).
  const flush = useCallback(async () => {
    const q = readQueue();
    if (q.length === 0) return;
    const t = await token();
    if (!t) return;
    const remain: QueuedSession[] = [];
    for (const s of q) {
      try {
        const res = await fetch(`/api/circles/${s.circleId}/attendance`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
          body: JSON.stringify({ date: s.date, exceptions: s.exceptions }),
        });
        if (!res.ok) remain.push(s); // خطأ خادمٍ (لا شبكة): يبقى للمراجعة.
      } catch {
        remain.push(s); // ما زال بلا اتصال.
      }
    }
    writeQueue(remain);
    refreshPending();
    if (remain.length === 0 && q.length > 0) setMsg("تمّت مزامنة الرصد المؤجَّل.");
  }, [refreshPending]);

  // تحميل الحلقات القابلة للرصد.
  useEffect(() => {
    void (async () => {
      try {
        const t = await token();
        if (!t) {
          setErr("تحتاج دخولًا.");
          return;
        }
        const res = await fetch("/api/attendance/circles", {
          headers: { authorization: `Bearer ${t}` },
        });
        if (res.ok) {
          const j = (await res.json()) as { circles?: Circle[] };
          setCircles(j.circles ?? []);
        } else {
          setErr("تعذّر تحميل الحلقات.");
        }
      } catch {
        setErr("تعذّر الاتصال — تحقّق من الشبكة.");
      } finally {
        setReady(true);
        refreshPending();
        void flush();
      }
    })();
  }, [flush, refreshPending]);

  // إعادة المحاولة تلقائيًّا عند عودة الاتصال.
  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  const loadRoster = useCallback(async () => {
    if (!circleId || !date) return;
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const t = await token();
      if (!t) {
        setErr("تحتاج دخولًا.");
        return;
      }
      const res = await fetch(
        `/api/circles/${circleId}/attendance?date=${encodeURIComponent(date)}`,
        { headers: { authorization: `Bearer ${t}` } },
      );
      if (res.ok) {
        const j = (await res.json()) as { roster?: RosterRow[] };
        setRoster(j.roster ?? []);
      } else {
        const j = (await res.json()) as { error?: string };
        setErr(j.error ?? "تعذّر تحميل القائمة.");
        setRoster([]);
      }
    } catch {
      setErr("تعذّر الاتصال — تحقّق من الشبكة.");
      setRoster([]);
    } finally {
      setLoading(false);
    }
  }, [circleId, date]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  function setStatus(studentId: string, status: string) {
    setRoster((r) => r.map((s) => (s.studentId === studentId ? { ...s, status } : s)));
  }

  async function save() {
    setErr(null);
    setMsg(null);
    const exceptions = roster
      .filter((s) => s.status !== "PRESENT")
      .map((s) => ({ studentId: s.studentId, status: s.status }));
    const t = await token();
    if (!t) {
      setErr("تحتاج دخولًا.");
      return;
    }
    try {
      const res = await fetch(`/api/circles/${circleId}/attendance`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({ date, exceptions }),
      });
      if (res.ok) {
        const j = (await res.json()) as { present: number; absent: number };
        setMsg(`حُفظ الرصد: حاضر ${j.present}، غائب/مستثنى ${j.absent}.`);
      } else {
        const j = (await res.json()) as { error?: string };
        setErr(j.error ?? "تعذّر الحفظ.");
      }
    } catch {
      // لا اتصال ⟵ احفظ محليًّا وزامن لاحقًا (§١٠٫١).
      const q = readQueue();
      q.push({ circleId, date, exceptions });
      writeQueue(q);
      refreshPending();
      setMsg("لا اتصال — حُفظ الرصد محليًّا وسيُزامن تلقائيًّا عند عودة الشبكة.");
    }
  }

  const isExcused = (s: string) => s === "ABSENT_EXCUSED" || s === "PRE_EXCUSED";

  return (
    <main dir="rtl" style={box}>
      <h1 style={{ fontSize: "1.4rem" }}>رصد الحضور</h1>
      <p style={{ opacity: 0.6, fontSize: "0.9rem", marginTop: -6 }}>
        الجميع حاضرون افتراضًا — أشِّر الغائب فقط.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
          <option value="">— اختر حلقة —</option>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameAr}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {pending > 0 && (
          <button type="button" onClick={() => void flush()} style={{ color: "#8a5a00" }}>
            مزامنة ({pending}) مؤجَّل
          </button>
        )}
      </div>

      {msg && <p style={{ color: "#1F5C3D" }}>{msg}</p>}
      {err && <p style={{ color: "#b00020" }}>{err}</p>}

      {/* حالات صريحة: تحميل / فارغ / قائمة */}
      {loading && <p style={{ opacity: 0.6 }}>…جارٍ التحميل</p>}
      {!loading && ready && circles.length === 0 && !err && (
        <p style={{ opacity: 0.6 }}>لا حلقات تَرصدها.</p>
      )}
      {!loading && circleId && roster.length === 0 && !err && (
        <p style={{ opacity: 0.6 }}>لا طلاب في هذه الحلقة.</p>
      )}
      {!circleId && !loading && circles.length > 0 && (
        <p style={{ opacity: 0.6 }}>اختر حلقةً لعرض القائمة.</p>
      )}

      {!loading &&
        roster.map((s) => (
          <div key={s.studentId} style={row}>
            <strong>{s.name}</strong>
            {isExcused(s.status) ? (
              <span style={{ color: "#1F5C3D" }}>{STATUS_LABEL[s.status]} (معتمَد)</span>
            ) : (
              <select value={s.status} onChange={(e) => setStatus(s.studentId, e.target.value)}>
                {MARKABLE.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}

      {!loading && roster.length > 0 && (
        <button
          type="button"
          onClick={() => void save()}
          style={{
            marginTop: 12,
            padding: "0.5rem 1.4rem",
            background: "#1F5C3D",
            color: "#fff",
            border: "none",
            borderRadius: 8,
          }}
        >
          حفظ الرصد
        </button>
      )}
    </main>
  );
}
