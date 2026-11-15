"use client";

import { Badge, Button, sp, ui } from "@/components/ui";
import { arNum } from "@/lib/format";
import { tUnified as tu } from "@/i18n/ar/unified";
import type { Qaidah } from "./_types";

export function QaidahPanel({ q, onEval, onDefer }: { q: Qaidah; onEval: (mastered: boolean) => void; onDefer: () => void }) {
  const H3: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `0 0 ${sp(2)}` };
  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };

  if (q.graduated || q.locked) {
    return (
      <div>
        <h3 style={H3}>{tu("civilBase")}</h3>
        <Badge tone="success">{q.locked ? "تخرّج — التقييم مقفل" : "أتمّ القاعدة المدنية ✓"}</Badge>
      </div>
    );
  }

  const resultLabel = q.todayResult === "MASTERED" ? "متقن"
    : q.todayResult === "NOT_MASTERED" ? "غير متقن"
    : q.todayResult === "DEFERRED" ? "مؤجَّل" : null;

  return (
    <div>
      <h3 style={H3}>{tu("qaidahCurrentLesson")}</h3>
      <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: `0 0 ${sp(2)}` }}>
        {q.chapterName ? <>{tu("chapterPrefix")}<strong style={{ color: ui.color.text }}>{q.chapterName}</strong>{" · "}</> : null}
        {"الدرس: "}<strong style={{ color: ui.color.text }}>{q.lessonName ?? "—"}</strong>
        {q.lessonIndexInChapter && q.lessonsInChapter ? ` (${arNum(q.lessonIndexInChapter)}/${arNum(q.lessonsInChapter)})` : ""}
        {" · "}{arNum(q.percent)}{"٪"}
        {q.consecutiveDeferrals > 0 ? <>{" · "}<Badge tone="bronze">{"تأجيلات متتالية: "}{arNum(q.consecutiveDeferrals)}</Badge></> : null}
        {resultLabel ? <>{tu("todayPrefix")}<strong style={{ color: ui.color.text }}>{resultLabel}</strong></> : null}
      </p>
      <div style={row}>
        <Button size="sm" variant="primary" onClick={() => onEval(true)}>{tu("qaidahMastered")}</Button>
        <Button size="sm" variant="danger" onClick={() => onEval(false)}>{tu("qaidahNotMastered")}</Button>
        <Button size="sm" variant="ghost" onClick={onDefer} title="حاضرٌ لم يُقيَّم لضيق الوقت — لا ينقل الموضع">{tu("qaidahDeferred")}</Button>
      </div>
    </div>
  );
}
