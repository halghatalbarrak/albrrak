"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { arNum } from "@/lib/format";
import { ui, sp, Button, Card, Modal, Input, Badge } from "@/components/ui";
import { tMuddakir as t, stageLabel } from "@/i18n/ar/muddakir";

// شاشة المشرف واللقاء الأسبوعيّ (المرحلة ٦، §٦) — للجوّال أوّلاً. المشرف يرى حفّاظه المُسندين
// فقط (المدير الجميع)؛ كل كتابةٍ محميّةٌ في الخادم. النصوص من القاموس، والأرقام مشرقيّة.

interface Indicators {
  studentId: string; name: string; stage: number; track: number;
  shortfallDays: number; makeupPending: number; excusesThisMonth: number;
  excuseLimit: number | null; excuseLimitExceeded: boolean;
  repErrors: number; weakFaces: number; openTreatments: number; trackRequestPending: boolean;
}
interface Detail {
  studentId: string; name: string; track: number; pendingTrack: number | null; effectiveFrom: string | null;
  reviewCycleDays: number; tracks: number[];
  week: { weekStart: string; weekEnd: string; meetingDay: string; confirmed: boolean; heardCount: number };
  facesToHear: { page: number; weak: boolean }[];
  heardThisWeek: number[];
  openTreatments: { page: number; lineNo: number; source: string }[];
  trackRequest: { track: number } | null;
  indicators: Indicators;
}

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const errSource = (s: string) => t(s === "SUPERVISOR" ? "errorSourceSupervisor" : s === "REVIEW" ? "errorSourceReview" : "errorSourceRibat");

export default function MuddakirSupervisorPage() {
  const [list, setList] = useState<Indicators[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauth" | "error">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [errModal, setErrModal] = useState(false);
  const [errPage, setErrPage] = useState(""); const [errLine, setErrLine] = useState("");
  const [cycle, setCycle] = useState("");

  const loadList = useCallback(async () => {
    setDetail(null); setMsg(null);
    try {
      const tok = await token();
      if (!tok) { setStatus("unauth"); return; }
      const res = await fetch("/api/muddakir/supervisor", { headers: { authorization: `Bearer ${tok}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      const data = (await res.json()) as { hafiz: Indicators[] };
      setList(data.hafiz); setStatus("ready");
    } catch { setStatus("error"); }
  }, []);

  const loadDetail = useCallback(async (studentId: string) => {
    setMsg(null);
    try {
      const tok = await token();
      if (!tok) { setStatus("unauth"); return; }
      const res = await fetch(`/api/muddakir/supervisor?studentId=${encodeURIComponent(studentId)}`, { headers: { authorization: `Bearer ${tok}` } });
      if (!res.ok) { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر."); return; }
      const d = (await res.json()) as Detail;
      setDetail(d); setCycle(String(d.reviewCycleDays));
    } catch { setMsg("تعذّر التحميل."); }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  const act = useCallback(async (body: Record<string, unknown>, okMsg: string) => {
    setMsg(null);
    const tok = await token();
    if (!tok) { setStatus("unauth"); return; }
    const res = await fetch("/api/muddakir/supervisor", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify(body),
    });
    if (res.ok) { setMsg(okMsg); if (detail) await loadDetail(detail.studentId); else await loadList(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر."); }
  }, [detail, loadDetail, loadList]);

  if (status === "unauth")
    return <Center><p>{t("supervisorTitle")} — {t("roleSupervisor")}</p><a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a></Center>;
  if (status === "loading") return <Center><p style={{ color: ui.color.muted }}>…جارٍ التحميل</p></Center>;
  if (status === "error") return <Center><p style={{ color: ui.color.danger }}>تعذّر التحميل.</p><Button size="sm" onClick={() => void loadList()}>إعادة</Button></Center>;

  return (
    <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, maxWidth: 520, margin: "0 auto", padding: sp(3), display: "flex", flexDirection: "column", gap: sp(3) }}>
      <h1 style={{ fontSize: ui.text.lg, fontWeight: 800, margin: 0 }}>{t("supervisorTitle")}</h1>
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}

      {!detail ? (
        // ── قائمة الحفّاظ ومؤشّراتهم ──
        (list ?? []).length === 0 ? <p style={{ color: ui.color.muted }}>{t("noHafizYet")}</p>
          : (list ?? []).map((h) => (
            <Card key={h.studentId} style={{ padding: sp(3) }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(2) }}>
                <div>
                  <strong>{h.name}</strong>
                  <span style={{ color: ui.color.muted, fontSize: ui.text.xs, marginRight: sp(2) }}>{stageLabel(h.stage)} · {t("track")} {arNum(h.track)}</span>
                </div>
                <Button size="sm" onClick={() => void loadDetail(h.studentId)}>{t("openHafiz")}</Button>
              </div>
              <div style={{ display: "flex", gap: sp(1), flexWrap: "wrap", marginTop: sp(2), fontSize: ui.text.xs }}>
                <Chip label={t("indShortfall")} value={h.shortfallDays} danger={h.shortfallDays > 0} />
                <Chip label={t("indMakeup")} value={h.makeupPending} />
                <Chip label={t("indExcusesMonth")} value={h.excuseLimit != null ? `${arNum(h.excusesThisMonth)}/${arNum(h.excuseLimit)}` : h.excusesThisMonth} danger={h.excuseLimitExceeded} />
                <Chip label={t("indRepErrors")} value={h.repErrors} />
                <Chip label={t("indWeakFaces")} value={h.weakFaces} danger={h.weakFaces > 0} />
                <Chip label={t("indOpenTreatments")} value={h.openTreatments} danger={h.openTreatments > 0} />
                {h.trackRequestPending && <Badge tone="bronze">{t("trackChangeTitle")}</Badge>}
              </div>
            </Card>
          ))
      ) : (
        // ── تفصيل الحافظ واللقاء الأسبوعيّ ──
        <>
          <Button variant="ghost" size="sm" style={{ alignSelf: "flex-start" }} onClick={() => void loadList()}>← {t("backToList")}</Button>
          <Card style={{ padding: sp(3) }}>
            <strong style={{ fontSize: ui.text.base }}>{detail.name}</strong>
            <div style={{ color: ui.color.muted, fontSize: ui.text.xs, marginTop: sp(1) }}>
              {t("weekOf")} {arNum(detail.week.weekStart)} – {arNum(detail.week.weekEnd)} · {t("track")} {arNum(detail.track)}
              {detail.pendingTrack != null && ` · ${t("trackPendingNote")} ${detail.effectiveFrom ? arNum(detail.effectiveFrom) : ""} (${arNum(detail.pendingTrack)})`}
            </div>
          </Card>

          {/* طلب تغيير المسار من الحافظ */}
          {detail.trackRequest && detail.pendingTrack == null && (
            <Card style={{ padding: sp(3), border: `1px solid ${ui.color.bronze}` }}>
              <div style={{ fontSize: ui.text.xs }}>{t("trackRequestPending")} {arNum(detail.trackRequest.track)} {t("facesPerDay")}</div>
              <Button size="sm" style={{ marginTop: sp(2) }} onClick={() => void act({ action: "approveTrack", studentId: detail.studentId, track: detail.trackRequest!.track }, t("approveTrackBtn"))}>{t("approveTrackBtn")}</Button>
            </Card>
          )}

          {/* أوجه الأسبوع للتسميع (الضعيف أوّلاً) */}
          <Section title={t("facesToHearTitle")}>
            {detail.facesToHear.length === 0 ? <Muted>{t("noFacesToHear")}</Muted> : detail.facesToHear.map((f) => (
              <Row key={f.page} label={<span>{t("face")} {arNum(f.page)} {f.weak && <Badge tone="danger">{t("weakWord")}</Badge>}</span>}>
                <Button size="sm" onClick={() => void act({ action: "markHeard", studentId: detail.studentId, page: f.page }, t("heardBtn"))}>{t("heardBtn")}</Button>
              </Row>
            ))}
            {detail.heardThisWeek.length > 0 && <Muted>{t("heardLabel")}: {detail.heardThisWeek.map(arNum).join("، ")}</Muted>}
          </Section>

          {/* تسجيل موضع خطأ (مصدره المشرف) */}
          <Button variant="ghost" size="sm" style={{ alignSelf: "flex-start" }} onClick={() => setErrModal(true)}>{t("recordErrorPos")}</Button>

          {/* مواضع العلاج المفتوحة */}
          <Section title={t("openTreatmentsTitle")}>
            {detail.openTreatments.length === 0 ? <Muted>—</Muted> : detail.openTreatments.map((o) => (
              <Row key={`${o.page}-${o.lineNo}`} label={<span>{t("pageWord")} {arNum(o.page)} · {t("lineWord")} {arNum(o.lineNo)}</span>}>
                <span style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{errSource(o.source)}</span>
              </Row>
            ))}
          </Section>

          {/* دورة المراجعة */}
          <Card style={{ padding: sp(3), display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: ui.text.xs }}>{t("reviewCycleTitle")}</span>
            <Input inputMode="numeric" value={cycle} onChange={(e) => setCycle(e.target.value)} style={{ width: 80 }} aria-label={t("reviewCycleTitle")} />
            <Button size="sm" disabled={!cycle || Number(cycle) < 1} onClick={() => void act({ action: "setReviewCycle", studentId: detail.studentId, days: Number(cycle) }, t("save"))}>{t("save")}</Button>
          </Card>

          {/* تأكيد انتظام الأسبوع — يُصدِر النقاط المعلّقة دفعةً واحدة */}
          <Card style={{ padding: sp(3) }}>
            <div style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("heardCountLabel")}: {arNum(detail.week.heardCount)}</div>
            {detail.week.confirmed ? (
              <div style={{ display: "flex", gap: sp(2), alignItems: "center", marginTop: sp(2), flexWrap: "wrap" }}>
                <span style={{ color: ui.color.success, fontWeight: 700 }}>{t("weekConfirmed")}</span>
                <Button variant="ghost" size="sm" onClick={() => void act({ action: "reverseWeek", studentId: detail.studentId }, t("reverseWeekBtn"))}>{t("reverseWeekBtn")}</Button>
              </div>
            ) : (
              <Button style={{ marginTop: sp(2) }} onClick={() => void act({ action: "confirmWeek", studentId: detail.studentId }, t("weekConfirmed"))}>{t("confirmWeekBtn")}</Button>
            )}
          </Card>

          {/* نافذة تسجيل موضع خطأ */}
          {errModal && (
            <Modal open onClose={() => setErrModal(false)} title={t("recordErrorPos")}>
              <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
                <Input inputMode="numeric" placeholder={t("pageWord")} value={errPage} onChange={(e) => setErrPage(e.target.value)} />
                <Input inputMode="numeric" placeholder={t("lineWord")} value={errLine} onChange={(e) => setErrLine(e.target.value)} />
                <div style={{ display: "flex", gap: sp(2) }}>
                  <Button size="sm" disabled={!errPage || !errLine} onClick={() => { void act({ action: "recordError", studentId: detail.studentId, page: Number(errPage), lineNo: Number(errLine) }, t("save")); setErrPage(""); setErrLine(""); setErrModal(false); }}>{t("save")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setErrModal(false)}>{t("cancel")}</Button>
                </div>
              </div>
            </Modal>
          )}
        </>
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
function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return <Card style={{ padding: sp(3), marginBottom: sp(2), display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(2) }}><span style={{ fontSize: ui.text.xs, display: "flex", alignItems: "center", gap: sp(1) }}>{label}</span>{children}</Card>;
}
function Muted({ children }: { children: React.ReactNode }) {
  return <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{children}</p>;
}
function Chip({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return (
    <span style={{ padding: `2px ${sp(2)}`, borderRadius: 999, background: danger ? ui.color.danger : ui.color.soft, color: danger ? "#fff" : ui.color.text, whiteSpace: "nowrap" }}>
      {label}: {typeof value === "number" ? arNum(value) : value}
    </span>
  );
}
