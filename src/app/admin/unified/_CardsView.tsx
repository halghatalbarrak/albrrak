"use client";

import { useState } from "react";
import { Badge, Button, Card, EmptyState, sp, ui } from "@/components/ui";
import { arNum, formatAyah } from "@/lib/format";
import { tSetup } from "@/i18n/ar/setup";
import { tUnified as tu } from "@/i18n/ar/unified";
import { navAr } from "@/i18n/ar/nav";
import { StudentPanel } from "./_StudentPanel";
import type { GrantItem, PanelDetail, PostFn, Student } from "./_types";

const PROGRAM_AR: Record<string, string> = {
  QAIDAH_MADANIYYAH: navAr.civilBase, MARAQI: navAr.maraqi, MUDDAKIR: navAr.grpMuddakir, WEEKLY: navAr.weekly,
};
const ATT_LABEL: Record<string, string> = {
  PRESENT: "حاضر", LATE: "متأخّر", ABSENT_UNEXCUSED: "غائب", LEFT_NO_PERMISSION: "خرج بلا إذن",
  ABSENT_EXCUSED: "غائب بعذر", PRE_EXCUSED: "مستأذن", LEFT_EARLY: "خرج مبكّرًا",
};

export function CardsView({ students, absentDefault, circleId, date, items, post, panelCache, panelLoading, onOpenStudent }: {
  students: Student[];
  absentDefault: boolean;
  circleId: string; date: string; items: GrantItem[];
  post: PostFn;
  panelCache: ReadonlyMap<string, PanelDetail>;
  panelLoading: ReadonlySet<string>;
  onOpenStudent: (studentId: string, program: string | null) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (students.length === 0) return <EmptyState title="لا طلاب ضمن هذا الفلتر" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
      {students.map((s) => {
        const isExpanded = expanded === s.studentId;
        return (
          <Card key={s.studentId} style={{ padding: 0, overflow: "hidden" }}>
            <button
              onClick={() => {
                const next = isExpanded ? null : s.studentId;
                setExpanded(next);
                if (next && !panelCache.has(next)) onOpenStudent(next, s.program);
              }}
              style={{ width: "100%", textAlign: "start", background: "transparent", border: "none", cursor: "pointer", fontFamily: ui.font, color: ui.color.text, padding: sp(4), display: "flex", flexDirection: "column", gap: sp(2) }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), flexWrap: "wrap" }}>
                <span style={{ display: "flex", gap: sp(2), alignItems: "center", minWidth: 0, flex: "1 1 auto" }}>
                  <strong style={{ fontSize: ui.text.base, wordBreak: "break-word" }}>{s.name}</strong>
                  {s.program && <Badge tone="neutral">{PROGRAM_AR[s.program] ?? s.program}</Badge>}
                  {s.deferredToday && <Badge tone="bronze">{tu("deferredTodayBadge")}</Badge>}
                  {s.setupStatus && !s.setupStatus.isComplete && <Badge tone="danger">{tSetup("badgeNeedsSetup")}</Badge>}
                </span>
                <span style={{ display: "flex", gap: sp(2), alignItems: "center", flexShrink: 0 }}>
                  {s.attendanceStatus
                    ? <Badge tone="success" style={{ whiteSpace: "nowrap" }}>{ATT_LABEL[s.attendanceStatus] ?? s.attendanceStatus}</Badge>
                    : absentDefault
                      ? <Badge tone="danger" style={{ whiteSpace: "nowrap" }}>{tu("notRaised")}</Badge>
                      : <Badge tone="neutral" style={{ whiteSpace: "nowrap" }}>{tu("notRaised")}</Badge>}
                  {s.todayHifzDone && <Badge tone="bronze" style={{ whiteSpace: "nowrap" }}>{tu("hifzDone")}</Badge>}
                </span>
              </div>

              {s.program === "MARAQI" && (
                <div style={{ display: "flex", gap: sp(4), flexWrap: "wrap", fontSize: ui.text.xs, color: ui.color.muted }}>
                  {s.stageLabel && (
                    <span>
                      {tu("stageLabelPrefix")}<strong style={{ color: ui.color.text }}>{s.stageLabel}</strong>
                      {s.hizb != null ? <>{tu("hizbInline")}{arNum(s.hizb)}</> : ""}
                    </span>
                  )}
                  {s.yesterday && (
                    <span>
                      {tu("yesterdayLabel")}<strong style={{ color: ui.color.text }}>{formatAyah(s.yesterday.fromSurah, s.yesterday.fromAyah, s.yesterday.toSurah, s.yesterday.toAyah)}</strong>
                      {!s.yesterday.mastered ? tu("notMasteredSuffix") : ""}
                    </span>
                  )}
                  {s.required && (
                    <span>
                      {tu("requiredTodayPrefix")}
                      <strong style={{ color: ui.color.text }}>
                        {tu("requiredTarseekhPrefix")}{arNum(s.required.tarseekhCount)}
                        {tu("requiredKhumsPrefix")}{arNum(s.required.khums)}
                      </strong>
                    </span>
                  )}
                  {s.weeklyPercent != null && (
                    <span>{tu("weeklyCyclePrefix")}<strong style={{ color: s.weeklyComplete ? ui.color.success : ui.color.text }}>{arNum(s.weeklyPercent)}٪</strong></span>
                  )}
                </div>
              )}
            </button>

            {isExpanded && (
              <div style={{ borderTop: `1px solid ${ui.color.border}`, padding: sp(4), background: ui.color.bg }}>
                {s.program === "MARAQI" && (
                  <div style={{ marginBottom: sp(3) }}>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => void post(`/api/students/${s.studentId}/session`, { kind: "defer", date }, tu("deferDone"), s.studentId)}
                    >
                      {tu("deferBtn")}
                    </Button>
                  </div>
                )}
                <StudentPanel
                  s={s} circleId={circleId} date={date} items={items} post={post}
                  detail={panelCache.get(s.studentId) ?? null}
                  detailLoading={panelLoading.has(s.studentId)}
                />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
