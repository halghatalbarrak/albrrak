"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, Card, Button, Input, Badge, EmptyState, Skeleton, ui, sp } from "@/components/ui";

// شاشة التشغيل الموحّدة (م ج): لوحة الحلقة كلها — لكل طالبٍ حضورُه ووجهةُ يومه بالأزرار، بلا
// مغادرة. طبقة عرضٍ وتسجيلٍ فوق المحرّكات القائمة (getUnifiedBoard/markAttendance/session/extra/
// العذر/المنح). لا تكسر شاشتَي الجلسة/الحضور القائمتين — هذه إضافةٌ مستقلّة.

interface Bound { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }
interface NewHifz { kind: "NEW" | "REPEAT" | "COMPLETED" | "NO_TRACK"; bound?: Bound }
interface Target {
  status: "ACTIVE" | "ON_LEAVE" | "NOT_MARAQI" | "INACTIVE";
  newHifz: NewHifz | null;
  tarseekh: Bound[];
  murajaah: { dayNo: number | null; totalStock: number; todaySlice: Bound[] } | null;
}
interface Qaidah {
  started: boolean; graduated: boolean; deferred: boolean;
  todayResult: "MASTERED" | "NOT_MASTERED" | "DEFERRED" | null;
  consecutiveDeferrals: number; locked: boolean;
  chapterName: string | null; lessonName: string | null;
  lessonIndexInChapter: number | null; lessonsInChapter: number | null; percent: number;
}
interface Student {
  studentId: string; name: string;
  attendanceStatus: string | null;
  todayHifzDone: boolean; tarseekhDone: boolean | null;
  today: Target;
  qaidah: Qaidah | null;
}
interface Circle { id: string; nameAr: string }
interface GrantItem { id: string; nameAr: string; value: number; grantSource: string }

const ATT_LABEL: Record<string, string> = {
  PRESENT: "حاضر", LATE: "متأخّر", ABSENT_UNEXCUSED: "غائب", LEFT_NO_PERMISSION: "خرج بلا إذن",
  ABSENT_EXCUSED: "غائب بعذر", PRE_EXCUSED: "مستأذن", LEFT_EARLY: "خرج مبكّرًا",
};
// أزرار الحضور المباشرة (مستأذن يُقدَّم عبر مسار العذر لا زرّاً مباشراً — §١٠٫٢).
const ATT_BUTTONS: { status: string; label: string; tone: "primary" | "bronze" | "danger" }[] = [
  { status: "PRESENT", label: "حاضر", tone: "primary" },
  { status: "LATE", label: "متأخّر", tone: "bronze" },
  { status: "ABSENT_UNEXCUSED", label: "غائب", tone: "danger" },
  { status: "LEFT_NO_PERMISSION", label: "خرج بلا إذن", tone: "danger" },
];

const boundStr = (b: Bound) => `${b.fromSurah}:${b.fromAyah} ← ${b.toSurah}:${b.toAyah}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}
const CRUMBS = [{ label: "الرئيسة", href: "/" }, { label: "التشغيل" }, { label: "الشاشة الموحّدة" }];

export default function UnifiedPage() {
  const { me } = useMe();
  const date = todayISO();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState("");
  const [students, setStudents] = useState<Student[] | null>(null);
  const [absentDefault, setAbsentDefault] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<GrantItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (cid: string) => {
    const t = await token(); if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/circles/${cid}/unified?date=${date}`, { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
    if (!res.ok) { setStatus("error"); return; }
    const b = (await res.json()) as { students: Student[]; absentDefault?: boolean };
    setStudents(b.students); setAbsentDefault(Boolean(b.absentDefault));
    setStatus("ready");
  }, [date]);

  // الحلقات + بنود التقدير (مرّةً).
  useEffect(() => {
    void (async () => {
      const t = await token(); if (!t) { setStatus("unauth"); return; }
      const [cRes, gRes] = await Promise.all([
        fetch("/api/attendance/circles", { headers: { authorization: `Bearer ${t}` } }),
        fetch("/api/economy/grant", { headers: { authorization: `Bearer ${t}` } }),
      ]);
      if (cRes.ok) {
        const cs = ((await cRes.json()) as { circles?: Circle[] }).circles ?? [];
        setCircles(cs); if (cs.length) setCircleId(cs[0].id); else setStatus("ready");
      } else setStatus("error");
      if (gRes.ok) setItems((((await gRes.json()) as { items?: GrantItem[] }).items ?? []).filter((i) => i.value > 0));
    })();
  }, []);
  useEffect(() => { if (circleId) void load(circleId); }, [circleId, load]);

  async function post(url: string, body: Record<string, unknown>, okMsg: string) {
    setMsg(null);
    const t = await token(); if (!t) { setStatus("unauth"); return; }
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify(body) });
    if (res.ok) { setMsg(okMsg); await load(circleId); }
    else { const j = await res.json().catch(() => ({})) as { error?: string }; setMsg(j.error ?? "تعذّر التسجيل."); }
  }

  const cur = students?.find((s) => s.studentId === selected) ?? null;

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/unified" title="الشاشة الموحّدة" crumbs={CRUMBS}>{children}</AppShell>
  );

  if (status === "unauth") return <Shell><p>تحتاج دخولًا كمعلّم/إدارة.</p></Shell>;
  if (status === "loading") return <Shell><Skeleton height={80} /></Shell>;
  if (status === "error") return <Shell><p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" onClick={() => void load(circleId)}>إعادة</Button></p></Shell>;
  if (circles.length === 0) return <Shell><EmptyState title="لا حلقات تَرصدها" /></Shell>;

  return (
    <Shell>
      {circles.length > 1 && (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(3) }}>
          {circles.map((c) => <Button key={c.id} size="sm" variant={c.id === circleId ? "bronze" : "ghost"} onClick={() => { setCircleId(c.id); setSelected(null); }}>{c.nameAr}</Button>)}
        </div>
      )}
      {absentDefault && <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(2) }}>الأصل اليوم «غياب»: من لم تَرفعه حاضرًا يُحسب غائبًا. أشِّر الحاضرين من اللوحة.</p>}
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs, marginBottom: sp(2) }}>{msg}</p>}

      <div style={{ display: "flex", gap: sp(4), alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* اللوحة الجانبيّة: قائمة الطلاب (من أُنجز/بقي) */}
        <div style={{ flex: "1 1 260px", minWidth: 240, maxWidth: 360, display: "flex", flexDirection: "column", gap: sp(2) }}>
          {students?.map((s) => {
            const done = s.attendanceStatus != null;
            return (
              <button key={s.studentId} onClick={() => setSelected(s.studentId)}
                style={{ textAlign: "start", border: `1px solid ${s.studentId === selected ? ui.color.goldLine : ui.color.border}`, background: s.studentId === selected ? ui.color.soft : ui.color.surface, borderRadius: ui.radius.md, padding: `${sp(2)} ${sp(3)}`, cursor: "pointer", fontFamily: ui.font, color: ui.color.text, display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(2) }}>
                <strong style={{ fontSize: ui.text.base }}>{s.name}</strong>
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {done ? <Badge tone="success">{ATT_LABEL[s.attendanceStatus!] ?? s.attendanceStatus}</Badge>
                    : absentDefault ? <Badge tone="danger">غياب (لم يُرفَع)</Badge> : <Badge tone="neutral">لم يُرفَع</Badge>}
                  {s.todayHifzDone && <Badge tone="bronze">حفظ ✓</Badge>}
                </span>
              </button>
            );
          })}
          {students?.length === 0 && <EmptyState title="لا طلاب في الحلقة" />}
        </div>

        {/* لوحة الطالب */}
        <div style={{ flex: "2 1 420px", minWidth: 300 }}>
          {!cur ? <Card><p style={{ margin: 0, color: ui.color.muted }}>اختر طالبًا من القائمة.</p></Card>
            : <StudentPanel s={cur} circleId={circleId} date={date} items={items} post={post} />}
        </div>
      </div>
    </Shell>
  );
}

function StudentPanel({ s, circleId, date, items, post }: {
  s: Student; circleId: string; date: string; items: GrantItem[];
  post: (url: string, body: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const sug = s.today.newHifz?.kind === "NEW" || s.today.newHifz?.kind === "REPEAT" ? s.today.newHifz.bound! : null;
  const [hifz, setHifz] = useState({ fromSurah: "", fromAyah: "", toSurah: "", toAyah: "" });
  useEffect(() => {
    setHifz(sug ? { fromSurah: String(sug.fromSurah), fromAyah: String(sug.fromAyah), toSurah: String(sug.toSurah), toAyah: String(sug.toAyah) }
      : { fromSurah: "", fromAyah: "", toSurah: "", toAyah: "" });
  }, [s.studentId, sug?.fromSurah, sug?.fromAyah, sug?.toSurah, sug?.toAyah]); // eslint-disable-line react-hooks/exhaustive-deps

  const sid = s.studentId;
  const markAtt = (st: string) => post(`/api/circles/${circleId}/mark-attendance`, { studentId: sid, status: st, date }, "سُجِّل الحضور.");
  const excuse = () => {
    const reason = window.prompt("سبب الاستئذان/العذر:");
    if (reason?.trim()) void post("/api/attendance/excuse", { studentId: sid, date, reason, kind: "EXCUSE" }, "قُدِّم طلب العذر — بانتظار اعتماد صاحب الصلاحية.");
  };
  const saveHifz = (mastered: boolean) => post(`/api/students/${sid}/session`, { kind: "hifz", date, fromSurah: Number(hifz.fromSurah), fromAyah: Number(hifz.fromAyah), toSurah: Number(hifz.toSurah), toAyah: Number(hifz.toAyah), attempts: 1, mastered }, "سُجِّل الحفظ.");
  const task = (kind: "tarseekh" | "murajaah", done: boolean) => post(`/api/students/${sid}/session`, kind === "tarseekh" ? { kind, date, done } : { kind, date, count: done ? 1 : 0 }, "سُجِّلت المهمّة.");
  const extra = (kind: string) => post(`/api/students/${sid}/extra`, { kind, date }, "سُجِّلت الزيادة.");
  const grant = (pointItemId: string) => post("/api/economy/grant", { studentId: sid, pointItemId }, "مُنح التقدير.");
  // القاعدة المدنية (م ج): تقييم درس الطالب الحاليّ — يُعاد استعمال مسار جلسة القاعدة القائم.
  const qaidahEval = (mastered: boolean) => post(`/api/students/${sid}/qaidah-session`, { mastered }, "سُجِّل التقييم.");
  const qaidahDefer = () => post(`/api/students/${sid}/qaidah-session`, { defer: true }, "سُجِّل التأجيل.");

  const num: React.CSSProperties = { width: 60 };
  const H3: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` };
  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: sp(4) }}>
      <strong style={{ fontSize: ui.text.lg }}>{s.name}</strong>

      {/* ١) الحضور */}
      <div>
        <h3 style={H3}>الحضور{s.attendanceStatus ? ` — ${ATT_LABEL[s.attendanceStatus] ?? s.attendanceStatus}` : ""}</h3>
        <div style={row}>
          {ATT_BUTTONS.map((b) => <Button key={b.status} size="sm" variant={b.tone} onClick={() => void markAtt(b.status)}>{b.label}</Button>)}
          <Button size="sm" variant="ghost" onClick={excuse}>مستأذن…</Button>
        </div>
      </div>

      {/* ٢) القاعدة: الدرس الحاليّ (م ج) · أو وجهة اليوم (مراقي) · أو رسالةٌ لغيرهما */}
      {s.qaidah ? <QaidahPanel q={s.qaidah} onEval={qaidahEval} onDefer={qaidahDefer} />
        : s.today.status === "ON_LEAVE" ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: 0 }}>في إجازة اختبار المرحلة — لا وجهةَ حفظٍ اليوم.</p>
        : s.today.status !== "ACTIVE" ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: 0 }}>لا مهامّ يوميّة لهذا الطالب (ليس في مراقي ولا القاعدة المدنية).</p>
        : (
          <>
            <div>
              <h3 style={H3}>الحفظ الجديد</h3>
              {s.today.newHifz?.kind === "COMPLETED" ? <p style={{ color: ui.color.success, margin: 0 }}>أتمّ محفوظ مساره 🎉</p>
                : s.today.newHifz?.kind === "NO_TRACK" ? <p style={{ color: ui.color.muted, margin: 0 }}>لم يُحدَّد مساره بعد.</p>
                : <>
                    {s.today.newHifz?.kind === "REPEAT" && <p style={{ color: ui.color.danger, fontSize: ui.text.xs, margin: `0 0 ${sp(2)}` }}>الحكم ١: يعيد مقطع أمس.</p>}
                    <div style={{ ...row, marginBottom: sp(2), fontSize: ui.text.xs }}>
                      <span>من</span><Input style={num} type="number" value={hifz.fromSurah} onChange={(e) => setHifz({ ...hifz, fromSurah: e.target.value })} />:
                      <Input style={num} type="number" value={hifz.fromAyah} onChange={(e) => setHifz({ ...hifz, fromAyah: e.target.value })} />
                      <span>إلى</span><Input style={num} type="number" value={hifz.toSurah} onChange={(e) => setHifz({ ...hifz, toSurah: e.target.value })} />:
                      <Input style={num} type="number" value={hifz.toAyah} onChange={(e) => setHifz({ ...hifz, toAyah: e.target.value })} />
                    </div>
                    <div style={row}>
                      <Button size="sm" variant="primary" onClick={() => void saveHifz(true)}>أتقن</Button>
                      <Button size="sm" variant="danger" onClick={() => void saveHifz(false)}>لم يُتقن</Button>
                      <Button size="sm" variant="ghost" onClick={() => void extra("hifz")}>+ زيادة</Button>
                    </div>
                  </>}
            </div>

            <div>
              <h3 style={H3}>الترسيخ{s.today.tarseekh.length ? ` (${s.today.tarseekh.length} وحدة)` : ""}</h3>
              {s.today.tarseekh.length > 0 && <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: `0 0 ${sp(2)}` }}>{s.today.tarseekh.slice(0, 4).map(boundStr).join(" · ")}{s.today.tarseekh.length > 4 ? " …" : ""}</p>}
              <div style={row}>
                <Button size="sm" variant="primary" onClick={() => void task("tarseekh", true)}>تمّ</Button>
                <Button size="sm" variant="danger" onClick={() => void task("tarseekh", false)}>لم يتمّ</Button>
                <Button size="sm" variant="ghost" onClick={() => void extra("tarseekh")}>+ زيادة</Button>
              </div>
            </div>

            <div>
              <h3 style={H3}>المراجعة{s.today.murajaah?.todaySlice.length ? " — حصّة اليوم" : ""}</h3>
              {s.today.murajaah && s.today.murajaah.todaySlice.length > 0 && <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: `0 0 ${sp(2)}` }}>{s.today.murajaah.todaySlice.slice(0, 4).map(boundStr).join(" · ")}</p>}
              <div style={row}>
                <Button size="sm" variant="primary" onClick={() => void task("murajaah", true)}>تمّت</Button>
                <Button size="sm" variant="danger" onClick={() => void task("murajaah", false)}>لم تتمّ</Button>
                <Button size="sm" variant="ghost" onClick={() => void extra("murajaah")}>+ زيادة</Button>
              </div>
            </div>
          </>)}

      {/* ٤) تقدير يدويّ */}
      {items.length > 0 && (
        <div>
          <h3 style={H3}>تقدير</h3>
          <div style={row}>
            {items.map((it) => <Button key={it.id} size="sm" variant="bronze" onClick={() => void grant(it.id)}>{it.nameAr} (+{it.value})</Button>)}
          </div>
        </div>
      )}
    </Card>
  );
}

// كتلة القاعدة المدنية داخل لوحة الطالب (م ج): الباب + الدرس الحاليّ + ترتيبه + النسبة + عدّاد
// التأجيلات + تقييم اليوم، وأزرار متقن/غير متقن/مؤجَّل (متاحةٌ في كل حالات الحضور — ق٣).
function QaidahPanel({ q, onEval, onDefer }: { q: Qaidah; onEval: (mastered: boolean) => void; onDefer: () => void }) {
  const H3: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` };
  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };

  if (q.graduated || q.locked) {
    return (
      <div>
        <h3 style={H3}>القاعدة المدنية</h3>
        <Badge tone="success">{q.locked ? "تخرّج — التقييم مقفل" : "أتمّ القاعدة المدنية ✓"}</Badge>
      </div>
    );
  }

  const resultLabel = q.todayResult === "MASTERED" ? "متقن"
    : q.todayResult === "NOT_MASTERED" ? "غير متقن"
    : q.todayResult === "DEFERRED" ? "مؤجَّل" : null;

  return (
    <div>
      <h3 style={H3}>القاعدة المدنية — الدرس الحاليّ</h3>
      <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: `0 0 ${sp(2)}` }}>
        {q.chapterName ? <>الباب: <strong style={{ color: ui.color.text }}>{q.chapterName}</strong> · </> : null}
        الدرس: <strong style={{ color: ui.color.text }}>{q.lessonName ?? "—"}</strong>
        {q.lessonIndexInChapter && q.lessonsInChapter ? ` (${arNum(q.lessonIndexInChapter)}/${arNum(q.lessonsInChapter)})` : ""}
        {" · "}{arNum(q.percent)}٪
        {q.consecutiveDeferrals > 0 ? <> · <Badge tone="bronze">تأجيلات متتالية: {arNum(q.consecutiveDeferrals)}</Badge></> : null}
        {resultLabel ? <> · اليوم: <strong style={{ color: ui.color.text }}>{resultLabel}</strong></> : null}
      </p>
      <div style={row}>
        <Button size="sm" variant="primary" onClick={() => onEval(true)}>متقن</Button>
        <Button size="sm" variant="danger" onClick={() => onEval(false)}>غير متقن</Button>
        <Button size="sm" variant="ghost" onClick={onDefer} title="حاضرٌ لم يُقيَّم لضيق الوقت — لا ينقل الموضع">مؤجَّل</Button>
      </div>
    </div>
  );
}
