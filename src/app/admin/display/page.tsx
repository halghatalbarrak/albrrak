"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Input, Select, Badge, SectionTitle, ui, sp } from "@/components/ui";
import { arNum } from "@/lib/format";
import { tDisplay as t } from "@/i18n/ar/display";

type CopyStatus = "ready" | "legacy" | "keyMissing" | "none";
interface ScreenRow { id: string; kind: "MOSQUE" | "HOME"; nameAr: string; studentId: string | null; active: boolean; hasActiveToken: boolean; copy: CopyStatus }
interface Program { id: string; nameAr: string }
interface Slide { id: string; ordinal: number; kind: "PROGRAM" | "IMAGE"; durationSec: number; programNameAr: string | null; imageUrl: string | null; active: boolean }
type StartMode = "PRAYER" | "FIXED";
type Prayer = "FAJR" | "DHUHR" | "ASR" | "MAGHRIB" | "ISHA";
type Rel = "AFTER" | "BEFORE";
type ContentMode = "PROGRAM" | "SLIDES";
interface ScheduleRow { id: string; ordinal: number; startMode: StartMode; prayer: Prayer | null; rel: Rel | null; offsetMin: number; fixedTime: string | null; durationMin: number; contentMode: ContentMode; programId: string | null; programNameAr: string | null; slideIds: string[]; daysMask: number; active: boolean }
interface Detail extends ScreenRow { slides: Slide[]; schedules: ScheduleRow[]; scheduleWarnings: string[]; schedulePreview: string[]; adjust: Record<Prayer, number> }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function DisplayAdminPage() {
  const { me } = useMe();
  const [screens, setScreens] = useState<ScreenRow[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [linkOnce, setLinkOnce] = useState<string | null>(null);
  // نموذج إنشاء شاشة
  const [kind, setKind] = useState<"MOSQUE" | "HOME">("MOSQUE");
  const [nameAr, setNameAr] = useState("");
  const [sonQuery, setSonQuery] = useState("");
  const [sonResults, setSonResults] = useState<{ id: string; name: string }[]>([]);
  const [sonId, setSonId] = useState<string | null>(null);
  const [addProg, setAddProg] = useState("");

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const tok = await token();
    if (!tok) { setStatus("unauth"); return null; }
    const res = await fetch(path, { ...init, headers: { ...(init?.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), authorization: `Bearer ${tok}`, ...(init?.headers ?? {}) } });
    if (res.status === 401 || res.status === 403) { setStatus("unauth"); return null; }
    return res;
  }, []);

  const load = useCallback(async () => {
    setStatus("loading"); setMsg(null);
    const res = await api("/api/admin/display");
    if (!res) return;
    if (!res.ok) { setStatus("error"); return; }
    const j = (await res.json()) as { screens: ScreenRow[]; programs: Program[] };
    setScreens(j.screens); setPrograms(j.programs); setStatus("ready");
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const openDetail = async (id: string) => {
    setLinkOnce(null);
    const res = await api(`/api/admin/display?screenId=${id}`);
    if (res?.ok) setDetail((await res.json() as { detail: Detail }).detail);
  };

  const act = async (body: Record<string, unknown>, ok = t("saved")) => {
    const res = await api("/api/admin/display", { method: "POST", body: JSON.stringify(body) });
    if (!res) return null;
    if (res.ok) { setMsg(ok); await load(); if (detail) await openDetail(detail.id); return res; }
    setMsg(((await res.json()) as { error?: string }).error ?? "تعذّر."); return null;
  };

  const searchSon = async (q: string) => {
    setSonQuery(q); setSonId(null);
    if (q.trim().length < 2) { setSonResults([]); return; }
    const res = await api(`/api/admin/display?students=${encodeURIComponent(q)}`);
    if (res?.ok) setSonResults((await res.json() as { students: { id: string; name: string }[] }).students);
  };

  const create = async () => {
    if (!nameAr.trim() || (kind === "HOME" && !sonId)) { setMsg("أكمل البيانات."); return; }
    const res = await act({ action: "createScreen", kind, nameAr, studentId: kind === "HOME" ? sonId : null }, t("saved"));
    if (res) { setNameAr(""); setSonId(null); setSonQuery(""); setSonResults([]); }
  };

  const genLink = async (screenId: string) => {
    const res = await api("/api/admin/display", { method: "POST", body: JSON.stringify({ action: "issueToken", screenId }) });
    if (res?.ok) { const { token: tk } = (await res.json()) as { token: string }; setLinkOnce(`${window.location.origin}/display/${tk}`); await load(); }
  };

  // §٩: ينسخ الرابط الكامل للحافظة (يسترجع الرمز من نسخته المشفَّرة). «نُسخ» عند النجاح.
  const copyLink = async (screenId: string) => {
    const res = await api("/api/admin/display", { method: "POST", body: JSON.stringify({ action: "revealLink", screenId }) });
    if (!res?.ok) return;
    const j = (await res.json()) as { ok: boolean; token?: string; reason?: string };
    if (j.ok && j.token) {
      const url = `${window.location.origin}/display/${j.token}`;
      try { await navigator.clipboard.writeText(url); setMsg(t("copied")); }
      catch { setMsg(t("copyFailed")); }
    } else {
      setMsg(j.reason === "keyMissing" ? t("copyKeyMissing") : j.reason === "legacy" ? t("renewForCopy") : t("copyFailed"));
    }
  };

  const uploadFile = async (file: File, extra: Record<string, string>) => {
    const fd = new FormData(); fd.append("file", file); for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const res = await api("/api/admin/display/upload", { method: "POST", body: fd });
    if (res?.ok) { setMsg(t("saved")); await load(); if (detail) await openDetail(detail.id); }
    else if (res) setMsg(((await res.json()) as { error?: string }).error ?? "تعذّر الرفع.");
  };

  if (status === "unauth")
    return <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}><p>تحتاج دخولًا.</p><a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a></main>;

  return (
    <AppShell roles={me?.roles ?? []} muddakirStaff={me?.muddakirStaff ?? []} userName={me?.name} activeHref="/admin/display"
      title={t("adminTitle")} crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: t("adminTitle") }]}>

      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}

      {/* إنشاء شاشة */}
      <SectionTitle>{t("createScreen")}</SectionTitle>
      <Card style={{ padding: sp(3), display: "flex", flexDirection: "column", gap: sp(2) }}>
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" }}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as "MOSQUE" | "HOME")} style={{ width: "auto" }} aria-label={t("createScreen")}>
            <option value="MOSQUE">{t("kindMosque")}</option>
            <option value="HOME">{t("kindHome")}</option>
          </Select>
          <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={t("screenName")} style={{ width: "auto", minWidth: 180 }} aria-label={t("screenName")} />
          <Button size="sm" onClick={() => void create()}>{t("createScreen")}</Button>
        </div>
        {kind === "HOME" && (
          <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" }}>
            <Input value={sonQuery} onChange={(e) => void searchSon(e.target.value)} placeholder={t("searchStudent")} style={{ width: "auto", minWidth: 200 }} aria-label={t("searchStudent")} />
            {sonResults.length > 0 && (
              <Select value={sonId ?? ""} onChange={(e) => setSonId(e.target.value || null)} style={{ width: "auto", minWidth: 200 }} aria-label={t("linkedSon")}>
                <option value="">— {t("linkedSon")} —</option>
                {sonResults.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </div>
        )}
      </Card>

      {/* قائمة الشاشات */}
      <SectionTitle>{t("screens")}</SectionTitle>
      {screens.length === 0 ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{t("noScreens")}</p> : screens.map((s) => (
        <Card key={s.id} style={{ padding: sp(3), marginBottom: sp(2), display: "flex", flexDirection: "column", gap: sp(2) }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp(2), flexWrap: "wrap" }}>
            <strong>{s.nameAr}</strong>
            <Badge tone={s.kind === "MOSQUE" ? "primary" : "bronze"}>{s.kind === "MOSQUE" ? t("kindMosque") : t("kindHome")}</Badge>
            <Badge tone={s.hasActiveToken ? "success" : "neutral"}>{s.hasActiveToken ? t("hasLink") : t("noLink")}</Badge>
            <Button size="sm" variant="ghost" onClick={() => void openDetail(s.id)}>{t("slides")}</Button>
            <Button size="sm" onClick={() => void genLink(s.id)}>{s.hasActiveToken ? t("renewLink") : t("genLink")}</Button>
            {s.copy === "ready" && <Button size="sm" variant="ghost" onClick={() => void copyLink(s.id)}>{t("copyLink")}</Button>}
            {s.copy === "legacy" && <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("renewForCopy")}</span>}
            {s.copy === "keyMissing" && <Button size="sm" variant="ghost" disabled title={t("copyKeyMissing")}>{t("copyLink")}</Button>}
            {s.hasActiveToken && <Button size="sm" variant="ghost" onClick={() => void act({ action: "revokeToken", screenId: s.id })}>{t("revokeLink")}</Button>}
            <label style={{ fontSize: ui.text.xs, color: ui.color.muted, display: "flex", alignItems: "center", gap: 4 }}>
              {s.kind === "MOSQUE" ? t("uploadMosqueBg") : t("uploadHomeBg")}
              <input type="file" accept="image/*,video/mp4" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f, { target: "background", screenKind: s.kind }); }} />
              <span style={{ color: ui.color.primary, cursor: "pointer", fontWeight: 600 }}>⇪</span>
            </label>
          </div>
          {linkOnce && detail?.id === s.id && (
            <div style={{ fontSize: ui.text.xs, background: ui.color.soft, padding: sp(2), borderRadius: ui.radius.md }}>
              <div style={{ color: ui.color.danger, marginBottom: 4 }}>{t("linkShownOnce")}</div>
              <code style={{ wordBreak: "break-all" }}>{linkOnce}</code>
              <Button size="sm" variant="ghost" style={{ marginInlineStart: sp(2) }} onClick={() => void navigator.clipboard?.writeText(linkOnce)}>{t("copy")}</Button>
            </div>
          )}

          {/* تفصيل الشرائح */}
          {detail?.id === s.id && (
            <div style={{ borderTop: `1px solid ${ui.color.border}`, paddingTop: sp(2), display: "flex", flexDirection: "column", gap: sp(2) }}>
              <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" }}>
                <Select value={addProg} onChange={(e) => setAddProg(e.target.value)} style={{ width: "auto" }} aria-label={t("selectProgram")}>
                  <option value="">— {t("selectProgram")} —</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
                </Select>
                <Button size="sm" disabled={!addProg} onClick={() => { void act({ action: "addProgramSlide", screenId: s.id, programId: addProg }); setAddProg(""); }}>{t("addProgramSlide")}</Button>
                <label style={{ fontSize: ui.text.xs, color: ui.color.primary, cursor: "pointer", fontWeight: 600 }}>
                  {t("addImageSlide")}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f, { target: "slide", screenId: s.id }); }} />
                </label>
              </div>
              {detail.slides.map((sl, i) => (
                <div key={sl.id} style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap", fontSize: ui.text.xs }}>
                  <span>{arNum(i + 1)}.</span>
                  <Badge tone="neutral">{sl.kind === "PROGRAM" ? t("programSlide") : t("imageSlide")}</Badge>
                  <span>{sl.programNameAr ?? (sl.imageUrl ? "🖼" : "")}</span>
                  <Input type="number" defaultValue={sl.durationSec} style={{ width: 72 }} onBlur={(e) => { const v = Number(e.target.value); if (v && v !== sl.durationSec) void act({ action: "setSlide", slideId: sl.id, durationSec: v }); }} aria-label={t("durationSec")} />
                  <Badge tone={sl.active ? "success" : "neutral"}>{sl.active ? t("activeLabel") : "—"}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => void act({ action: "setSlide", slideId: sl.id, active: !sl.active })}>{sl.active ? t("disable") : t("enable")}</Button>
                  <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => { const ids = detail.slides.map((x) => x.id); [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; void act({ action: "reorder", screenId: s.id, orderedIds: ids }); }}>{t("moveUp")}</Button>
                  <Button size="sm" variant="ghost" disabled={i === detail.slides.length - 1} onClick={() => { const ids = detail.slides.map((x) => x.id); [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; void act({ action: "reorder", screenId: s.id, orderedIds: ids }); }}>{t("moveDown")}</Button>
                </div>
              ))}
              <Schedules detail={detail} programs={programs} act={act} />
            </div>
          )}
        </Card>
      ))}
    </AppShell>
  );
}

// ───────────── قسم المواعيد لكل شاشة (§١٠) ─────────────
const PRAYER_LABEL = { FAJR: "prayerFajr", DHUHR: "prayerDhuhr", ASR: "prayerAsr", MAGHRIB: "prayerMaghrib", ISHA: "prayerIsha" } as const;
const DAY_LABEL = ["dSun", "dMon", "dTue", "dWed", "dThu", "dFri", "dSat"] as const;
const PRAYER_ORDER: Prayer[] = ["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA"];

// تعديلٌ يدويّ بالدقائق لكل صلاة فوق حساب أمّ القرى (§١٠)، افتراضيّه ٠.
function PrayerAdjustForm({ adjust, screenId, act }: { adjust: Record<Prayer, number>; screenId: string; act: (body: Record<string, unknown>) => Promise<Response | null> }) {
  const [vals, setVals] = useState<Record<Prayer, string>>({ FAJR: String(adjust.FAJR), DHUHR: String(adjust.DHUHR), ASR: String(adjust.ASR), MAGHRIB: String(adjust.MAGHRIB), ISHA: String(adjust.ISHA) });
  const save = () => {
    const out = {} as Record<Prayer, number>;
    for (const p of PRAYER_ORDER) out[p] = Number(vals[p]) || 0;
    void act({ action: "setPrayerAdjust", screenId, adjust: out });
  };
  return (
    <Card style={{ padding: sp(2), display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center", fontSize: ui.text.xs, background: ui.color.soft }}>
      <span style={{ fontWeight: 600 }}>{t("prayerAdjust")}:</span>
      {PRAYER_ORDER.map((p) => (
        <label key={p} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {t(PRAYER_LABEL[p])}
          <Input type="number" value={vals[p]} onChange={(e) => setVals((v) => ({ ...v, [p]: e.target.value }))} style={{ width: 64 }} aria-label={t(PRAYER_LABEL[p])} />
        </label>
      ))}
      <Button size="sm" onClick={save}>{t("savePrayerAdjust")}</Button>
    </Card>
  );
}

function Schedules({ detail, programs, act }: { detail: Detail; programs: Program[]; act: (body: Record<string, unknown>) => Promise<Response | null> }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [startMode, setStartMode] = useState<StartMode>("PRAYER");
  const [prayer, setPrayer] = useState<Prayer>("ASR");
  const [rel, setRel] = useState<Rel>("AFTER");
  const [offsetMin, setOffsetMin] = useState("10");
  const [fixedTime, setFixedTime] = useState("16:00");
  const [durationMin, setDurationMin] = useState("30");
  const [contentMode, setContentMode] = useState<ContentMode>("PROGRAM");
  const [programId, setProgramId] = useState("");
  const [slideSel, setSlideSel] = useState<string[]>([]);
  const [daysMask, setDaysMask] = useState(127);

  const reset = () => { setEditId(null); setStartMode("PRAYER"); setPrayer("ASR"); setRel("AFTER"); setOffsetMin("10"); setFixedTime("16:00"); setDurationMin("30"); setContentMode("PROGRAM"); setProgramId(""); setSlideSel([]); setDaysMask(127); };

  const loadForEdit = (sc: ScheduleRow) => {
    setEditId(sc.id); setStartMode(sc.startMode); if (sc.prayer) setPrayer(sc.prayer); if (sc.rel) setRel(sc.rel);
    setOffsetMin(String(sc.offsetMin)); setFixedTime(sc.fixedTime ?? "16:00"); setDurationMin(String(sc.durationMin));
    setContentMode(sc.contentMode); setProgramId(sc.programId ?? ""); setSlideSel(sc.slideIds); setDaysMask(sc.daysMask);
  };

  const submit = async () => {
    const input: Record<string, unknown> = { startMode, durationMin: Number(durationMin), contentMode, daysMask };
    if (startMode === "PRAYER") { input.prayer = prayer; input.rel = rel; input.offsetMin = Number(offsetMin); }
    else { input.fixedTime = fixedTime; }
    if (contentMode === "PROGRAM") input.programId = programId; else input.slideIds = slideSel;
    const body = editId ? { action: "setSchedule", scheduleId: editId, input } : { action: "addSchedule", screenId: detail.id, input };
    const res = await act(body);
    if (res) reset();
  };

  const toggleSlide = (id: string) => setSlideSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleDay = (bit: number) => setDaysMask((m) => (m & (1 << bit) ? m & ~(1 << bit) : m | (1 << bit)));
  const move = (i: number, dir: -1 | 1) => { const ids = detail.schedules.map((x) => x.id); const j = i + dir; if (j < 0 || j >= ids.length) return; [ids[j], ids[i]] = [ids[i], ids[j]]; void act({ action: "reorderSchedules", screenId: detail.id, orderedIds: ids }); };

  const startLabel = (sc: ScheduleRow) => sc.startMode === "PRAYER" && sc.prayer && sc.rel ? `${t(sc.rel === "AFTER" ? "relAfter" : "relBefore")} ${t(PRAYER_LABEL[sc.prayer])} ${arNum(sc.offsetMin)}د` : (sc.fixedTime ?? "");
  const contentLabel = (sc: ScheduleRow) => sc.contentMode === "PROGRAM" ? (sc.programNameAr ?? t("contentProgram")) : `${t("contentSlides")} (${arNum(sc.slideIds.length)})`;
  const daysLabel = (mask: number) => mask === 127 ? t("allDays") : DAY_LABEL.filter((_, bit) => mask & (1 << bit)).map((k) => t(k)).join("، ");

  return (
    <div style={{ borderTop: `1px solid ${ui.color.border}`, paddingTop: sp(2), marginTop: sp(2), display: "flex", flexDirection: "column", gap: sp(2) }}>
      <SectionTitle>{t("schedules")}</SectionTitle>

      <PrayerAdjustForm key={detail.id} adjust={detail.adjust} screenId={detail.id} act={act} />

      {detail.scheduleWarnings.length > 0 && (
        <div style={{ fontSize: ui.text.xs, color: ui.color.danger }}>
          {detail.scheduleWarnings.map((w, i) => <div key={i}>⚠ {arNum(w)}</div>)}
        </div>
      )}

      {detail.schedulePreview.length > 0 && (
        <div style={{ fontSize: ui.text.xs, color: ui.color.muted, background: ui.color.soft, padding: sp(2), borderRadius: ui.radius.md }}>
          <strong>{t("todayPreview")}:</strong>
          {detail.schedulePreview.map((p, i) => <div key={i}>{arNum(p)}</div>)}
        </div>
      )}

      {detail.schedules.length === 0 ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{t("noSchedules")}</p> : detail.schedules.map((sc, i) => (
        <div key={sc.id} style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap", fontSize: ui.text.xs }}>
          <span>{arNum(i + 1)}.</span>
          <span style={{ fontWeight: 600 }}>{startLabel(sc)} · {arNum(sc.durationMin)}د · {contentLabel(sc)}</span>
          <Badge tone="neutral">{daysLabel(sc.daysMask)}</Badge>
          <Badge tone={sc.active ? "success" : "neutral"}>{sc.active ? t("activeLabel") : "—"}</Badge>
          <Button size="sm" variant="ghost" onClick={() => loadForEdit(sc)}>{t("editSchedule")}</Button>
          <Button size="sm" variant="ghost" onClick={() => void act({ action: "setSchedule", scheduleId: sc.id, input: { active: !sc.active } })}>{sc.active ? t("disable") : t("enable")}</Button>
          <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}>{t("moveUp")}</Button>
          <Button size="sm" variant="ghost" disabled={i === detail.schedules.length - 1} onClick={() => move(i, 1)}>{t("moveDown")}</Button>
        </div>
      ))}

      {/* نموذج إضافة/تعديل موعد */}
      <Card style={{ padding: sp(2), display: "flex", flexDirection: "column", gap: sp(2), background: ui.color.soft }}>
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center", fontSize: ui.text.xs }}>
          <Select value={startMode} onChange={(e) => setStartMode(e.target.value as StartMode)} style={{ width: "auto" }} aria-label={t("startMode")}>
            <option value="PRAYER">{t("startPrayer")}</option>
            <option value="FIXED">{t("startFixed")}</option>
          </Select>
          {startMode === "PRAYER" ? (
            <>
              <Select value={rel} onChange={(e) => setRel(e.target.value as Rel)} style={{ width: "auto" }} aria-label={t("startMode")}>
                <option value="AFTER">{t("relAfter")}</option>
                <option value="BEFORE">{t("relBefore")}</option>
              </Select>
              <Select value={prayer} onChange={(e) => setPrayer(e.target.value as Prayer)} style={{ width: "auto" }} aria-label={t("startPrayer")}>
                {(Object.keys(PRAYER_LABEL) as Prayer[]).map((p) => <option key={p} value={p}>{t(PRAYER_LABEL[p])}</option>)}
              </Select>
              <Input type="number" value={offsetMin} onChange={(e) => setOffsetMin(e.target.value)} style={{ width: 90 }} aria-label={t("offsetMin")} placeholder={t("offsetMin")} />
            </>
          ) : (
            <Input value={fixedTime} onChange={(e) => setFixedTime(e.target.value)} style={{ width: 100 }} aria-label={t("fixedTime")} placeholder="HH:MM" />
          )}
          <Input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} style={{ width: 90 }} aria-label={t("durationMin")} placeholder={t("durationMin")} />
        </div>

        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center", fontSize: ui.text.xs }}>
          <Select value={contentMode} onChange={(e) => setContentMode(e.target.value as ContentMode)} style={{ width: "auto" }} aria-label={t("content")}>
            <option value="PROGRAM">{t("contentProgram")}</option>
            <option value="SLIDES">{t("contentSlides")}</option>
          </Select>
          {contentMode === "PROGRAM" ? (
            <Select value={programId} onChange={(e) => setProgramId(e.target.value)} style={{ width: "auto" }} aria-label={t("contentProgram")}>
              <option value="">— {t("selectProgram")} —</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
            </Select>
          ) : (
            <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap" }}>
              {detail.slides.length === 0 ? <span style={{ color: ui.color.muted }}>{t("noScreens")}</span> : detail.slides.map((sl) => (
                <label key={sl.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={slideSel.includes(sl.id)} onChange={() => toggleSlide(sl.id)} />
                  {sl.programNameAr ?? (sl.imageUrl ? "🖼" : "—")}
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center", fontSize: ui.text.xs }}>
          <span>{t("days")}:</span>
          {DAY_LABEL.map((k, bit) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={!!(daysMask & (1 << bit))} onChange={() => toggleDay(bit)} />
              {t(k)}
            </label>
          ))}
        </div>

        <div style={{ display: "flex", gap: sp(2), alignItems: "center" }}>
          <Button size="sm" onClick={() => void submit()}>{editId ? t("saveSchedule") : t("addSchedule")}</Button>
          {editId && <Button size="sm" variant="ghost" onClick={reset}>{t("cancelEdit")}</Button>}
        </div>
      </Card>
    </div>
  );
}
