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

import { token, type Circle, type DayLock, type GrantItem, type MarkAttFn, type PanelDetail, type PostFn, type Student } from "./_types";
import { DayLockBar } from "./_DayLockBar";
import { AutoAssignMissingBtn } from "./_AutoAssignMissingBtn";
import { AddStudentInline } from "./_AddStudentInline";
import { BulkCorrectDialog } from "./_BulkCorrectDialog";

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

function PageShell({ roles, userName, children }: { roles: string[]; userName?: string; children: React.ReactNode }) {
  return (
    <AppShell roles={roles} userName={userName} activeHref="/admin/unified" title="الشاشة الموحّدة" crumbs={CRUMBS}>{children}</AppShell>
  );
}

function KhatmBadge({ entry }: { entry: { kind: string; ts: number | null } | undefined }) {
  if (!entry) return <Badge tone="neutral" style={{ whiteSpace: "nowrap" }}>{tu("khatmLoading")}</Badge>;
  if (entry.kind === "COMPLETE") return <Badge tone="success" style={{ whiteSpace: "nowrap" }}>{tu("khatmComplete")}</Badge>;
  if (entry.kind === "INSUFFICIENT_DATA") return <Badge tone="neutral" style={{ whiteSpace: "nowrap" }}>{tu("khatmInsufficient")}</Badge>;
  if (entry.kind === "NO_TRACK") return <Badge tone="neutral" style={{ whiteSpace: "nowrap" }}>{tu("khatmNoTrack")}</Badge>;
  if (entry.ts) return <Badge tone="neutral" style={{ whiteSpace: "nowrap" }} data-testid="khatm-badge">{new Date(entry.ts).toLocaleDateString("ar-SA", { year: "numeric", month: "short" })}</Badge>;
  return null;
}

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
  const [msgKind, setMsgKind] = useState<"ok" | "err">("ok");
  const [view, setViewState] = useState<"list" | "cards">("list");
  const [isNarrow, setIsNarrow] = useState(false);
  const [panelCache, setPanelCache] = useState<ReadonlyMap<string, PanelDetail>>(new Map());
  const [panelLoading, setPanelLoading] = useState<ReadonlySet<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkItemId, setBulkItemId] = useState("");
  const [pendingStudents, setPendingStudents] = useState<ReadonlySet<string>>(new Set());
  const [khatmSort, setKhatmSort] = useState(false);
  const [khatmCache, setKhatmCache] = useState<Map<string, { kind: string; ts: number | null }>>(new Map());
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkCorrect, setShowBulkCorrect] = useState(false);

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
      // grant غير حاجز — يُحمَّل في الخلفية بعد ظهور القائمة.
      fetch("/api/economy/grant", { headers: { authorization: `Bearer ${t}` } })
        .then((r) => (r.ok ? (r.json() as Promise<{ items?: GrantItem[] }>) : null))
        .then((j) => { if (j) setItems(j.items ?? []); })
        .catch(() => {});
      const cRes = await fetch("/api/attendance/circles", { headers: { authorization: `Bearer ${t}` } });
      if (cRes.ok) {
        const cs = ((await cRes.json()) as { circles?: Circle[] }).circles ?? [];
        setCircles(cs);
        if (cs.length) {
          const preferred = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("circle") : null;
          setCircleId(cs.find((c) => c.id === preferred)?.id ?? cs[0].id);
        } else {
          setStatus("ready");
        }
      } else setStatus("error");
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

  // تأشير الحضور: تحديثٌ متفائلٌ فوريّ — الزر يتغيّر قبل ردّ الخادم.
  const markAtt = useCallback<MarkAttFn>(async (studentId, status) => {
    if (pendingStudents.has(studentId)) return;
    setPendingStudents((p) => new Set([...p, studentId]));
    let prevStatus: string | null = null;
    setStudents((p) => {
      prevStatus = p?.find((s) => s.studentId === studentId)?.attendanceStatus ?? null;
      return p?.map((s) => s.studentId === studentId ? { ...s, attendanceStatus: status } : s) ?? null;
    });
    const tok = await token();
    if (!tok) {
      setStudents((p) => p?.map((s) => s.studentId === studentId ? { ...s, attendanceStatus: prevStatus } : s) ?? null);
      setStatus("unauth");
      setPendingStudents((p) => { const n = new Set(p); n.delete(studentId); return n; });
      return;
    }
    const res = await fetch(`/api/circles/${circleId}/mark-attendance`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ studentId, status, date }),
    });
    if (!res.ok) {
      setStudents((p) => p?.map((s) => s.studentId === studentId ? { ...s, attendanceStatus: prevStatus } : s) ?? null);
      const j = await res.json().catch(() => ({})) as { error?: string };
      setMsg(j.error ?? "تعذّر التسجيل."); setMsgKind("err");
    } else {
      setMsg("سُجِّل الحضور."); setMsgKind("ok");
    }
    setPendingStudents((p) => { const n = new Set(p); n.delete(studentId); return n; });
  }, [circleId, date, pendingStudents]);

  const post: PostFn = useCallback(async (url, body, okMsg, studentId?) => {
    setMsg(null);
    const t = await token(); if (!t) { setStatus("unauth"); return { ok: false, error: "انتهت الجلسة." }; }
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify(body) });
    if (res.ok) {
      setMsg(okMsg); setMsgKind("ok");
      await load(circleId);
      if (studentId) setPanelCache((p) => { const n = new Map(p); n.delete(studentId); return n; });
      return { ok: true };
    } else {
      const j = await res.json().catch(() => ({})) as { error?: string; key?: string };
      const errMsg = j.error ?? "تعذّر التسجيل.";
      setMsg(errMsg); setMsgKind("err");
      return { ok: false, error: errMsg, key: j.key };
    }
  }, [circleId, load]) as PostFn;

  const grantManual = useCallback(async (studentId: string, pointItemId: string): Promise<{ granted: boolean } | null> => {
    const t = await token();
    if (!t) return null;
    const res = await fetch(`/api/students/${studentId}/grant-manual`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ pointItemId, date }),
    });
    if (!res.ok) return null;
    const result = (await res.json()) as { granted: boolean };
    setPanelCache((prev) => {
      const existing = prev.get(studentId);
      if (!existing) return prev;
      const mg = existing.manualGranted ?? [];
      const updated = { ...existing, manualGranted: result.granted ? [...mg, pointItemId] : mg.filter((id) => id !== pointItemId) };
      return new Map([...prev, [studentId, updated]]);
    });
    return result;
  }, [date]);

  // «الكل حاضر» — طلبٌ واحدٌ مجمَّع مع تحديثٍ متفائل.
  const markAllPresent = useCallback(async () => {
    if (!students) return;
    const tok = await token(); if (!tok) return;
    const unmark = students.filter((s) => s.attendanceStatus == null);
    if (!unmark.length) return;
    const ids = unmark.map((s) => s.studentId);
    setStudents((p) => p?.map((s) => ids.includes(s.studentId) ? { ...s, attendanceStatus: "PRESENT" } : s) ?? null);
    const res = await fetch(`/api/circles/${circleId}/mark-all-present`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ studentIds: ids, date }),
    });
    if (!res.ok) {
      setStudents((p) => p?.map((s) => ids.includes(s.studentId) ? { ...s, attendanceStatus: null } : s) ?? null);
      setMsg("تعذّر التسجيل الجماعي.");
    } else {
      setMsg(tu("markAllPresent") + " — سُجِّل.");
    }
  }, [circleId, date, students]);

  // منح الزي لكل الحاضرين دفعةً واحدة (يستثني من سبق منحه — idempotent)
  const grantUniformPresent = useCallback(async () => {
    const uniformItems = items.filter((i) => i.requiresPresent);
    if (!uniformItems.length) { setMsg("لا بنود تتطلّب حضوراً."); setMsgKind("err"); return; }
    const presentIds = (students ?? [])
      .filter((s) => s.attendanceStatus === "PRESENT" || s.attendanceStatus === "LATE")
      .map((s) => s.studentId);
    if (!presentIds.length) { setMsg("لا حاضرين بعد."); setMsgKind("err"); return; }
    const tok = await token(); if (!tok) return;
    let total = 0;
    for (const item of uniformItems) {
      const res = await fetch("/api/economy/grant-bulk", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
        body: JSON.stringify({ studentIds: presentIds, pointItemId: item.id, date }),
      });
      if (res.ok) { const j = (await res.json()) as { granted: number }; total += j.granted; }
    }
    setMsg(`${tu("grantUniformBtn")} — ${arNum(total)} مُنح ✓`); setMsgKind("ok");
  }, [items, students, date]);

  async function handleBulkGrant() {
    if (!bulkSelected.size || !bulkItemId) return;
    const tok = await token(); if (!tok) return;
    const res = await fetch("/api/economy/grant-bulk", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ studentIds: [...bulkSelected], pointItemId: bulkItemId, date }),
    });
    if (res.ok) {
      const { granted } = (await res.json()) as { granted: number };
      setMsg(`${tu("bulkGrantDone")} (${arNum(granted)} طالب)`);
    } else {
      setMsg("تعذّر المنح الجماعيّ.");
    }
    setBulkSelected(new Set());
    setBulkMode(false);
    setBulkItemId("");
  }

  const filteredBase = (students ?? []).filter((s) => {
    if (setupFilter === "NEEDS_SETUP") return s.setupStatus != null && !s.setupStatus.isComplete;
    if (setupFilter === "MISSING_DATA") return (s.setupStatus?.warnings.length ?? 0) > 0;
    return true;
  });

  // ترتيب بـ«يختم في»: الأقرب أوّلاً، ثم بلا بيانات، ثم بلا مسار
  const filtered = khatmSort
    ? [...filteredBase].sort((a, b) => {
        const ka = khatmCache.get(a.studentId);
        const kb = khatmCache.get(b.studentId);
        const tsA = ka?.ts ?? Infinity;
        const tsB = kb?.ts ?? Infinity;
        return tsA - tsB;
      })
    : filteredBase;

  const cur = students?.find((s) => s.studentId === selected) ?? null;

  const nextStudent = useCallback(() => {
    if (!selected || !filtered.length) return;
    const idx = filtered.findIndex((s) => s.studentId === selected);
    if (idx >= 0 && idx < filtered.length - 1) selectStudent(filtered[idx + 1].studentId);
  }, [selected, filtered, selectStudent]);

  const toggleKhatmSort = useCallback(async () => {
    if (khatmSort) { setKhatmSort(false); return; }
    setKhatmSort(true);
    if (!students) return;
    const missing = students.filter((s) => !khatmCache.has(s.studentId));
    if (!missing.length) return;
    const tok = await token(); if (!tok) return;
    const results = await Promise.all(
      missing.map((s) =>
        fetch(`/api/students/${s.studentId}/khatm-estimate`, { headers: { authorization: `Bearer ${tok}` } })
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { kind: string; date?: string } | null) => ({
            id: s.studentId,
            kind: j?.kind ?? "NO_TRACK",
            ts: j?.kind === "DATE" && j.date ? new Date(j.date).getTime() : null,
          }))
          .catch(() => ({ id: s.studentId, kind: "NO_TRACK", ts: null })),
      ),
    );
    setKhatmCache((prev) => {
      const next = new Map(prev);
      for (const r of results) next.set(r.id, { kind: r.kind, ts: r.ts });
      return next;
    });
  }, [khatmSort, students, khatmCache]);

  if (status === "unauth") return <PageShell roles={me?.roles ?? []} userName={me?.name}><p>{tu("needLoginTeacherAdmin")}</p></PageShell>;
  if (status === "loading") return <PageShell roles={me?.roles ?? []} userName={me?.name}><Skeleton height={80} /></PageShell>;
  if (status === "error") return <PageShell roles={me?.roles ?? []} userName={me?.name}><p style={{ color: ui.color.danger }}>{tu("loadFailed")}<Button variant="ghost" size="sm" onClick={() => void load(circleId)}>{tu("retry")}</Button></p></PageShell>;
  if (circles.length === 0) return <PageShell roles={me?.roles ?? []} userName={me?.name}><EmptyState title="لا حلقات تَرصدها" /></PageShell>;

  return (
    <PageShell roles={me?.roles ?? []} userName={me?.name}>
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
      {msg && <p style={{ color: msgKind === "ok" ? ui.color.success : ui.color.danger, fontSize: ui.text.xs, marginBottom: sp(2) }}>{msg}</p>}

      <AutoAssignMissingBtn students={students} circleId={circleId} onDone={() => void load(circleId)} />

      {/* زر إضافة طالب — للمعلّم في حلقته وللمدير */}
      {(me?.roles.includes("TEACHER") || me?.roles.includes("CIRCLE_MANAGER") || me?.roles.includes("SUPER_ADMIN")) && circleId && (
        showAddForm ? (
          <AddStudentInline
            circleId={circleId}
            onDone={(studentId, duplicate) => {
              setShowAddForm(false);
              void load(circleId);
              if (duplicate) {
                setMsg("الطالب موجود بالفعل في هذه الحلقة."); setMsgKind("ok");
              } else {
                setMsg("أُضيف الطالب بنجاح — أكمِل إعداده."); setMsgKind("ok");
              }
              selectStudent(studentId);
            }}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <div style={{ marginBottom: sp(3) }}>
            <Button
              data-testid="add-student-btn"
              size="sm"
              variant="ghost"
              onClick={() => setShowAddForm(true)}
            >
              {tu("addStudentBtn")}
            </Button>
          </div>
        )
      )}

      <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(3) }}>
        <Button size="sm" variant={view === "list" ? "primary" : "ghost"} onClick={() => switchView("list")}>{tu("viewList")}</Button>
        <Button size="sm" variant={view === "cards" ? "primary" : "ghost"} onClick={() => switchView("cards")}>{tu("viewCards")}</Button>
        {circleId && (
          <Button size="sm" variant="ghost" onClick={() => { window.location.href = `/admin/circles/${circleId}/weakness`; }}>{tu("weaknessMapBtn")}</Button>
        )}
        <Button size="sm" variant={bulkMode ? "bronze" : "ghost"} onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); setBulkItemId(""); }}>
          {bulkMode ? tu("bulkCancelBtn") : tu("bulkModeBtn")}
        </Button>
        {(me?.roles.includes("CIRCLE_MANAGER") || me?.roles.includes("SUPER_ADMIN")) && students && students.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowBulkCorrect(true)}
            data-testid="bulk-correct-positions-btn"
          >
            {"تصحيح الموضع الجماعي"}
          </Button>
        )}
        {items.some((i) => i.requiresPresent) && students && students.some((s) => s.attendanceStatus === "PRESENT" || s.attendanceStatus === "LATE") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void grantUniformPresent()}
            data-testid="grant-uniform-btn"
          >
            {tu("grantUniformBtn")}
          </Button>
        )}
        {!bulkMode && (
          <Button size="sm" variant={khatmSort ? "bronze" : "ghost"} onClick={() => void toggleKhatmSort()} data-testid="khatm-sort-btn">
            {tu("khatmColLabel")} {khatmSort ? "▲" : ""}
          </Button>
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

      {bulkMode && (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center", marginBottom: sp(3), padding: sp(3), background: ui.color.soft, borderRadius: ui.radius.md, border: `1px solid ${ui.color.goldLine}` }}>
          <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>
            {bulkSelected.size > 0 ? `${arNum(bulkSelected.size)} طالب محدَّد` : "اختر طلاباً من القائمة"}
          </span>
          <select
            value={bulkItemId}
            onChange={(e) => setBulkItemId(e.target.value)}
            style={{ fontFamily: ui.font, fontSize: ui.text.xs, padding: `${sp(1)} ${sp(2)}`, borderRadius: ui.radius.sm, border: `1px solid ${ui.color.border}`, background: ui.color.surface, color: ui.color.text }}
          >
            <option value="">{tu("bulkGrantSelectItem")}</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.nameAr} ({it.value > 0 ? "+" : ""}{it.value})</option>)}
          </select>
          <Button size="sm" variant="primary" onClick={() => void handleBulkGrant()} disabled={!bulkSelected.size || !bulkItemId}>
            {tu("bulkGrantBtn")} ({arNum(bulkSelected.size)})
          </Button>
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
                        if (bulkMode) {
                          setBulkSelected((prev) => { const n = new Set(prev); n.has(s.studentId) ? n.delete(s.studentId) : n.add(s.studentId); return n; });
                        } else {
                          const next = isOpen ? null : s.studentId;
                          selectStudent(next);
                          if (next && !panelCache.has(next)) void loadDetail(next, s.program);
                        }
                      }}
                      style={{
                        width: "100%", textAlign: "start",
                        border: `1px solid ${bulkMode && bulkSelected.has(s.studentId) ? ui.color.goldLine : isOpen ? ui.color.goldLine : ui.color.border}`,
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
                        {bulkMode && bulkSelected.has(s.studentId) && <Badge tone="success">✓</Badge>}
                        {pendingStudents.has(s.studentId) && <span style={{ fontSize: ui.text.xs, color: ui.color.muted }} aria-label="جارٍ">•</span>}
                        {done
                          ? <Badge tone="success" style={{ whiteSpace: "nowrap" }} data-testid="att-badge">{ATT_LABEL[s.attendanceStatus!] ?? s.attendanceStatus}</Badge>
                          : absentDefault
                            ? <Badge tone="danger" style={{ whiteSpace: "nowrap" }} data-testid="att-badge">{tu("notRaised")}</Badge>
                            : <Badge tone="neutral" style={{ whiteSpace: "nowrap" }} data-testid="att-badge">{tu("notRaised")}</Badge>}
                        {s.todayHifzDone && <Badge tone="bronze" style={{ whiteSpace: "nowrap" }}>{tu("hifzDone")}</Badge>}
                        {khatmSort && <KhatmBadge entry={khatmCache.get(s.studentId)} />}
                      </span>
                    </button>
                    {!bulkMode && isOpen && (
                      <div
                        data-testid="student-inline-card"
                        style={{
                          border: `1px solid ${ui.color.goldLine}`, borderTop: "none",
                          borderRadius: `0 0 ${ui.radius.md} ${ui.radius.md}`,
                          background: ui.color.bg, padding: sp(3),
                        }}
                      >
                        <StudentPanel
                          s={s} date={date} items={items} post={post}
                          detail={panelCache.get(s.studentId) ?? null}
                          detailLoading={panelLoading.has(s.studentId)}
                          onNextStudent={nextStudent}
                          grantManual={grantManual}
                          markAtt={markAtt} isPending={pendingStudents.has(s.studentId)}
                          canCorrectPosition={me?.roles.includes("CIRCLE_MANAGER") || me?.roles.includes("SUPER_ADMIN")}
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
                      data-student-id={s.studentId}
                      onClick={() => {
                        if (bulkMode) {
                          setBulkSelected((prev) => { const n = new Set(prev); n.has(s.studentId) ? n.delete(s.studentId) : n.add(s.studentId); return n; });
                        } else {
                          selectStudent(s.studentId);
                          if (!panelCache.has(s.studentId)) void loadDetail(s.studentId, s.program);
                        }
                      }}
                      style={{
                        textAlign: "start",
                        border: `1px solid ${bulkMode && bulkSelected.has(s.studentId) ? ui.color.goldLine : s.studentId === selected ? ui.color.goldLine : ui.color.border}`,
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
                        {bulkMode && bulkSelected.has(s.studentId) && <Badge tone="success">✓</Badge>}
                        {pendingStudents.has(s.studentId) && <span style={{ fontSize: ui.text.xs, color: ui.color.muted }} aria-label="جارٍ">•</span>}
                        {done
                          ? <Badge tone="success" style={{ whiteSpace: "nowrap" }} data-testid="att-badge">{ATT_LABEL[s.attendanceStatus!] ?? s.attendanceStatus}</Badge>
                          : absentDefault
                            ? <Badge tone="danger" style={{ whiteSpace: "nowrap" }} data-testid="att-badge">{tu("notRaised")}</Badge>
                            : <Badge tone="neutral" style={{ whiteSpace: "nowrap" }} data-testid="att-badge">{tu("notRaised")}</Badge>}
                        {s.todayHifzDone && <Badge tone="bronze" style={{ whiteSpace: "nowrap" }}>{tu("hifzDone")}</Badge>}
                      </span>
                    </button>
                  );
                })}
                {filtered.length === 0 && <EmptyState title={setupFilter === "ALL" ? "لا طلاب في الحلقة" : "لا طلاب ضمن هذا الفلتر"} />}
              </div>

              <div style={{ flex: "2 1 420px", minWidth: 300, position: "sticky", top: 80, alignSelf: "flex-start", maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
                {bulkMode
                  ? <div style={{ padding: sp(4), color: ui.color.muted }}>{bulkSelected.size > 0 ? `${arNum(bulkSelected.size)} طالب محدَّد — اختر بنداً وانقر «منح».` : "اختر طلاباً من القائمة."}</div>
                  : !cur
                    ? <div style={{ padding: sp(4), color: ui.color.muted }}>{tu("pickStudent")}</div>
                    : (
                      <div data-testid="student-inline-card">
                        <StudentPanel
                          s={cur} date={date} items={items} post={post}
                          detail={panelCache.get(cur.studentId) ?? null}
                          detailLoading={panelLoading.has(cur.studentId)}
                          onNextStudent={nextStudent}
                          grantManual={grantManual}
                          markAtt={markAtt} isPending={pendingStudents.has(cur.studentId)}
                          canCorrectPosition={me?.roles.includes("CIRCLE_MANAGER") || me?.roles.includes("SUPER_ADMIN")}
                        />
                      </div>
                    )}
              </div>
            </div>
          )
      )}

      {view === "cards" && (
        <CardsView
          students={filtered} absentDefault={absentDefault} date={date} items={items} post={post}
          panelCache={panelCache} panelLoading={panelLoading} onOpenStudent={loadDetail}
          markAtt={markAtt} pendingStudents={pendingStudents}
        />
      )}

      {showBulkCorrect && students && (
        <BulkCorrectDialog
          students={students}
          circleId={circleId}
          onDone={() => void load(circleId)}
          onClose={() => setShowBulkCorrect(false)}
        />
      )}
    </PageShell>
  );
}
