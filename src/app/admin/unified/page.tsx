"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useMe } from "@/lib/useMe";
import { makkahDayDate } from "@/lib/makkah-day";
import { arNum } from "@/lib/format";
import { AppShell, Badge, Button, EmptyState, Skeleton, sp, ui } from "@/components/ui";
import { tSetup } from "@/i18n/ar/setup";
import { tUnified as tu } from "@/i18n/ar/unified";
import { navAr } from "@/i18n/ar/nav";

import { token, type Circle, type DayLock, type GrantItem, type PanelDetail, type PostFn, type Student } from "./_types";
import { DayLockBar } from "./_DayLockBar";
import { AutoAssignMissingBtn } from "./_AutoAssignMissingBtn";

// تحميلٌ كسول — لا تُجلب حتى تُفتح أوّل بطاقة / يُفعَّل عرض البطاقات.
const StudentPanel = dynamic(
  () => import("./_StudentPanel").then((m) => ({ default: m.StudentPanel })),
  { loading: () => <Skeleton height={200} /> },
);
const CardsView = dynamic(
  () => import("./_CardsView").then((m) => ({ default: m.CardsView })),
  { loading: () => <Skeleton height={300} /> },
);

const PROGRAM_AR: Record<string, string> = {
  QAIDAH_MADANIYYAH: navAr.civilBase, MARAQI: navAr.maraqi, MUDDAKIR: navAr.grpMuddakir, WEEKLY: navAr.weekly,
};
function programCounts(students: { program: string | null }[]): string {
  const by = new Map<string, number>();
  for (const s of students) { const k = s.program ?? ""; if (k) by.set(k, (by.get(k) ?? 0) + 1); }
  return [...by.entries()].map(([k, n]) => `${PROGRAM_AR[k] ?? k} ${arNum(n)}`).join(" · ");
}

const ATT_LABEL: Record<string, string> = {
  PRESENT: "حاضر", LATE: "متأخّر", ABSENT_UNEXCUSED: "غائب", LEFT_NO_PERMISSION: "خرج بلا إذن",
  ABSENT_EXCUSED: "غائب بعذر", PRE_EXCUSED: "مستأذن", LEFT_EARLY: "خرج مبكّرًا",
};
const todayISO = () => makkahDayDate(new Date());
const CRUMBS = [{ label: "الرئيسة", href: "/" }, { label: "التشغيل" }, { label: "الشاشة الموحّدة" }];

export default function UnifiedPage() {
  const { me } = useMe();
  const router = useRouter();
  const date = todayISO();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState("");
  const [students, setStudents] = useState<Student[] | null>(null);
  const [absentDefault, setAbsentDefault] = useState(false);
  const [dayLock, setDayLock] = useState<DayLock | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [setupFilter, setSetupFilter] = useState<"ALL" | "NEEDS_SETUP" | "MISSING_DATA">("ALL");
  const [items, setItems] = useState<GrantItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setViewState] = useState<"list" | "cards">("list");
  const [isNarrow, setIsNarrow] = useState(false);
  // cache تفاصيل البطاقة: تُجلب per-student عند الفتح + تُبطَل بعد post لذلك الطالب.
  const [panelCache, setPanelCache] = useState<ReadonlyMap<string, PanelDetail>>(new Map());
  const [panelLoading, setPanelLoading] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setViewState(params.get("view") === "cards" ? "cards" : "list");
    const sid = params.get("student");
    if (sid) setSelected(sid);
    const mq = window.matchMedia("(max-width: 899px)");
    setIsNarrow(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!isNarrow || !selected) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-student-id="${selected}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [isNarrow, selected]);

  const selectStudent = useCallback((id: string | null) => {
    setSelected(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("student", id);
    else url.searchParams.delete("student");
    router.push(url.pathname + url.search, { scroll: false });
  }, [router]);

  const switchView = (v: "list" | "cards") => {
    setViewState(v);
    router.push(v === "cards" ? "/admin/unified?view=cards" : "/admin/unified", { scroll: false });
  };

  const load = useCallback(async (cid: string) => {
    const t = await token(); if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/circles/${cid}/unified?date=${date}`, { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
    if (!res.ok) { setStatus("error"); return; }
    const b = (await res.json()) as { students: Student[]; absentDefault?: boolean; dayLock?: DayLock };
    setStudents(b.students); setAbsentDefault(Boolean(b.absentDefault)); setDayLock(b.dayLock ?? null);
    setStatus("ready");
  }, [date]);

  // تحميل تفاصيل بطاقة طالب — per-student عند الفتح، مُخزَّنةٌ حتى تتغيّر.
  const loadDetail = useCallback(async (studentId: string, program: string | null) => {
    if (panelCache.has(studentId) || panelLoading.has(studentId)) return;
    setPanelLoading((p) => new Set([...p, studentId]));
    const t = await token();
    if (!t) { setPanelLoading((p) => { const n = new Set(p); n.delete(studentId); return n; }); return; }
    const res = await fetch(
      `/api/students/${studentId}/unified-panel?date=${date}&program=${program ?? ""}`,
      { headers: { authorization: `Bearer ${t}` } },
    );
    if (res.ok) {
      const detail = (await res.json()) as PanelDetail;
      setPanelCache((p) => new Map([...p, [studentId, detail]]));
    }
    setPanelLoading((p) => { const n = new Set(p); n.delete(studentId); return n; });
  }, [date, panelCache, panelLoading]);

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

  // عند اختيار طالب: حمّل تفاصيله إن لم تكن في الـcache.
  useEffect(() => {
    if (!selected || !students) return;
    const s = students.find((x) => x.studentId === selected);
    if (!s || panelCache.has(selected)) return;
    void loadDetail(selected, s.program);
  }, [selected, students, panelCache, loadDetail]);

  const post: PostFn = useCallback(async (url, body, okMsg, studentId?) => {
    setMsg(null);
    const t = await token(); if (!t) { setStatus("unauth"); return; }
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify(body) });
    if (res.ok) {
      setMsg(okMsg);
      await load(circleId);
      // أبطِل cache البطاقة لهذا الطالب ليُعاد تحميله بالبيانات الجديدة.
      if (studentId) setPanelCache((p) => { const n = new Map(p); n.delete(studentId); return n; });
    } else {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setMsg(j.error ?? "تعذّر التسجيل.");
    }
  }, [circleId, load]) as PostFn;

  async function markAllPresent() {
    if (!students) return;
    const tok = await token(); if (!tok) return;
    const unmark = students.filter((s) => s.attendanceStatus == null);
    if (!unmark.length) return;
    await Promise.all(unmark.map((s) =>
      fetch(`/api/circles/${circleId}/mark-attendance`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
        body: JSON.stringify({ studentId: s.studentId, status: "PRESENT", date }),
      }),
    ));
    setMsg(tu("markAllPresent") + " — سُجِّل.");
    await load(circleId);
  }

  const filtered = (students ?? []).filter((s) => {
    if (setupFilter === "NEEDS_SETUP") return s.setupStatus != null && !s.setupStatus.isComplete;
    if (setupFilter === "MISSING_DATA") return (s.setupStatus?.warnings.length ?? 0) > 0;
    return true;
  });
  const cur = students?.find((s) => s.studentId === selected) ?? null;

  const nextStudent = useCallback(() => {
    if (!selected || !filtered.length) return;
    const idx = filtered.findIndex((s) => s.studentId === selected);
    if (idx >= 0 && idx < filtered.length - 1) selectStudent(filtered[idx + 1].studentId);
  }, [selected, filtered, selectStudent]);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/unified" title="الشاشة الموحّدة" crumbs={CRUMBS}>{children}</AppShell>
  );

  if (status === "unauth") return <Shell><p>{tu("needLoginTeacherAdmin")}</p></Shell>;
  if (status === "loading") return <Shell><Skeleton height={80} /></Shell>;
  if (status === "error") return <Shell><p style={{ color: ui.color.danger }}>{tu("loadFailed")}<Button variant="ghost" size="sm" onClick={() => void load(circleId)}>{tu("retry")}</Button></p></Shell>;
  if (circles.length === 0) return <Shell><EmptyState title="لا حلقات تَرصدها" /></Shell>;

  return (
    <Shell>
      {circles.length > 1 && (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(3) }}>
          {circles.map((c) => <Button key={c.id} size="sm" variant={c.id === circleId ? "bronze" : "ghost"} onClick={() => { setCircleId(c.id); selectStudent(null); }}>{c.nameAr}</Button>)}
        </div>
      )}
      {dayLock && <DayLockBar lock={dayLock} circleId={circleId} date={date} post={post} />}
      {absentDefault && <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(2) }}>{tu("absentDefaultNote")}</p>}
      {students && students.length > 0 && programCounts(students) && (
        <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(2) }}>{programCounts(students)}</p>
      )}
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs, marginBottom: sp(2) }}>{msg}</p>}

      <AutoAssignMissingBtn students={students} circleId={circleId} onDone={() => void load(circleId)} />

      <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(3) }}>
        <Button size="sm" variant={view === "list" ? "primary" : "ghost"} onClick={() => switchView("list")}>{tu("viewList")}</Button>
        <Button size="sm" variant={view === "cards" ? "primary" : "ghost"} onClick={() => switchView("cards")}>{tu("viewCards")}</Button>
        {circleId && (
          <Button size="sm" variant="ghost" onClick={() => { window.location.href = `/admin/circles/${circleId}/weakness`; }}>{tu("weaknessMapBtn")}</Button>
        )}
      </div>

      {students && students.length > 0 && (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(2) }}>
          {(["ALL", "NEEDS_SETUP", "MISSING_DATA"] as const).map((f) => (
            <Button key={f} size="sm" variant={setupFilter === f ? "primary" : "ghost"} onClick={() => setSetupFilter(f)}>
              {f === "ALL" ? "الكل" : f === "NEEDS_SETUP" ? "إعداد ناقص" : "بيانات ناقصة"}
            </Button>
          ))}
        </div>
      )}

      {view === "list" && (
        isNarrow
          ? (
            <div style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
              {students && students.some((s) => s.attendanceStatus == null) && (
                <div style={{ marginBottom: sp(2) }}>
                  <Button size="sm" variant="primary" onClick={() => void markAllPresent()}>{tu("markAllPresent")}</Button>
                </div>
              )}
              {filtered.map((s) => {
                const done = s.attendanceStatus != null;
                const isOpen = s.studentId === selected;
                return (
                  <div key={s.studentId} data-student-id={s.studentId} data-testid="student-row">
                    <button
                      onClick={() => {
                        const next = isOpen ? null : s.studentId;
                        selectStudent(next);
                        if (next && !panelCache.has(next)) void loadDetail(next, s.program);
                      }}
                      style={{
                        width: "100%", textAlign: "start",
                        border: `1px solid ${isOpen ? ui.color.goldLine : ui.color.border}`,
                        background: isOpen ? ui.color.soft : ui.color.surface,
                        borderRadius: isOpen ? `${ui.radius.md} ${ui.radius.md} 0 0` : ui.radius.md,
                        padding: `${sp(2)} ${sp(3)}`, cursor: "pointer", fontFamily: ui.font, color: ui.color.text,
                        display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(2),
                      }}
                    >
                      <span style={{ display: "flex", gap: 4, alignItems: "center", minWidth: 0, flex: "1 1 auto", flexWrap: "wrap" }}>
                        <strong style={{ fontSize: ui.text.base, wordBreak: "break-word" }}>{s.name}</strong>
                        {s.program && <Badge tone="neutral">{PROGRAM_AR[s.program] ?? s.program}</Badge>}
                        {s.setupStatus && !s.setupStatus.isComplete && <Badge tone="danger">{tSetup("badgeNeedsSetup")}</Badge>}
                        {s.setupStatus && s.setupStatus.isComplete && s.setupStatus.warnings.length > 0 && <Badge tone="bronze">{tSetup("badgeMissingData")}</Badge>}
                      </span>
                      <span style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                        {done
                          ? <Badge tone="success" style={{ whiteSpace: "nowrap" }}>{ATT_LABEL[s.attendanceStatus!] ?? s.attendanceStatus}</Badge>
                          : absentDefault
                            ? <Badge tone="danger" style={{ whiteSpace: "nowrap" }}>{tu("notRaised")}</Badge>
                            : <Badge tone="neutral" style={{ whiteSpace: "nowrap" }}>{tu("notRaised")}</Badge>}
                        {s.todayHifzDone && <Badge tone="bronze" style={{ whiteSpace: "nowrap" }}>{tu("hifzDone")}</Badge>}
                      </span>
                    </button>
                    {isOpen && (
                      <div
                        data-testid="student-inline-card"
                        style={{
                          border: `1px solid ${ui.color.goldLine}`, borderTop: "none",
                          borderRadius: `0 0 ${ui.radius.md} ${ui.radius.md}`,
                          background: ui.color.bg, padding: sp(3),
                        }}
                      >
                        <StudentPanel
                          s={s} circleId={circleId} date={date} items={items} post={post}
                          detail={panelCache.get(s.studentId) ?? null}
                          detailLoading={panelLoading.has(s.studentId)}
                          onNextStudent={nextStudent}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && <EmptyState title={setupFilter === "ALL" ? "لا طلاب في الحلقة" : "لا طلاب ضمن هذا الفلتر"} />}
            </div>
          )
          : (
            <div style={{ display: "flex", gap: sp(4), alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 260px", minWidth: 240, maxWidth: 360, display: "flex", flexDirection: "column", gap: sp(2) }}>
                {students && students.some((s) => s.attendanceStatus == null) && (
                  <Button size="sm" variant="primary" onClick={() => void markAllPresent()}>{tu("markAllPresent")}</Button>
                )}
                {filtered.map((s) => {
                  const done = s.attendanceStatus != null;
                  return (
                    <button
                      key={s.studentId}
                      data-testid="student-row"
                      onClick={() => {
                        selectStudent(s.studentId);
                        if (!panelCache.has(s.studentId)) void loadDetail(s.studentId, s.program);
                      }}
                      style={{
                        textAlign: "start",
                        border: `1px solid ${s.studentId === selected ? ui.color.goldLine : ui.color.border}`,
                        background: s.studentId === selected ? ui.color.soft : ui.color.surface,
                        borderRadius: ui.radius.md, padding: `${sp(2)} ${sp(3)}`, cursor: "pointer",
                        fontFamily: ui.font, color: ui.color.text,
                        display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(2),
                      }}
                    >
                      <span style={{ display: "flex", gap: 4, alignItems: "center", minWidth: 0, flex: "1 1 auto", flexWrap: "wrap" }}>
                        <strong style={{ fontSize: ui.text.base, wordBreak: "break-word" }}>{s.name}</strong>
                        {s.program && <Badge tone="neutral">{PROGRAM_AR[s.program] ?? s.program}</Badge>}
                        {s.setupStatus && !s.setupStatus.isComplete && <Badge tone="danger">{tSetup("badgeNeedsSetup")}</Badge>}
                        {s.setupStatus && s.setupStatus.isComplete && s.setupStatus.warnings.length > 0 && <Badge tone="bronze">{tSetup("badgeMissingData")}</Badge>}
                      </span>
                      <span style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                        {done
                          ? <Badge tone="success" style={{ whiteSpace: "nowrap" }}>{ATT_LABEL[s.attendanceStatus!] ?? s.attendanceStatus}</Badge>
                          : absentDefault
                            ? <Badge tone="danger" style={{ whiteSpace: "nowrap" }}>{tu("notRaised")}</Badge>
                            : <Badge tone="neutral" style={{ whiteSpace: "nowrap" }}>{tu("notRaised")}</Badge>}
                        {s.todayHifzDone && <Badge tone="bronze" style={{ whiteSpace: "nowrap" }}>{tu("hifzDone")}</Badge>}
                      </span>
                    </button>
                  );
                })}
                {filtered.length === 0 && <EmptyState title={setupFilter === "ALL" ? "لا طلاب في الحلقة" : "لا طلاب ضمن هذا الفلتر"} />}
              </div>

              <div style={{ flex: "2 1 420px", minWidth: 300, position: "sticky", top: 80, alignSelf: "flex-start", maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
                {!cur
                  ? <div style={{ padding: sp(4), color: ui.color.muted }}>{tu("pickStudent")}</div>
                  : (
                    <StudentPanel
                      s={cur} circleId={circleId} date={date} items={items} post={post}
                      detail={panelCache.get(cur.studentId) ?? null}
                      detailLoading={panelLoading.has(cur.studentId)}
                      onNextStudent={nextStudent}
                    />
                  )}
              </div>
            </div>
          )
      )}

      {view === "cards" && (
        <CardsView
          students={filtered} absentDefault={absentDefault} circleId={circleId} date={date} items={items} post={post}
          panelCache={panelCache} panelLoading={panelLoading} onOpenStudent={loadDetail}
        />
      )}
    </Shell>
  );
}
