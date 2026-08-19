"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, EmptyState, ui, sp } from "@/components/ui";

// السلّم البياني لمراقي (§٨): تنازليّ. الفاتحة (تمهيد) أولاً، ثم الحزب ٦٠ (الأعلى←الناس)
// صعودًا إلى الحزب ١ (البقرة ١–٧٤). كل حزب: حدوده بالسورة والآية وجزؤه — ورقمه للكادر
// فقط (§٨٫٢: الطالب لا يرى «حزب»). يقرأ من getMaraqiLadder. حالات صريحة، لا انهيار.

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

export default function MaraqiLadderPage() {
  const { me } = useMe();
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauth">("loading");

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
      const res = await fetch("/api/programs/maraqi/ladder", {
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
      setLadder((await res.json()) as Ladder);
      setStatus("ready");
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

  const mains = ladder?.mainStages ?? [];
  if (!ladder || mains.length === 0)
    return (
      <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/programs/maraqi"
        title="مراقي — السلّم البياني" crumbs={CRUMBS}>
        <EmptyState title="لم تُبذَر المراحل بعد" />
      </AppShell>
    );

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/programs/maraqi"
      title="مراقي — السلّم البياني" crumbs={CRUMBS}>
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
    </AppShell>
  );
}
