"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, EmptyState, ui, sp } from "@/components/ui";

// السلّم البياني للقاعدة المدنية (§٧٫٣): الوحدات الـ١٤ (تمهيد + ١٣ باباً) كدرجٍ صاعد.
// كل باب: اسمه ووزنه ومحطته، وهدفه عند الفتح، وطريقة المؤلف للمعلم. حالات صريحة.

interface Step {
  stageId: string;
  ordinal: number;
  nameAr: string;
  weight: number;
  cumulativeWeight: number;
  milestone: number | null;
  objective: string | null;
  teacherNotes: string | null;
  state: string | null;
}
interface Ladder {
  programId: string;
  totalWeight: number;
  steps: Step[];
  progress: { completedWeight: number; totalWeight: number; percent: number } | null;
}
interface View {
  ladder: Ladder | null;
  canSeeTeacherNotes: boolean;
}
interface QaidahPosition {
  seeded: boolean; started: boolean; graduated: boolean;
  totalLessons: number; completedLessons: number; percent: number;
  current: { lessonName: string; chapterName: string | null; lessonIndexInChapter: number; lessonsInChapter: number } | null;
  deferredIsLatest: boolean;
}

const STATE_AR: Record<string, string> = {
  NOT_STARTED: "لم يبدأ",
  IN_PROGRESS: "قيد التقدّم",
  AWAITING_HASAD: "بانتظار الحصاد",
  REPAIRING: "ترميم",
  COMPLETED: "مكتمل",
};

const centered: React.CSSProperties = {
  minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: sp(3), background: ui.color.bg, fontFamily: ui.font, color: ui.color.text,
};

const CRUMBS = [{ label: "الرئيسة", href: "/" }, { label: "البرامج" }, { label: "القاعدة المدنية" }];

export default function CivilBaseLadderPage() {
  const { me } = useMe();
  const [view, setView] = useState<View | null>(null);
  const [position, setPosition] = useState<QaidahPosition | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const {
        data: { session },
      } = await supabaseBrowser().auth.getSession();
      if (!session) {
        setStatus("unauth");
        return;
      }
      const res = await fetch("/api/programs/civil-base/ladder", {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (res.status === 401 || res.status === 403) {
        setStatus("unauth");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setView((await res.json()) as View);
      setStatus("ready");
      // موضع الطالب في الدروس (إضافةٌ لا تُعطّل السلّم إن غابت) — الجلسة اليوميّة (QAIDAH_RULES).
      try {
        const pr = await fetch("/api/me/qaidah", { headers: { authorization: `Bearer ${session.access_token}` } });
        if (pr.ok) setPosition(((await pr.json()) as { position: QaidahPosition | null }).position);
      } catch { /* الموضع إضافةٌ اختياريّة */ }
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") return <main dir="rtl" style={centered}>جارٍ التحميل…</main>;
  if (status === "unauth")
    return (
      <main dir="rtl" style={centered}>
        <p>تحتاج دخولًا لعرض السلّم.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>تسجيل الدخول</a>
      </main>
    );
  if (status === "error")
    return (
      <main dir="rtl" style={centered}>
        <p style={{ color: ui.color.danger }}>تعذّر تحميل السلّم.</p>
        <button type="button" onClick={() => void load()}>إعادة المحاولة</button>
      </main>
    );

  const steps = view?.ladder?.steps ?? [];
  if (!view?.ladder || steps.length === 0)
    return (
      <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/programs/civil-base"
        title="القاعدة المدنية — السلّم البياني" crumbs={CRUMBS}>
        <EmptyState title="لم تُبذَر الأبواب بعد" />
      </AppShell>
    );

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/programs/civil-base"
      title="القاعدة المدنية — السلّم البياني" crumbs={CRUMBS}>
      {(me?.roles ?? []).some((r) => ["CIRCLE_MANAGER", "SUPER_ADMIN", "TECH_ADMIN"].includes(r)) && (
        <div style={{ marginBottom: sp(3) }}>
          <a href="/admin/programs/QAIDAH_MADANIYYAH/settings" style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.primary, textDecoration: "none", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md, padding: `${sp(1.5)} ${sp(2.5)}` }}>⚙ إعدادات الانتقال إلى مراقي</a>
        </div>
      )}
      {position?.seeded && (
        <div style={{ padding: `${sp(3)} ${sp(4)}`, marginBottom: sp(4), background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md, borderInlineStart: `4px solid ${ui.color.primary}` }}>
          {position.graduated ? (
            <strong style={{ color: ui.color.success }}>أتممتَ دروس القاعدة المدنية — بارك الله فيك ✓</strong>
          ) : position.current ? (
            <>
              <strong>موضعك الآن:</strong>{" "}
              {position.current.chapterName ? <>الباب «{position.current.chapterName}» — </> : null}
              الدرس «{position.current.lessonName}» (الدرس {position.current.lessonIndexInChapter} من {position.current.lessonsInChapter})
              {" · "}أتممتَ {position.completedLessons} من {position.totalLessons} ({position.percent}٪)
              {position.deferredIsLatest ? <> · <strong style={{ color: ui.color.bronze }}>آخر جلسة: مؤجَّل</strong></> : null}
            </>
          ) : (
            <span style={{ color: ui.color.muted }}>لم تبدأ الدروس بعد.</span>
          )}
        </div>
      )}
      {view.ladder.progress && (
        <p style={{ color: ui.color.muted }}>
          تقدّمك بالوزن: {view.ladder.progress.percent}٪ (
          {view.ladder.progress.completedWeight}/{view.ladder.progress.totalWeight})
        </p>
      )}
      {/* درجٌ صاعد: نعرض من الأعلى (الأخير) إلى الأسفل (التمهيد) ليبدو سلّمًا. */}
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {[...steps].reverse().map((s) => {
          const isOpen = open[s.stageId];
          const height = 44 + s.cumulativeWeight * 3; // ارتفاع الدرجة يتبع الوزن التراكمي
          return (
            <li key={s.stageId} style={{ marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [s.stageId]: !o[s.stageId] }))}
                style={{
                  width: `${Math.min(100, 30 + (s.cumulativeWeight / view.ladder!.totalWeight) * 70)}%`,
                  minHeight: 44,
                  textAlign: "start",
                  padding: `${sp(2)} ${sp(3)}`,
                  border: `1px solid ${ui.color.primary}`,
                  borderRadius: ui.radius.md,
                  fontFamily: ui.font,
                  color: ui.color.text,
                  background: s.state === "COMPLETED" ? "var(--color-ok-bg)" : ui.color.surface,
                  cursor: "pointer",
                }}
                title={`ارتفاع تقريبي ${height}`}
              >
                <strong>{s.ordinal === 0 ? "تمهيد" : `الباب ${s.ordinal}`}:</strong> {s.nameAr}
                {"  "}
                <span style={{ color: ui.color.muted, fontSize: ui.text.xs }}>
                  · وزن {s.weight}
                  {s.milestone ? ` · محطة ${s.milestone}` : " · خارج المحطات"}
                  {s.state ? ` · ${STATE_AR[s.state] ?? s.state}` : ""}
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: `${sp(2)} ${sp(3)}`, fontSize: ui.text.xs }}>
                  {s.objective && (
                    <p style={{ margin: "0 0 6px" }}>
                      <strong>الهدف:</strong> {s.objective}
                    </p>
                  )}
                  {s.teacherNotes && (
                    <details>
                      <summary style={{ cursor: "pointer", color: ui.color.primary }}>
                        للمعلم — طريقة المؤلف
                      </summary>
                      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", color: ui.color.muted }}>
                        {s.teacherNotes}
                      </pre>
                    </details>
                  )}
                  {!s.objective && !s.teacherNotes && (
                    <p style={{ color: ui.color.muted, margin: 0 }}>لا تفاصيل مبذورة لهذا الباب بعد.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </AppShell>
  );
}
