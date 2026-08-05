"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

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

const box: React.CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "1.5rem",
  fontFamily: "system-ui, sans-serif",
};
const stepStyle: React.CSSProperties = {
  border: "1px solid #1F5C3D",
  borderRadius: 8,
  background: "#FBFAF5",
  padding: "0.5rem 0.9rem",
  marginBottom: 6,
};

export default function MaraqiLadderPage() {
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

  if (status === "loading") return <main dir="rtl" style={box}>جارٍ التحميل…</main>;
  if (status === "unauth")
    return (
      <main dir="rtl" style={box}>
        <p>تحتاج دخولًا لعرض السلّم.</p>
        <a href="/login" style={{ color: "#1F5C3D" }}>تسجيل الدخول</a>
      </main>
    );
  if (status === "error")
    return (
      <main dir="rtl" style={box}>
        <p style={{ color: "#b00020" }}>تعذّر تحميل السلّم.</p>
        <button type="button" onClick={() => void load()}>إعادة المحاولة</button>
      </main>
    );

  const mains = ladder?.mainStages ?? [];
  if (!ladder || mains.length === 0)
    return (
      <main dir="rtl" style={box}>
        <h1 style={{ fontSize: "1.4rem" }}>مراقي — السلّم البياني</h1>
        <p style={{ opacity: 0.6 }}>لم تُبذَر المراحل بعد.</p>
      </main>
    );

  return (
    <main dir="rtl" style={box}>
      <h1 style={{ fontSize: "1.4rem" }}>مراقي — السلّم البياني</h1>
      <p style={{ opacity: 0.6, fontSize: "0.9rem", marginTop: -6 }}>
        تنازليّ: من الفاتحة والناس صعودًا إلى البقرة.
      </p>

      {/* التمهيد أولاً */}
      {ladder.prelude && (
        <div style={{ ...stepStyle, background: "#DDEAE1" }}>
          <strong>تمهيد:</strong> {ladder.prelude.nameAr}
          <span style={{ opacity: 0.6, fontSize: "0.85rem" }}> · بلا حصاد</span>
        </div>
      )}

      {/* المراحل الأصلية بترتيبها التنازليّ، وتحت كلٍّ أحزابها */}
      {mains.map((m) => (
        <section key={m.stageId} style={{ marginTop: 14 }}>
          <h2 style={{ fontSize: "1.05rem", color: "#14281D", margin: "0 0 6px" }}>{m.nameAr}</h2>
          <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {m.subStages.map((s) => (
              <li key={s.stageId} style={stepStyle}>
                <strong>{s.label}</strong>
                <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>
                  {s.juz != null ? ` · الجزء ${s.juz}` : ""}
                  {s.hizb != null ? ` · الحزب ${s.hizb}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
