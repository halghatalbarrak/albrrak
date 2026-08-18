"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Input, Badge, EmptyState, Skeleton, ui, sp } from "@/components/ui";

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

export default function AttendancePage() {
  const { me } = useMe();
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
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/attendance"
      title="رصد الحضور" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "التشغيل" }, { label: "الحضور" }]}>
      <p style={{ color: ui.color.muted, margin: `0 0 ${sp(4)}`, fontSize: ui.text.base }}>
        الجميع حاضرون افتراضًا — أشِّر الغائب فقط.
      </p>

      <div style={{ display: "flex", gap: sp(3), flexWrap: "wrap", alignItems: "center", marginBottom: sp(4) }}>
        <Select value={circleId} onChange={(e) => setCircleId(e.target.value)} style={{ width: "auto", minWidth: 200 }}>
          <option value="">— اختر حلقة —</option>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>{c.nameAr}</option>
          ))}
        </Select>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} />
        {pending > 0 && (
          <Button variant="bronze" size="sm" type="button" onClick={() => void flush()}>
            مزامنة ({pending}) مؤجَّل
          </Button>
        )}
      </div>

      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {err && <p style={{ color: ui.color.danger, fontSize: ui.text.xs }}>{err}</p>}

      {/* حالات صريحة: تحميل / فارغ / قائمة */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={48} />)}
        </div>
      )}
      {!loading && ready && circles.length === 0 && !err && (
        <EmptyState title="لا حلقات تَرصدها" description="لم تُسنَد إليك حلقةٌ للرصد بعد." />
      )}
      {!loading && circleId && roster.length === 0 && !err && (
        <EmptyState title="لا طلاب في هذه الحلقة" />
      )}
      {!circleId && !loading && circles.length > 0 && (
        <EmptyState title="اختر حلقةً لعرض القائمة" description="حدّد الحلقة والتاريخ أعلاه." />
      )}

      {!loading && roster.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
          {roster.map((s) => (
            <Card key={s.studentId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3), padding: `${sp(2)} ${sp(4)}` }}>
              <strong style={{ fontSize: ui.text.base }}>{s.name}</strong>
              {isExcused(s.status) ? (
                <Badge tone="success">{STATUS_LABEL[s.status]} (معتمَد)</Badge>
              ) : (
                <Select value={s.status} onChange={(e) => setStatus(s.studentId, e.target.value)} style={{ width: "auto", minWidth: 130 }}>
                  {MARKABLE.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </Select>
              )}
            </Card>
          ))}
        </div>
      )}

      {!loading && roster.length > 0 && (
        <Button type="button" onClick={() => void save()} style={{ marginTop: sp(4) }}>
          حفظ الرصد
        </Button>
      )}
    </AppShell>
  );
}
