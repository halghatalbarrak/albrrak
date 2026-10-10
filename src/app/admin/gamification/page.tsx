"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Input, Badge, ui, sp } from "@/components/ui";
import { arNum } from "@/lib/format";
import { tGami as t } from "@/i18n/ar/gamification";

// شاشة إدارة التلعيب (ل٦، §٥/§٦): المدير يفعّل/يعطّل/يعدّل تعريفات الأوسمة (الاسم/الوصف/العتبة)
// وقوالب رسائل التحفيز (النصّ بمتغيّراته). النوع والرمز ثابتان. الصلاحيّة مفروضةٌ في الخادم.

interface BadgeDef { id: string; code: string; kind: string; threshold: number | null; category: string; nameAr: string; descAr: string; emoji: string | null; active: boolean }
interface Template { kind: string; textAr: string; active: boolean }
interface Payload { badges: BadgeDef[]; templates: Template[] }

const VARS: Record<string, string> = {
  STREAK_AT_RISK: "{days}", FIRST_STEP: "—", BADGE_NEAR: "{remaining} · {badge}", STATION_PROGRESS: "{done} · {total} · {station}",
};

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}
const sectionTitle: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `${sp(5)} 0 ${sp(2)}` };

export default function GamificationAdminPage() {
  const { me } = useMe();
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [badgeDraft, setBadgeDraft] = useState<Record<string, Partial<BadgeDef>>>({});
  const [tplDraft, setTplDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setStatus("loading"); setMsg(null);
    try {
      const tok = await token();
      if (!tok) { setStatus("unauth"); return; }
      const res = await fetch("/api/admin/gamification", { headers: { authorization: `Bearer ${tok}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      setData((await res.json()) as Payload);
      setBadgeDraft({}); setTplDraft({}); setStatus("ready");
    } catch { setStatus("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>) {
    setMsg(null);
    const tok = await token();
    if (!tok) { setStatus("unauth"); return; }
    const res = await fetch("/api/admin/gamification", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` }, body: JSON.stringify(body) });
    if (res.ok) { setMsg(t("savedMsg")); await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر."); }
  }

  if (status === "unauth")
    return <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}><p>تحتاج دخولًا.</p><a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a></main>;

  return (
    <AppShell roles={me?.roles ?? []} muddakirStaff={me?.muddakirStaff ?? []} userName={me?.name} activeHref="/admin/gamification"
      title={t("adminTitle")} crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: t("adminTitle") }]}>

      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {status === "loading" && <p style={{ color: ui.color.muted }}>…جارٍ التحميل</p>}
      {status === "error" && <p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" onClick={() => void load()}>إعادة</Button></p>}

      {status === "ready" && data && (
        <>
          <h2 style={sectionTitle}>{t("adminBadges")}</h2>
          {data.badges.map((b) => {
            const d = badgeDraft[b.id] ?? {};
            const nameAr = d.nameAr ?? b.nameAr, descAr = d.descAr ?? b.descAr;
            const threshold = d.threshold !== undefined ? d.threshold : b.threshold;
            return (
              <Card key={b.id} style={{ padding: sp(3), marginBottom: sp(2), display: "flex", flexDirection: "column", gap: sp(2) }}>
                <div style={{ display: "flex", alignItems: "center", gap: sp(2), flexWrap: "wrap" }}>
                  <span style={{ fontSize: ui.text.lg }}>{b.emoji ?? "🏅"}</span>
                  <Badge tone="neutral">{b.code}</Badge>
                  <Badge tone={b.active ? "success" : "neutral"}>{b.active ? t("colActive") : "—"}</Badge>
                  <Button type="button" size="sm" variant="ghost" onClick={() => void post({ action: "badge", id: b.id, patch: { active: !b.active } })}>{b.active ? t("disableBtn") : t("enableBtn")}</Button>
                </div>
                <Input value={nameAr} onChange={(e) => setBadgeDraft((p) => ({ ...p, [b.id]: { ...p[b.id], nameAr: e.target.value } }))} aria-label={t("colBadge")} />
                <Input value={descAr} onChange={(e) => setBadgeDraft((p) => ({ ...p, [b.id]: { ...p[b.id], descAr: e.target.value } }))} aria-label={t("colCondition")} />
                {(b.kind === "STREAK_DAYS" || b.kind === "FACES_HEARD_NO_ERROR") && (
                  <div style={{ display: "flex", gap: sp(2), alignItems: "center" }}>
                    <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("colThreshold")}</span>
                    <Input type="number" style={{ width: 96 }} value={threshold ?? ""} onChange={(e) => setBadgeDraft((p) => ({ ...p, [b.id]: { ...p[b.id], threshold: e.target.value ? Number(e.target.value) : null } }))} aria-label={t("colThreshold")} />
                    <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>({arNum(b.threshold ?? 0)})</span>
                  </div>
                )}
                <div><Button type="button" size="sm" disabled={!badgeDraft[b.id]} onClick={() => void post({ action: "badge", id: b.id, patch: { nameAr, descAr, ...(threshold !== b.threshold ? { threshold } : {}) } })}>{t("saveBtn")}</Button></div>
              </Card>
            );
          })}

          <h2 style={sectionTitle}>{t("adminTemplates")}</h2>
          {data.templates.map((tpl) => {
            const text = tplDraft[tpl.kind] ?? tpl.textAr;
            return (
              <Card key={tpl.kind} style={{ padding: sp(3), marginBottom: sp(2), display: "flex", flexDirection: "column", gap: sp(2) }}>
                <div style={{ display: "flex", alignItems: "center", gap: sp(2), flexWrap: "wrap" }}>
                  <Badge tone="neutral">{tpl.kind}</Badge>
                  <Badge tone={tpl.active ? "success" : "neutral"}>{tpl.active ? t("colActive") : "—"}</Badge>
                  <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("varsHint")}: {VARS[tpl.kind] ?? "—"}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => void post({ action: "template", kind: tpl.kind, patch: { active: !tpl.active } })}>{tpl.active ? t("disableBtn") : t("enableBtn")}</Button>
                </div>
                <Input value={text} onChange={(e) => setTplDraft((p) => ({ ...p, [tpl.kind]: e.target.value }))} aria-label={t("colText")} />
                <div><Button type="button" size="sm" disabled={tplDraft[tpl.kind] === undefined || tplDraft[tpl.kind] === tpl.textAr} onClick={() => void post({ action: "template", kind: tpl.kind, patch: { textAr: text } })}>{t("saveBtn")}</Button></div>
              </Card>
            );
          })}
        </>
      )}
    </AppShell>
  );
}
