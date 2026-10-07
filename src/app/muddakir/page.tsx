"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { arNum, formatAyah } from "@/lib/format";
import { ui, sp, Button, Card, Modal, Input, Select, Badge } from "@/components/ui";
import { tMuddakir as t, stageLabel } from "@/i18n/ar/muddakir";
import {
  EventQueue,
  buildEvent,
  browserDeps,
  toFoldEvent,
  foldDay,
  makkahDayDate,
  type DeviceEventInput,
  type QueuedEvent,
} from "@/lib/muddakir";
import { IdbQueueStore } from "./idb-store";

// ───────────────── أنواع العرض (مرآة HafizTodayView في الخادم) ─────────────────
interface Stage { number: number; startJuz: number; endJuz: number; faceInStage: number; stageTotal: number; currentPage: number }
interface Plan {
  dayDate: string; reviewOnly: boolean; excused: boolean;
  yesterday: number[]; newFaces: number[]; ribat: number[]; reviewSlice: number[];
  openTreatments: { page: number; lineNo: number; source: string }[];
  makeup: { forDate: string; newFromPage: number | null; newToPage: number | null } | null;
}
interface TrackChange { tracks: number[]; pendingTrack: number | null; effectiveFrom: string | null; requestedTrack: number | null }
interface WardBound { fromJuz: number; toJuz: number; fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }
interface WardView {
  dayDate: string; phase: "TATHBIT" | "PERMANENT"; degreeNo: number; dailyJuz: number;
  khatmaInDegree: number; cumulativeKhatmat: number; finishedLadder: boolean; status: string;
  wards: WardBound[]; reminderDay: string;
}
interface TodayView {
  phase?: "MEMORIZE" | "TATHBIT" | "PERMANENT";
  ward?: WardView | null;
  dayDate: string; track: number; reviewOnly: boolean; status: string;
  stage: Stage | null; meeting: { day: string; facesToRead: number };
  plan: Plan; settings: { newReps: number; firstCleanReps: number; yesterdayReps: number; treatmentLineReps: number };
  trackChange: TrackChange;
  stageProgress: { stage: number; memorized: number; total: number; ready: boolean; awaitingFinal: boolean; graduated: boolean } | null;
}

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const range = (a: number[]) => (a.length ? `${arNum(Math.min(...a))}–${arNum(Math.max(...a))}` : "—");

export default function MuddakirHafizPage() {
  const [view, setView] = useState<TodayView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauth" | "error">("loading");
  const [online, setOnline] = useState(true);
  const [events, setEvents] = useState<QueuedEvent[]>([]);
  const [errModal, setErrModal] = useState<null | "RIBAT" | "REVIEW">(null);
  const [errPage, setErrPage] = useState(""); const [errLine, setErrLine] = useState("");
  const [excuseOpen, setExcuseOpen] = useState(false);
  const [reqTrack, setReqTrack] = useState("");
  const queueRef = useRef<EventQueue | null>(null);

  // ── طابور الأحداث (IndexedDB) ──
  const queue = () => {
    if (!queueRef.current) queueRef.current = new EventQueue(new IdbQueueStore());
    return queueRef.current;
  };

  const refreshEvents = useCallback(async () => {
    try { setEvents(await queue().all()); } catch { /* بلا IndexedDB */ }
  }, []);

  const sendEvents = useCallback(async (evs: DeviceEventInput[]) => {
    const tok = await token();
    if (!tok) throw new Error("no-token");
    const res = await fetch("/api/muddakir/events", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ events: evs }),
    });
    if (!res.ok) throw new Error(`send-${res.status}`);
  }, []);

  const flush = useCallback(async () => {
    try { await queue().flush(sendEvents); await refreshEvents(); } catch { /* بلا اتّصال — يبقى في الطابور */ }
  }, [sendEvents, refreshEvents]);

  const loadView = useCallback(async () => {
    try {
      const tok = await token();
      if (!tok) { setStatus("unauth"); return; }
      const res = await fetch("/api/muddakir/today", { headers: { authorization: `Bearer ${tok}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      setView((await res.json()) as TodayView);
      setStatus("ready");
    } catch { setStatus(view ? "ready" : "error"); } // بلا إنترنت: أبقِ الكاش
  }, [view]);

  useEffect(() => {
    // تسجيل Service Worker (العمل بلا إنترنت).
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/muddakir-sw.js").catch(() => {});
    setOnline(navigator.onLine);
    void refreshEvents();
    void loadView();
    const onOnline = () => { setOnline(true); void flush(); void loadView(); };
    const onOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === "visible") { void flush(); } }; // مزامنة iOS عند الفتح
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    void flush();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── العدّادات محليّةٌ وفوريّة: طيّ أحداث اليوم المحفوظة (تبقى بعد إعادة التحميل) ──
  const dayDate = view?.dayDate ?? makkahDayDate(new Date());
  const counters = useMemo(() => {
    const todays = events.filter((e) => makkahDayDate(new Date(e.occurredAt)) === dayDate).map(toFoldEvent);
    return foldDay(todays, view?.settings.firstCleanReps ?? 3);
  }, [events, dayDate, view]);
  const treatCount = (page: number, lineNo: number) =>
    events.filter((e) => e.type === "TREATMENT_REP" && e.payload?.page === page && e.payload?.lineNo === lineNo && makkahDayDate(new Date(e.occurredAt)) === dayDate).length;

  const emit = useCallback(async (type: string, payload: Record<string, unknown> | null = null) => {
    const e = buildEvent(type, payload, browserDeps);
    setEvents((prev) => [...prev, { ...e, sent: false }]); // تحديثٌ فوريٌّ محلّيّ
    try { await queue().enqueue(e); } catch { /* بلا IndexedDB */ }
    if (navigator.onLine) void flush();
  }, [flush]);

  if (status === "unauth")
    return <Center><p>هذه الشاشة للحافظ الملتحق بالمُدَّكِر.</p><a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a></Center>;
  if (status === "loading") return <Center><p style={{ color: ui.color.muted }}>…جارٍ التحميل</p></Center>;
  if (status === "error" || !view) return <Center><p style={{ color: ui.color.danger }}>تعذّر التحميل.</p><Button size="sm" onClick={() => void loadView()}>إعادة</Button></Center>;

  // طور التثبيت/الدائم (§١٢): شاشة الورد بدل خطّة الحفظ.
  if (view.phase && view.phase !== "MEMORIZE" && view.ward) {
    const wardDoneToday = events.filter((e) => e.type === "WARD_COMPLETE" && makkahDayDate(new Date(e.occurredAt)) === view.ward!.dayDate).length;
    return <WardHome ward={view.ward} doneToday={wardDoneToday} online={online} onComplete={() => void emit("WARD_COMPLETE")} />;
  }

  const { stage, plan, settings } = view;
  const completed = counters.completedAtMs != null || view.status === "COMPLETE" || view.status === "MADE_UP";
  const excused = counters.excuseReason != null || plan.excused;
  const progress = stage ? stage.faceInStage / stage.stageTotal : 0;

  return (
    <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, maxWidth: 480, margin: "0 auto", padding: sp(3), display: "flex", flexDirection: "column", gap: sp(3) }}>
      {/* الرأس */}
      <Card style={{ padding: sp(3) }}>
        <div style={{ fontWeight: 700, fontSize: ui.text.base }}>
          {stage ? `${stageLabel(stage.number)} · ${t("juzRange")} ${arNum(stage.startJuz)}–${arNum(stage.endJuz)} · ${t("face")} ${arNum(stage.faceInStage)} ${t("loadWord")} ${arNum(stage.stageTotal)}` : t("programName")}
        </div>
        <div style={{ color: ui.color.muted, fontSize: ui.text.xs, marginTop: sp(1) }}>{t("track")}: {arNum(view.track)}</div>
        <div style={{ height: 8, background: ui.color.soft, borderRadius: 999, marginTop: sp(2), overflow: "hidden" }}>
          <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: ui.color.primary }} />
        </div>
        <div style={{ marginTop: sp(2), fontSize: ui.text.xs, display: "flex", alignItems: "center", gap: sp(1) }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: online ? ui.color.success : ui.color.muted, display: "inline-block" }} />
          {online ? t("online") : t("offlineSaved")}
        </div>
        {view.stageProgress && (view.stageProgress.graduated || view.stageProgress.awaitingFinal || view.stageProgress.ready) && (
          <div style={{ marginTop: sp(2), padding: sp(2), borderRadius: 8, background: ui.color.soft, fontSize: ui.text.xs, fontWeight: 700, textAlign: "center", color: ui.color.bronze }}>
            {view.stageProgress.graduated ? t("graduatedLabel") : view.stageProgress.awaitingFinal ? t("awaitingFinal") : t("stageReady")}
          </div>
        )}
      </Card>

      {/* تذكير اللقاء */}
      <Card style={{ padding: sp(3), fontSize: ui.text.xs }}>
        <strong>{t("meetingReminder")}</strong>
        <div style={{ color: ui.color.muted, marginTop: sp(1) }}>{arNum(view.meeting.facesToRead)} {t("facesToReadWord")}</div>
      </Card>

      {/* تغيير المسار (§٤٫١): طلبُ الحافظ يُقرّه المشرف */}
      <Card style={{ padding: sp(3), fontSize: ui.text.xs }}>
        <strong>{t("trackChangeTitle")}</strong>
        <div style={{ color: ui.color.muted, marginTop: sp(1) }}>{t("track")}: {arNum(view.track)} {t("facesPerDay")}</div>
        {view.trackChange.pendingTrack != null ? (
          <div style={{ color: ui.color.bronze, marginTop: sp(2) }}>
            {t("trackPendingNote")} {view.trackChange.effectiveFrom ? arNum(view.trackChange.effectiveFrom) : "—"} — {t("track")} {arNum(view.trackChange.pendingTrack)}
          </div>
        ) : view.trackChange.requestedTrack != null ? (
          <div style={{ color: ui.color.muted, marginTop: sp(2) }}>{t("trackRequestSent")} ({t("track")} {arNum(view.trackChange.requestedTrack)})</div>
        ) : (
          <div style={{ display: "flex", gap: sp(2), alignItems: "center", marginTop: sp(2), flexWrap: "wrap" }}>
            <Select value={reqTrack} onChange={(e) => setReqTrack(e.target.value)} style={{ width: "auto" }} aria-label={t("trackChangeTitle")}>
              <option value="">— {t("track")} —</option>
              {view.trackChange.tracks.filter((n) => n !== view.track).map((n) => <option key={n} value={n}>{arNum(n)} {t("facesPerDay")}</option>)}
            </Select>
            <Button size="sm" disabled={!reqTrack} onClick={() => { void emit("TRACK_CHANGE_REQUEST", { track: Number(reqTrack) }); setReqTrack(""); }}>{t("requestTrackChange")}</Button>
          </div>
        )}
      </Card>

      {/* قضاء الأمس */}
      {plan.makeup && (
        <Card style={{ padding: sp(3), border: `1px solid ${ui.color.bronze}` }}>
          <strong>{t("makeupTitle")}</strong>
          <div style={{ color: ui.color.muted, fontSize: ui.text.xs, marginTop: sp(1) }}>{t("makeupDeadline")}</div>
          <Button size="sm" style={{ marginTop: sp(2) }} onClick={() => void emit("MAKEUP_COMPLETE", { makeupForDate: plan.makeup!.forDate })}>{t("markDone")}</Button>
        </Card>
      )}

      {/* ١ تكرار الأمس */}
      {plan.yesterday.length > 0 && (
        <Section title={`${arNum(1)}. ${t("pillarYesterday")}`}>
          {plan.yesterday.map((page) => (
            <Row key={page} label={`${t("face")} ${arNum(page)}`}>
              <BigCount value={counters.faces.get(page)?.yesterdayReps ?? 0} total={settings.yesterdayReps} onTap={() => void emit("YESTERDAY_REP", { page })} />
            </Row>
          ))}
        </Section>
      )}

      {/* ٢ الجديد */}
      <Section title={`${arNum(2)}. ${t("pillarNew")}`}>
        {view.reviewOnly ? <Muted>{t("reviewOnlyNote")}</Muted>
          : excused ? <Muted>{t("noNewToday")}</Muted>
          : plan.newFaces.length === 0 ? <Muted>{t("noNewToday")}</Muted>
          : plan.newFaces.map((page) => {
            const c = counters.faces.get(page) ?? { reps: 0, repErrors: 0, yesterdayReps: 0 };
            return (
              <Card key={page} style={{ padding: sp(3), marginBottom: sp(2) }}>
                <div style={{ fontWeight: 700 }}>{t("face")} {arNum(page)}</div>
                <div style={{ display: "flex", gap: sp(1), flexWrap: "wrap", margin: `${sp(2)} 0`, fontSize: ui.text.xs, color: ui.color.muted }}>
                  <span>{t("stepListen")}</span><span>·</span><span>{t("stepMemorize")}</span><span>·</span><span>{t("stepRecord")}</span>
                </div>
                <BigCount value={c.reps} total={settings.newReps} onTap={() => void emit("NEW_REP", { page })} large />
                <div style={{ display: "flex", gap: sp(2), marginTop: sp(2) }}>
                  <Button variant="danger" size="sm" onClick={() => void emit("NEW_ERROR", { page })}>{t("erred")}</Button>
                  <Button variant="ghost" size="sm" onClick={() => void emit("NEW_UNDO", { page })}>{t("undo")}</Button>
                  <span style={{ marginRight: "auto", fontSize: ui.text.xs, color: ui.color.muted }}>{t("repErrorsLabel")}: {arNum(c.repErrors)}</span>
                </div>
              </Card>
            );
          })}
      </Section>

      {/* ٣ الربط */}
      <Section title={`${arNum(3)}. ${t("pillarRibat")}`}>
        <Row label={`${t("rangeLabel")}: ${range(plan.ribat)} (${arNum(plan.ribat.length)})`}>
          <div style={{ display: "flex", gap: sp(2) }}>
            <Button size="sm" variant={counters.ribatDone ? "ghost" : "primary"} onClick={() => void emit("RIBAT_DONE")}>{counters.ribatDone ? t("done") : t("markDone")}</Button>
          </div>
        </Row>
        <Button variant="ghost" size="sm" style={{ marginTop: sp(2) }} onClick={() => setErrModal("RIBAT")}>{t("recordErrorPos")}</Button>
      </Section>

      {/* ٤ المراجعة */}
      <Section title={`${arNum(4)}. ${t("pillarReview")}`}>
        <Row label={`${t("todaySlice")}: ${range(plan.reviewSlice)} (${arNum(plan.reviewSlice.length)})`}>
          <Button size="sm" variant={counters.reviewDone ? "ghost" : "primary"} onClick={() => void emit("REVIEW_DONE")}>{counters.reviewDone ? t("done") : t("markDone")}</Button>
        </Row>
      </Section>

      {/* ٥ علاج الأخطاء */}
      <Section title={`${arNum(5)}. ${t("pillarErrors")}`}>
        {plan.openTreatments.length === 0 ? <Muted>—</Muted> : plan.openTreatments.map((o) => (
          <Row key={`${o.page}-${o.lineNo}`} label={`${t("pageWord")} ${arNum(o.page)} · ${t("lineWord")} ${arNum(o.lineNo)}`}>
            <BigCount value={treatCount(o.page, o.lineNo)} total={settings.treatmentLineReps} onTap={() => void emit("TREATMENT_REP", { page: o.page, lineNo: o.lineNo })} />
          </Row>
        ))}
      </Section>

      {/* الإتمام والعذر */}
      <div style={{ display: "flex", gap: sp(2), marginTop: sp(2) }}>
        <Button variant="ghost" onClick={() => setExcuseOpen(true)}>{t("excuseBtn")}</Button>
        <Button style={{ marginRight: "auto" }} disabled={completed} onClick={() => void emit("DAY_COMPLETE")}>
          {completed ? t("dayCompleted") : t("completeDay")}
        </Button>
      </div>

      {/* نافذة تسجيل موضع خطأ */}
      {errModal && (
        <Modal open onClose={() => setErrModal(null)} title={t("recordErrorPos")}>
          <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
            <Input inputMode="numeric" placeholder={t("pageWord")} value={errPage} onChange={(e) => setErrPage(e.target.value)} />
            <Input inputMode="numeric" placeholder={t("lineWord")} value={errLine} onChange={(e) => setErrLine(e.target.value)} />
            <div style={{ display: "flex", gap: sp(2) }}>
              <Button size="sm" disabled={!errPage || !errLine} onClick={() => { void emit("ERROR_OPEN", { page: Number(errPage), lineNo: Number(errLine), source: errModal }); setErrPage(""); setErrLine(""); setErrModal(null); }}>{t("save")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setErrModal(null)}>{t("cancel")}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* نافذة العذر */}
      {excuseOpen && (
        <Modal open onClose={() => setExcuseOpen(false)} title={t("excuseBtn")}>
          <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
            {(["ILLNESS", "TRAVEL", "EXAMS"] as const).map((r) => (
              <Button key={r} variant="ghost" onClick={() => { void emit("EXCUSE", { reason: r }); setExcuseOpen(false); }}>
                {t(r === "ILLNESS" ? "excuseIllness" : r === "TRAVEL" ? "excuseTravel" : "excuseExams")}
              </Button>
            ))}
          </div>
        </Modal>
      )}
    </main>
  );
}

// ───────────────── مكوّناتٌ صغيرة ─────────────────
function Center({ children }: { children: React.ReactNode }) {
  return <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>{children}</main>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h2 style={{ fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` }}>{title}</h2>{children}</div>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <Card style={{ padding: sp(3), marginBottom: sp(2), display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(2) }}><span style={{ fontSize: ui.text.xs }}>{label}</span>{children}</Card>;
}
function Muted({ children }: { children: React.ReactNode }) {
  return <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{children}</p>;
}
// ───────────────── شاشة الورد (التثبيت/الدائم، §١٢) ─────────────────
function WardHome({ ward, doneToday, online, onComplete }: { ward: WardView; doneToday: number; online: boolean; onComplete: () => void }) {
  const title = ward.phase === "PERMANENT" ? t("permanentWardTitle") : t("wardTitle");
  return (
    <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, maxWidth: 480, margin: "0 auto", padding: sp(3), display: "flex", flexDirection: "column", gap: sp(3) }}>
      <Card style={{ padding: sp(3) }}>
        <div style={{ fontWeight: 700, fontSize: ui.text.base }}>
          {title}
          {ward.phase === "TATHBIT" && <span style={{ color: ui.color.muted, fontSize: ui.text.xs, marginRight: sp(2) }}>· {t("wardDegree")} {arNum(ward.degreeNo)} ({arNum(ward.dailyJuz)} {t("wardJuzPerDay")})</span>}
        </div>
        <div style={{ color: ui.color.muted, fontSize: ui.text.xs, marginTop: sp(1) }}>
          {t("wardCumulative")}: {arNum(ward.cumulativeKhatmat)}{ward.phase === "TATHBIT" ? ` · ${t("wardKhatma")} ${arNum(ward.khatmaInDegree + 1)}` : ""}
        </div>
        <div style={{ marginTop: sp(2), fontSize: ui.text.xs, display: "flex", alignItems: "center", gap: sp(1) }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: online ? ui.color.success : ui.color.muted, display: "inline-block" }} />
          {online ? t("online") : t("offlineSaved")}
        </div>
      </Card>

      {ward.finishedLadder && <Card style={{ padding: sp(3), border: `1px solid ${ui.color.bronze}` }}><strong>{t("finishedLadderNote")}</strong></Card>}

      <Card style={{ padding: sp(3), fontSize: ui.text.xs }}>
        <strong>{t("meetingReminder")}</strong>
      </Card>

      {ward.wards.length === 0 ? (
        <Muted>{t("wardNone")}</Muted>
      ) : ward.wards.map((w, i) => {
        const done = doneToday > i;
        const missed = ward.wards.length > 1 && i === 0; // الفائت يُعرض أوّلاً (تعويض)
        return (
          <Card key={i} style={{ padding: sp(3) }}>
            <div style={{ display: "flex", alignItems: "center", gap: sp(2) }}>
              {missed && <Badge tone="danger">{t("wardMissed")}</Badge>}
              <span style={{ fontWeight: 700 }}>{t("wardJuzRange")} {arNum(w.fromJuz)}{w.toJuz !== w.fromJuz ? `–${arNum(w.toJuz)}` : ""}</span>
            </div>
            <div style={{ color: ui.color.muted, fontSize: ui.text.xs, margin: `${sp(1)} 0 ${sp(2)}` }}>{formatAyah(w.fromSurah, w.fromAyah, w.toSurah, w.toAyah)}</div>
            <Button size="sm" variant={done ? "ghost" : "primary"} disabled={done} onClick={onComplete}>{done ? t("wardDone") : t("completeWard")}</Button>
          </Card>
        );
      })}
    </main>
  );
}

function BigCount({ value, total, onTap, large }: { value: number; total: number; onTap: () => void; large?: boolean }) {
  const size = large ? 96 : 64;
  return (
    <button type="button" onClick={onTap} aria-label="تكرار"
      style={{ width: size, height: size, borderRadius: 999, border: `2px solid ${ui.color.primary}`, background: value >= total ? ui.color.primary : ui.color.surface, color: value >= total ? "#fff" : ui.color.text, fontFamily: ui.font, fontWeight: 700, fontSize: large ? ui.text.lg : ui.text.base, cursor: "pointer" }}>
      {arNum(value)} / {arNum(total)}
    </button>
  );
}
