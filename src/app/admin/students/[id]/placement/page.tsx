"use client";

import { use, useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Input, Select, Field, Badge, Table, ui, sp, type Column } from "@/components/ui";
import { hijri, arNum, formatAyah } from "@/lib/format";
import { SURAH_NAMES, surahName } from "@/lib/surah-names";
import { MARAQI_SURAH_ORDER } from "@/lib/maraqi-order";
import { JUZ_BOUNDS } from "@/lib/juz-bounds";
import { gridToPlacement, currentJuzSurahs, type GridInput } from "@/lib/maraqi-grid";
import { tStudents as t } from "@/i18n/ar/students";

interface Range { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }
interface HistoryRow { program: string; enteredAt: string; exitedAt: string | null; reason: string; actor: string | null }
interface View {
  studentName: string;
  programKey: "QAIDAH_MADANIYYAH" | "MARAQI" | "WEEKLY" | null;
  pending: { programKey: string; from: string } | null;
  programs: { id: string; key: string; nameAr: string }[];
  qaidah: { currentLessonId: string | null; lessons: { id: string; nameAr: string; chapterName: string | null }[] } | null;
  maraqi: { reachedSurah: number | null; reachedAyah: number | null; outOfOrder: Range[] } | null;
  history: HistoryRow[];
}
const REASON_AR: Record<string, string> = { ASSIGNMENT: t("reasonAssignment"), READING_TEST: t("reasonReadingTest"), GRADUATION: t("reasonGraduation"), CHANGE: t("reasonChange") };

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}
const PROG_AR: Record<string, string> = { QAIDAH_MADANIYYAH: t("progQaidah"), MARAQI: t("progMaraqi"), WEEKLY: t("progWeekly") };

export default function StudentPlacementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useMe();
  const [v, setV] = useState<View | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const tok = await token(); if (!tok) { window.location.href = "/login"; return; }
    const res = await fetch(`/api/students/${id}/placement`, { headers: { authorization: `Bearer ${tok}` } });
    if (res.status === 403) { setErr(t("placementNoPermission")); return; }
    if (!res.ok) { setErr(t("fetchPlacementFailed")); return; }
    setV((await res.json()) as View); setErr(null);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>, ok: string) {
    setMsg(null); setErr(null);
    const tok = await token(); if (!tok) return;
    const res = await fetch(`/api/students/${id}/placement`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` }, body: JSON.stringify(body),
    });
    if (res.ok) { setMsg(ok); await load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? t("executeFailed")); }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/students"
      title={`${t("placementTitlePrefix")}${v?.studentName ?? ""}`}
      crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbStudents"), href: "/admin/students" }, { label: t("crumbPlacement") }]}>{children}</AppShell>
  );

  if (err && !v) return <Shell><p style={{ color: ui.color.danger }}>{err}</p></Shell>;
  if (!v) return <Shell><p style={{ color: ui.color.muted }}>{t("loading")}</p></Shell>;

  return (
    <Shell>
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {err && <p style={{ color: ui.color.danger, fontSize: ui.text.xs }}>{err}</p>}

      {/* البرنامج الحاليّ + المعلّق + تغييره */}
      <ChangeProgram v={v} onSave={(programId) => post({ action: "change-program", programId }, t("programChanged"))} />

      {/* التسكين بحسب البرنامج */}
      {v.programKey === "QAIDAH_MADANIYYAH" && v.qaidah && (
        <QaidahPlacement q={v.qaidah} onSave={(currentLessonId) => post({ action: "place-qaidah", currentLessonId }, t("placedOnQaidah"))} />
      )}
      {v.programKey === "MARAQI" && v.maraqi && (
        <MaraqiPlacement m={v.maraqi} onSave={(p) => post({ action: "place-maraqi", ...p }, t("placedOnMaraqi"))} />
      )}

      {/* ق٦: تاريخ البرامج — قراءةٌ فقط */}
      <ProgramHistory rows={v.history} />
    </Shell>
  );
}

function ProgramHistory({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) return null;
  const cols: Column<HistoryRow>[] = [
    { key: "program", header: t("colProgram"), cell: (r) => <strong>{r.program}</strong> },
    { key: "in", header: t("colIn"), cell: (r) => hijri(r.enteredAt) },
    { key: "out", header: t("colOut"), cell: (r) => (r.exitedAt ? hijri(r.exitedAt) : t("stillActive")) },
    { key: "reason", header: t("colReason"), cell: (r) => REASON_AR[r.reason] ?? r.reason },
    { key: "actor", header: t("colActor"), cell: (r) => r.actor ?? t("systemActor") },
  ];
  return (
    <div style={{ marginTop: sp(5) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700 }}>{t("programHistoryTitle")}</h2>
      <Table columns={cols} rows={rows} />
    </div>
  );
}

function ChangeProgram({ v, onSave }: { v: View; onSave: (programId: string) => void }) {
  const current = v.programs.find((p) => p.key === v.programKey);
  const [sel, setSel] = useState(current?.id ?? "");
  useEffect(() => { setSel(current?.id ?? ""); }, [current?.id]);
  return (
    <Card style={{ marginBottom: sp(4) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginTop: 0 }}>{t("programTitle")}</h2>
      <div style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap" }}>
        <Badge tone="primary">{v.programKey ? PROG_AR[v.programKey] : t("noProgram")}</Badge>
        {v.pending && <Badge tone="bronze">{t("movesToPrefix")}{PROG_AR[v.pending.programKey]}{t("movesToIn")}{v.pending.from}</Badge>}
      </div>
      <div style={{ display: "flex", gap: sp(2), marginTop: sp(3), flexWrap: "wrap" }}>
        <Select value={sel} onChange={(e) => setSel(e.target.value)} style={{ minWidth: 180 }}>
          {v.programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
        </Select>
        <Button variant="bronze" size="sm" disabled={!sel || sel === current?.id} onClick={() => onSave(sel)}>{t("changeProgram")}</Button>
      </div>
      {v.pending && <p style={{ fontSize: ui.text.xs, color: ui.color.muted, marginBottom: 0 }}>{t("changeCancelsPending")}</p>}
    </Card>
  );
}

function QaidahPlacement({ q, onSave }: { q: NonNullable<View["qaidah"]>; onSave: (lessonId: string) => void }) {
  const [sel, setSel] = useState(q.currentLessonId ?? q.lessons[0]?.id ?? "");
  const idx = q.lessons.findIndex((l) => l.id === sel);
  return (
    <Card>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginTop: 0 }}>{t("qaidahPlacementTitle")}</h2>
      <Field label={t("currentLessonLabel")}>
        <Select value={sel} onChange={(e) => setSel(e.target.value)}>
          {q.lessons.map((l) => <option key={l.id} value={l.id}>{l.chapterName ? `${l.chapterName} — ` : ""}{l.nameAr}</option>)}
        </Select>
      </Field>
      <p style={{ fontSize: ui.text.xs, color: ui.color.muted }}>
        {t("lessonsBeforePrefix")}<strong>{idx < 0 ? 0 : idx}</strong>{t("lessonsBeforeSuffix")}
      </p>
      <Button onClick={() => sel && onSave(sel)} disabled={!sel}>{t("savePlacement")}</Button>
    </Card>
  );
}

// تسكين مراقي بالقرار (أ): شبكة الأجزاء الثلاثين للمحفوظ كاملاً + منتقي موضع الوصول
// بأسماء السور + تأشير سورٍ مفردة بأسمائها (قابلة للبحث) + نطاقاتٌ دقيقة (متقدّم) + معاينةٌ
// بالأسماء. تُترجَم كلّها عبر gridToPlacement إلى MaraqiPlacement القائم بلا تغييرٍ في الخادم.
function MaraqiPlacement({ m, onSave }: { m: NonNullable<View["maraqi"]>; onSave: (p: { reachedSurah: number | null; reachedAyah: number | null; outOfOrder: Range[] }) => void }) {
  const [juz, setJuz] = useState<Set<number>>(new Set());
  const [rs, setRs] = useState(m.reachedSurah?.toString() ?? "");
  const [ra, setRa] = useState(m.reachedAyah?.toString() ?? "");
  const [singles, setSingles] = useState<Set<number>>(new Set());
  const [ranges, setRanges] = useState<Range[]>(m.outOfOrder);
  const [q, setQ] = useState("");
  const [adv, setAdv] = useState(false);
  const [nr, setNr] = useState({ fromSurah: "", fromAyah: "", toSurah: "", toAyah: "" });

  const toggle = (set: Set<number>, n: number, upd: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(n)) next.delete(n); else next.add(n);
    upd(next);
  };
  const addRange = () => {
    const r = { fromSurah: +nr.fromSurah, fromAyah: +nr.fromAyah, toSurah: +nr.toSurah, toAyah: +nr.toAyah };
    if ([r.fromSurah, r.fromAyah, r.toSurah, r.toAyah].every((n) => Number.isFinite(n) && n > 0)) {
      setRanges([...ranges, r]); setNr({ fromSurah: "", fromAyah: "", toSurah: "", toAyah: "" });
    }
  };

  const input: GridInput = {
    fullyMemorizedJuz: [...juz],
    reachedSurah: rs ? +rs : null,
    reachedAyah: ra ? +ra : null,
    singleSurahs: [...singles],
    preciseRanges: ranges,
  };
  const preview = gridToPlacement(input);

  const filtered = SURAH_NAMES.map((name, s) => ({ s, name })).slice(1).filter(({ name }) => !q || name.includes(q.trim()));
  const num: React.CSSProperties = { width: 64 };

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: sp(4) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, margin: 0 }}>{t("maraqiPlacementTitle")}</h2>

      {/* ١) شبكة الأجزاء الثلاثين — محفوظٌ كاملاً */}
      <div>
        <div style={{ fontSize: ui.text.base, fontWeight: 600, marginBottom: sp(2) }}>{t("fullyMemorizedJuz")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: sp(2) }}>
          {JUZ_BOUNDS.map((b) => {
            const on = juz.has(b.juz);
            return (
              <button key={b.juz} type="button" onClick={() => toggle(juz, b.juz, setJuz)}
                title={formatAyah(b.startSurah, b.startAyah, b.endSurah, b.endAyah)}
                style={{
                  padding: `${sp(2)} ${sp(1)}`, borderRadius: ui.radius.md, cursor: "pointer",
                  border: `1px solid ${on ? ui.color.primary : ui.color.border}`,
                  background: on ? ui.color.primary : ui.color.surface, color: on ? "#fff" : ui.color.text,
                  fontSize: ui.text.xs, fontWeight: 600, textAlign: "center",
                }}>
                {t("juzWord")} {arNum(b.juz)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ٢) موضع الوصول في الجزء الجاري — منتقي السور بالأسماء ثمّ رقم الآية */}
      <Field label={t("reachedPointLabel")}>
        <div style={{ fontSize: ui.text.xs, color: ui.color.muted, marginBottom: sp(2) }}>
          {t("reachedPointNote")}
        </div>
        <div style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap" }}>
          <Select value={rs} onChange={(e) => setRs(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">{t("chooseSurah")}</option>
            {MARAQI_SURAH_ORDER.map((s) => <option key={s} value={s}>{surahName(s)}</option>)}
          </Select>
          <Input style={num} type="number" placeholder={t("ayahPlaceholder")} value={ra} onChange={(e) => setRa(e.target.value)} />
          {rs && <Button variant="ghost" size="sm" onClick={() => { setRs(""); setRa(""); }}>{t("clear")}</Button>}
        </div>
      </Field>

      {/* ٣) سورٌ مفردة محفوظةٌ خارج الترتيب — بأسمائها، قائمةٌ قابلةٌ للبحث */}
      <div>
        <div style={{ fontSize: ui.text.base, fontWeight: 600, marginBottom: sp(2) }}>{t("singleSurahsTitle")}</div>
        <Input placeholder={t("surahSearchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: sp(2) }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: sp(2), maxHeight: 168, overflowY: "auto", padding: sp(1) }}>
          {filtered.map(({ s, name }) => {
            const on = singles.has(s);
            return (
              <button key={s} type="button" onClick={() => toggle(singles, s, setSingles)}
                style={{
                  padding: `2px ${sp(2)}`, borderRadius: ui.radius.full, cursor: "pointer",
                  border: `1px solid ${on ? ui.color.primary : ui.color.goldLine}`,
                  background: on ? ui.color.primary : ui.color.surface, color: on ? "#fff" : ui.color.text, fontSize: ui.text.xs,
                }}>
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ٤) نطاقاتٌ دقيقة — خيارٌ متقدّم */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => setAdv((a) => !a)}>{adv ? "▾" : "▸"} {t("preciseRangesToggle")}</Button>
        {adv && (
          <div style={{ marginTop: sp(2) }}>
            {ranges.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: sp(2), alignItems: "center", fontSize: ui.text.xs, marginBottom: 4 }}>
                <span>{formatAyah(r.fromSurah, r.fromAyah, r.toSurah, r.toAyah)}</span>
                <Button variant="ghost" size="sm" onClick={() => setRanges(ranges.filter((_, j) => j !== i))}>{t("delete")}</Button>
              </div>
            ))}
            <div style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap", marginTop: sp(1) }}>
              <span style={{ fontSize: ui.text.xs }}>{t("rangeFrom")}</span>
              <Input style={num} type="number" placeholder={t("surahPlaceholder")} value={nr.fromSurah} onChange={(e) => setNr({ ...nr, fromSurah: e.target.value })} />:
              <Input style={num} type="number" placeholder={t("ayahPlaceholder")} value={nr.fromAyah} onChange={(e) => setNr({ ...nr, fromAyah: e.target.value })} />
              <span style={{ fontSize: ui.text.xs }}>{t("rangeTo")}</span>
              <Input style={num} type="number" placeholder={t("surahPlaceholder")} value={nr.toSurah} onChange={(e) => setNr({ ...nr, toSurah: e.target.value })} />:
              <Input style={num} type="number" placeholder={t("ayahPlaceholder")} value={nr.toAyah} onChange={(e) => setNr({ ...nr, toAyah: e.target.value })} />
              <Button variant="ghost" size="sm" onClick={addRange}>{t("addRange")}</Button>
            </div>
          </div>
        )}
      </div>

      {/* معاينةٌ فوريّة بالأسماء */}
      <div style={{ background: ui.color.soft, borderRadius: ui.radius.md, padding: sp(3), fontSize: ui.text.xs, display: "flex", flexDirection: "column", gap: sp(1) }}>
        <div>{t("previewReachedLabel")}<strong>{preview.reachedSurah ? formatAyah(preview.reachedSurah, preview.reachedAyah ?? 1) : t("previewNone")}</strong></div>
        {preview.reachedSurah != null && currentJuzSurahs(preview.reachedSurah, preview.reachedAyah).length > 0 && (
          <div>{t("previewCurrentJuzLabel")}<span style={{ color: ui.color.text }}>{currentJuzSurahs(preview.reachedSurah, preview.reachedAyah).map((s) => surahName(s)).join(" · ")}</span></div>
        )}
        <div>
          {t("previewOutOfOrderLabel")}{preview.outOfOrder.length === 0 ? <span style={{ color: ui.color.muted }}>{t("previewOutOfOrderNone")}</span>
            : preview.outOfOrder.map((r, i) => <span key={i} style={{ display: "inline-block", padding: "2px 8px", borderRadius: ui.radius.full, border: `1px solid ${ui.color.goldLine}`, margin: "2px" }}>{formatAyah(r.fromSurah, r.fromAyah, r.toSurah, r.toAyah)}</span>)}
        </div>
        <div style={{ color: ui.color.muted }}>{t("previewFootnote")}</div>
      </div>

      <Button onClick={() => onSave(preview)}>{t("savePlacement")}</Button>
    </Card>
  );
}
