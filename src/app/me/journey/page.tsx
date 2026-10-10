"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Stat, ui, sp } from "@/components/ui";
import { arNum } from "@/lib/format";
import { tGami as t, programName } from "@/i18n/ar/gamification";

// صفحة رحلة الطالب (ل٥، §٦): الخريطة لكل برنامج، والسلسلة، والنقاط، والأوسمة، ورسائل التحفيز.
// عرضٌ فقط؛ النصوص من i18n. لحظةُ منحٍ احتفاليّة عند وسامٍ جديد.

type StationState = "DONE" | "CURRENT" | "LOCKED";
interface Station { key: string; label: string; state: StationState; progress?: { done: number; total: number } }
interface Roadmap { programKey: string; stations: Station[]; currentKey: string | null }
interface EarnedBadge { code: string; nameAr: string; descAr: string; emoji: string | null; category: string; earnedAt: string }
interface UpcomingBadge { code: string; nameAr: string; descAr: string; emoji: string | null; category: string }
interface Motivation { type: string; text: string }
interface Journey {
  streak: { current: number; longest: number };
  points: { balance: number; week: number; last: { itemName: string; amount: number; at: string } | null };
  roadmaps: Roadmap[];
  badges: { earned: EarnedBadge[]; upcoming: UpcomingBadge[] };
  motivations: Motivation[];
  justAwarded: string[];
}

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}
const sectionTitle: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `${sp(5)} 0 ${sp(2)}` };

export default function JourneyPage() {
  const { me } = useMe();
  const [data, setData] = useState<Journey | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth" | "notstudent">("idle");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const tok = await token();
      if (!tok) { setStatus("unauth"); return; }
      const res = await fetch("/api/me/journey", { headers: { authorization: `Bearer ${tok}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      const j = (await res.json()) as Journey | null;
      if (!j) { setStatus("notstudent"); return; }
      setData(j); setStatus("ready");
    } catch { setStatus("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const body = () => {
    if (status === "loading") return <p style={{ color: ui.color.muted }}>…جارٍ التحميل</p>;
    if (status === "notstudent") return <p style={{ color: ui.color.muted }}>هذه الصفحة للطالب.</p>;
    if (status === "error") return <p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" onClick={() => void load()}>إعادة</Button></p>;
    if (status !== "ready" || !data) return null;
    return (
      <>
        {/* لحظة الاحتفاء بوسامٍ جديد */}
        {data.justAwarded.length > 0 && (
          <Card style={{ padding: sp(3), marginBottom: sp(3), border: `2px solid ${ui.color.bronze}`, textAlign: "center", background: `color-mix(in srgb, ${ui.color.bronze} 10%, transparent)` }}>
            <div style={{ fontSize: ui.text.lg, fontWeight: 700, color: ui.color.bronze }}>{t("badgeJustAwarded")}</div>
            <div style={{ marginTop: sp(1) }}>
              {data.badges.earned.filter((b) => data.justAwarded.includes(b.code)).map((b) => (
                <span key={b.code} style={{ margin: `0 ${sp(1)}`, fontSize: ui.text.lg }}>{b.emoji ?? "🏅"} {b.nameAr}</span>
              ))}
            </div>
          </Card>
        )}

        {/* رسائل التحفيز */}
        {data.motivations.map((m) => (
          <Card key={m.type} style={{ padding: sp(3), marginBottom: sp(2), fontSize: ui.text.base, fontWeight: 600 }}>{m.text}</Card>
        ))}

        {/* السلسلة والنقاط */}
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", marginTop: sp(2) }}>
          <Stat label={`🔥 ${t("streakCurrent")}`} value={`${arNum(data.streak.current)} ${t("dayWord")}`} />
          <Stat label={t("streakLongest")} value={`${arNum(data.streak.longest)} ${t("dayWord")}`} />
          <Stat label={t("balanceLabel")} value={arNum(data.points.balance)} />
          <Stat label={t("weekPointsLabel")} value={arNum(data.points.week)} />
        </div>
        {data.points.last && (
          <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginTop: sp(1) }}>
            {t("lastEarnedLabel")}: {data.points.last.itemName} ({arNum(data.points.last.amount)})
          </p>
        )}

        {/* خرائط البرامج */}
        {data.roadmaps.map((rm) => (
          <div key={rm.programKey}>
            <h2 style={sectionTitle}>{t("roadmapTitle")} — {programName(rm.programKey)}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: sp(2) }}>
              {rm.stations.map((s) => <StationPill key={s.key} s={s} />)}
            </div>
          </div>
        ))}

        {/* الأوسمة */}
        <h2 style={sectionTitle}>{t("badgesEarned")}</h2>
        {data.badges.earned.length === 0 ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{t("noBadgesYet")}</p> : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: sp(2) }}>
            {data.badges.earned.map((b) => (
              <Card key={b.code} style={{ padding: sp(2), minWidth: 120, textAlign: "center" }}>
                <div style={{ fontSize: ui.text.lg }}>{b.emoji ?? "🏅"}</div>
                <div style={{ fontWeight: 700, fontSize: ui.text.xs }}>{b.nameAr}</div>
              </Card>
            ))}
          </div>
        )}

        <h2 style={sectionTitle}>{t("badgesUpcoming")}</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: sp(2) }}>
          {data.badges.upcoming.map((b) => (
            <Card key={b.code} style={{ padding: sp(2), minWidth: 160, opacity: 0.55 }}>
              <div style={{ fontSize: ui.text.base }}>{b.emoji ?? "🏅"} <strong style={{ fontSize: ui.text.xs }}>{b.nameAr}</strong></div>
              <div style={{ color: ui.color.muted, fontSize: ui.text.xs, marginTop: 2 }}>{b.descAr}</div>
            </Card>
          ))}
        </div>
      </>
    );
  };

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا.</p><a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );

  return (
    <AppShell roles={me?.roles ?? []} muddakirStaff={me?.muddakirStaff ?? []} userName={me?.name} activeHref="/me/journey"
      title={t("journeyTitle")} crumbs={[{ label: "الرئيسة", href: "/" }, { label: t("journeyTitle") }]}>
      {body()}
    </AppShell>
  );
}

function StationPill({ s }: { s: Station }) {
  const bg = s.state === "DONE" ? ui.color.success : s.state === "CURRENT" ? ui.color.bronze : ui.color.soft;
  const fg = s.state === "LOCKED" ? ui.color.muted : "#fff";
  const icon = s.state === "DONE" ? "✓" : s.state === "LOCKED" ? "🔒" : "●";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 84 }}>
      <div style={{ background: bg, color: fg, borderRadius: ui.radius.md, padding: `${sp(1.5)} ${sp(2)}`, fontSize: ui.text.xs, fontWeight: 700, textAlign: "center", width: "100%", boxShadow: s.state === "CURRENT" ? `0 0 0 3px color-mix(in srgb, ${ui.color.bronze} 30%, transparent)` : undefined }}>
        <span style={{ marginInlineEnd: 4 }}>{icon}</span>{s.label}
      </div>
      {s.state === "CURRENT" && s.progress && (
        <div style={{ width: "100%" }}>
          <div style={{ height: 6, background: ui.color.soft, borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${s.progress.total ? Math.round((s.progress.done / s.progress.total) * 100) : 0}%`, height: "100%", background: ui.color.primary }} />
          </div>
          <div style={{ fontSize: ui.text.xs, color: ui.color.muted, textAlign: "center" }}>{arNum(s.progress.done)} {t("progressOf")} {arNum(s.progress.total)}</div>
        </div>
      )}
    </div>
  );
}
