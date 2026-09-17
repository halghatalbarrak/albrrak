"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, Card, Button, Badge, EmptyState, Skeleton, ui, sp } from "@/components/ui";

// شاشة جلسة القاعدة المدنية (QAIDAH_RULES.md): كل طلاب الحلقة معروضون، لكلٍّ درسه الحاليّ
// (الباب + الدرس) ونسبته. زرّان سريعان لكلّ طالب: «متقن» ينقله للدرس التالي بالترتيب،
// «غير متقن» يبقيه. نقرةٌ واحدة. القواعد المطلقة في الخادم.

interface Circle { id: string; nameAr: string }
interface BoardStudent {
  studentId: string; name: string; started: boolean; graduated: boolean;
  chapterName: string | null; lessonName: string | null;
  lessonIndexInChapter: number | null; lessonsInChapter: number | null; percent: number;
}

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function QaidahSessionPage() {
  const { me } = useMe();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState("");
  const [board, setBoard] = useState<BoardStudent[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth" | "notQaidah">("loading");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch("/api/attendance/circles", { headers: { authorization: `Bearer ${t}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      const cs = ((await res.json()) as { circles?: Circle[] }).circles ?? [];
      setCircles(cs);
      if (cs.length) setCircleId(cs[0].id);
      else setStatus("ready");
    })();
  }, []);

  const loadBoard = useCallback(async () => {
    if (!circleId) return;
    setStatus("loading");
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch(`/api/circles/${circleId}/qaidah-session`, { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
    if (res.status === 400) { setStatus("notQaidah"); return; } // حلقةٌ ليست للقاعدة
    if (!res.ok) { setStatus("error"); return; }
    setBoard(((await res.json()) as { students?: BoardStudent[] }).students ?? []);
    setStatus("ready");
  }, [circleId]);

  useEffect(() => { void loadBoard(); }, [loadBoard]);

  async function evaluate(studentId: string, mastered: boolean) {
    setSaving(studentId);
    const t = await token();
    if (!t) { setSaving(null); return; }
    try {
      await fetch(`/api/students/${studentId}/qaidah-session`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({ mastered }),
      });
      await loadBoard();
    } finally { setSaving(null); }
  }

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );

  const current = circles.find((c) => c.id === circleId);

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/qaidah-session"
      title="جلسة القاعدة المدنية" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "التشغيل" }, { label: "جلسة القاعدة" }]}>

      {circles.length > 1 && (
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginBottom: sp(4) }}>
          {circles.map((c) => (
            <Button key={c.id} size="sm" variant={c.id === circleId ? "bronze" : "ghost"} onClick={() => setCircleId(c.id)}>{c.nameAr}</Button>
          ))}
        </div>
      )}
      {current && status !== "notQaidah" && (
        <p style={{ color: ui.color.muted, margin: `0 0 ${sp(4)}`, fontSize: ui.text.base }}>{current.nameAr} — قيّم درس كلّ طالبٍ بنقرة: متقن يَنقله للتالي، وغير متقن يُبقيه.</p>
      )}

      {status === "notQaidah" && <EmptyState title="هذه الحلقة ليست للقاعدة المدنية" description="اختر حلقةً في برنامج القاعدة المدنية." />}
      {status === "error" && <p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" onClick={() => void loadBoard()}>إعادة</Button></p>}
      {status === "loading" && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={76} />)}</div>
      )}
      {status === "ready" && circles.length === 0 && <EmptyState title="لم تُسنَد إليك حلقة" description="راجِع الحلقات لإسناد حلقةٍ إليك." />}
      {status === "ready" && board && board.length === 0 && <EmptyState title="لا طلاب في هذه الحلقة" />}

      {status === "ready" && board && board.map((s) => (
        <Card key={s.studentId} style={{ marginBottom: sp(3), display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
            <strong style={{ fontSize: ui.text.base }}>{s.name}</strong>
            {s.graduated ? (
              <Badge tone="success">أتمّ القاعدة المدنية ✓</Badge>
            ) : (
              <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>
                {s.chapterName ? <>الباب: <strong style={{ color: ui.color.text }}>{s.chapterName}</strong> · </> : null}
                الدرس: <strong style={{ color: ui.color.text }}>{s.lessonName ?? "—"}</strong>
                {s.lessonIndexInChapter && s.lessonsInChapter ? ` (${arNum(s.lessonIndexInChapter)}/${arNum(s.lessonsInChapter)})` : ""}
                {" · "}{arNum(s.percent)}٪
              </span>
            )}
          </div>
          {!s.graduated && (
            <div style={{ display: "flex", gap: sp(2) }}>
              <Button size="sm" disabled={saving === s.studentId} onClick={() => void evaluate(s.studentId, true)}>متقن</Button>
              <Button variant="ghost" size="sm" disabled={saving === s.studentId} onClick={() => void evaluate(s.studentId, false)}>غير متقن</Button>
            </div>
          )}
        </Card>
      ))}
    </AppShell>
  );
}
