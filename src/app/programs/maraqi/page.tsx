"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Button, EmptyState, ui, sp } from "@/components/ui";
import { PreparedTracksPanel } from "@/components/programs/PreparedTracksPanel";

// صفحة برنامج مراقي — لوحةٌ تفصيليّة بتبويبين: «السلّم البياني» (§٨، لكلّ ذي دور) و«المسارات
// المُجهَّزة» (البند ٢، للمدير/المشرف فقط — محجوبٌ في الواجهة كحجب القائمة سابقًا). دُمجت شاشة
// المسارات هنا (مكوّن PreparedTracksPanel) بلا مساس منطقها ولا الـAPI. السلّم كما كان.

interface SubStage {
  stageId: string;
  ordinal: number;
  label: string;
  juz: number | null;
  hizb: number | null;
}
interface MainStage {
  stageId: string;
  ordinal: number;
  nameAr: string;
  subStages: SubStage[];
}
interface Ladder {
  prelude: { stageId: string; nameAr: string } | null;
  mainStages: MainStage[];
  canSeeHizb: boolean;
}

type Tab = "ladder" | "tracks";

const centered: React.CSSProperties = {
  minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: sp(3), background: ui.color.bg, fontFamily: ui.font, color: ui.color.text,
};
const stepStyle: React.CSSProperties = {
  border: `1px solid ${ui.color.primary}`,
  borderRadius: ui.radius.md,
  background: ui.color.surface,
  padding: `${sp(2)} ${sp(3)}`,
  marginBottom: 6,
};

const CRUMBS = [{ label: "الرئيسة", href: "/" }, { label: "البرامج" }, { label: "مراقي" }];

export default function MaraqiProgramPage() {
  const { me } = useMe();
  // المسارات لمن كان يراها في القائمة سابقًا: المشرف والمدير (يطابق حارس /api/admin/tracks).
  const isAdmin = (me?.roles ?? []).some((r) => r === "CIRCLE_MANAGER" || r === "SUPER_ADMIN");
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");
  const [tab, setTab] = useState<Tab>("ladder");

  // فتح تبويب المسارات مباشرةً عبر ?tab=tracks (تحويل /admin/tracks القديم).
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "tracks") {
      setTab("tracks");
    }
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const { data: { session } } = await supabaseBrowser().auth.getSession();
      if (!session) { setStatus("unauth"); return; }
      const res = await fetch("/api/programs/maraqi/ladder", {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      setLadder((await res.json()) as Ladder);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (status === "unauth")
    return (
      <main dir="rtl" style={centered}>
        <p>تحتاج دخولًا لعرض الصفحة.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>تسجيل الدخول</a>
      </main>
    );

  // حجبٌ في الواجهة: غير الإداريّ لا يفتح تبويب المسارات ولو طلبه بالرابط ⟵ يعود للسلّم.
  const activeTab: Tab = tab === "tracks" && isAdmin ? "tracks" : "ladder";
  const mains = ladder?.mainStages ?? [];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/programs/maraqi" title="مراقي" crumbs={CRUMBS}>
      {/* التبويبات */}
      <div style={{ display: "flex", gap: sp(2), marginBottom: sp(4), borderBottom: `1px solid ${ui.color.border}`, paddingBottom: sp(2), flexWrap: "wrap" }}>
        <Button size="sm" variant={activeTab === "ladder" ? "bronze" : "ghost"} onClick={() => setTab("ladder")}>السلّم البياني</Button>
        {isAdmin && <Button size="sm" variant={activeTab === "tracks" ? "bronze" : "ghost"} onClick={() => setTab("tracks")}>المسارات المُجهَّزة</Button>}
        {isAdmin && <Button size="sm" variant="ghost" onClick={() => { window.location.href = "/admin/programs/MARAQI/settings"; }}>⚙ إعدادات الانتقال</Button>}
      </div>

      {activeTab === "tracks" ? (
        <PreparedTracksPanel />
      ) : status === "loading" ? (
        <p style={{ color: ui.color.muted }}>جارٍ تحميل السلّم…</p>
      ) : status === "error" ? (
        <p style={{ color: ui.color.danger }}>تعذّر تحميل السلّم. <Button variant="ghost" size="sm" onClick={() => void load()}>إعادة</Button></p>
      ) : !ladder || mains.length === 0 ? (
        <EmptyState title="لم تُبذَر المراحل بعد" />
      ) : (
        <>
          <p style={{ color: ui.color.muted, fontSize: ui.text.base, margin: `0 0 ${sp(4)}` }}>
            تنازليّ: من الفاتحة والناس صعودًا إلى البقرة.
          </p>

          {/* التمهيد أولاً */}
          {ladder.prelude && (
            <div style={{ ...stepStyle, background: "var(--color-ok-bg)" }}>
              <strong>تمهيد:</strong> {ladder.prelude.nameAr}
              <span style={{ color: ui.color.muted, fontSize: ui.text.xs }}> · بلا حصاد</span>
            </div>
          )}

          {/* المراحل الأصلية بترتيبها التنازليّ، وتحت كلٍّ أحزابها */}
          {mains.map((m) => (
            <section key={m.stageId} style={{ marginTop: sp(4) }}>
              <h2 style={{ fontSize: ui.text.base, fontWeight: 700, color: ui.color.primary, margin: "0 0 6px" }}>{m.nameAr}</h2>
              <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {m.subStages.map((s) => (
                  <li key={s.stageId} style={stepStyle}>
                    <strong>{s.label}</strong>
                    <span style={{ color: ui.color.muted, fontSize: ui.text.xs }}>
                      {s.juz != null ? ` · الجزء ${s.juz}` : ""}
                      {s.hizb != null ? ` · الحزب ${s.hizb}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </>
      )}
    </AppShell>
  );
}
