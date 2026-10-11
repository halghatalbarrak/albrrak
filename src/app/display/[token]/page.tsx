"use client";
/* eslint-disable @next/next/no-img-element -- وضع التلفاز: خلفيّاتٌ وصورٌ زخرفيّةٌ بأبعادٍ متغيّرة لا يناسبها next/image. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { ui } from "@/components/ui";
import { arNum } from "@/lib/format";
import { partitionRanking, pickBackground } from "@/lib/display-tv";
import { tDisplay as t } from "@/i18n/ar/display";

// صفحة العرض بملء الشاشة (وضع التلفاز، ش٤) — عامّةٌ بلا دخول. تتابعُ شرائح، تحديثٌ آليّ وإعادة
// اتّصالٍ بإبقاء آخر بياناتٍ سليمة، بلا تسرّب ذاكرة (مؤقّتاتٌ مرجعيّةٌ تُنظَّف). الهوية الجديدة.

interface RankItem { rank: number; name: string; points: number; badges: string[] }
interface HomeTop { rank: number; name: string; points: number; isSon: boolean }
interface Son { name: string; points: number; rank: number | null; streak: number; motivation: string | null; badges: { nameAr: string; emoji: string | null }[] }
type Slide =
  | { type: "program"; programNameAr: string; durationSec: number; ranking: RankItem[] }
  | { type: "home"; programNameAr: string; durationSec: number; son: Son; top: HomeTop[] }
  | { type: "image"; imageUrl: string; durationSec: number };
interface Payload { kind: "MOSQUE" | "HOME"; nameAr: string; refreshSec: number; background: { url: string; type: "IMAGE" | "VIDEO" } | null; slides: Slide[] }

const FRAME = ["/brand/badge-frame-gold.webp", "/brand/badge-frame-silver.webp", "/brand/badge-frame-bronze.webp"];
const MIN_REFRESH = 60, MAX_BACKOFF = 300;

export default function DisplayTvPage() {
  const token = String((useParams() as { token?: string }).token ?? "");
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [idx, setIdx] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoff = useRef(0);

  // ── التحديث الآليّ وإعادة الاتّصال (مؤقّتٌ تكراريّ لا interval، فلا تراكم) ──
  const scheduleRefresh = useCallback((secs: number) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/display/${token}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as Payload;
        setData(j); setFailed(false); backoff.current = 0;
        scheduleRefresh(Math.max(MIN_REFRESH, j.refreshSec));
      } catch {
        // إبقاء آخر بياناتٍ سليمة؛ تراجعٌ أُسّيٌّ مع سقف.
        setFailed((prev) => (data == null ? true : prev));
        backoff.current = Math.min(MAX_BACKOFF, (backoff.current || MIN_REFRESH) * 2);
        scheduleRefresh(backoff.current);
      }
    }, Math.max(5, secs) * 1000);
  }, [token, data]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/display/${token}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as Payload;
        if (!alive) return;
        setData(j); setFailed(false);
        scheduleRefresh(Math.max(MIN_REFRESH, j.refreshSec));
      } catch { if (alive) { setFailed(true); scheduleRefresh(MIN_REFRESH); } }
    })();
    return () => { alive = false; if (refreshTimer.current) clearTimeout(refreshTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── تتابع الشرائح (مؤقّتٌ واحدٌ يُنظَّف) ──
  const slides = useMemo(() => data?.slides ?? [], [data]);
  useEffect(() => {
    if (slides.length === 0) return;
    const cur = idx % slides.length;
    const dur = Math.max(5, (slides[cur] as { durationSec?: number }).durationSec ?? 20);
    slideTimer.current = setTimeout(() => setIdx((i) => (i + 1) % slides.length), dur * 1000);
    return () => { if (slideTimer.current) clearTimeout(slideTimer.current); };
  }, [idx, slides]);

  if (!data) return <Fullscreen bg={null}><p style={{ color: "#EFE7D6" }}>{failed ? t("unavailable") : t("loadingTv")}</p></Fullscreen>;

  const { image: bg, video: bgVideo } = pickBackground(data.background, data.kind);
  const slide = slides.length ? slides[idx % slides.length] : null;

  return (
    <Fullscreen bg={bg} video={bgVideo}>
      {slide?.type === "image" && <img src={slide.imageUrl} alt="" style={{ maxWidth: "92vw", maxHeight: "86vh", borderRadius: 24, boxShadow: "0 10px 40px rgba(0,0,0,.5)" }} />}
      {slide?.type === "program" && <ProgramSlide slide={slide} />}
      {slide?.type === "home" && <HomeSlide slide={slide} />}
      {!slide && <p style={{ color: "#EFE7D6", fontSize: 28 }}>{data.nameAr}</p>}
    </Fullscreen>
  );
}

// ── الهيكل بملء الشاشة بالخلفيّة ──
function Fullscreen({ children, bg, video }: { children: React.ReactNode; bg: string | null; video?: string | null }) {
  return (
    <main dir="rtl" style={{ position: "fixed", inset: 0, overflow: "hidden", fontFamily: ui.font, display: "flex", alignItems: "center", justifyContent: "center",
      background: bg ? `#2B1A4F url('${bg}') center/cover no-repeat` : "linear-gradient(135deg,#2B1A4F,#1E1238)" }}>
      {video && <video src={video} autoPlay muted loop playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      {/* حجابٌ داكنٌ لقراءة النصّ فوق الخلفيّة */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(30,18,56,.55), rgba(30,18,56,.78))" }} />
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3vh 3vw" }}>
        {children}
      </div>
    </main>
  );
}

const GOLD = "#B8924A", CREAM = "#EFE7D6", MUTED = "#B9A9C9";
function Title({ children }: { children: React.ReactNode }) {
  return <h1 style={{ color: CREAM, fontSize: "4vh", fontWeight: 700, margin: "0 0 2.5vh", textAlign: "center", textShadow: "0 2px 12px rgba(0,0,0,.5)" }}>
    <span style={{ color: GOLD }}>✦ </span>{children}<span style={{ color: GOLD }}> ✦</span>
  </h1>;
}

// منصّة التتويج: الثلاثة الأوائل بإطاراتٍ ذهبيّ/فضّيّ/برونزيّ، ثمّ الرابع والخامس، ثمّ البقيّة بتمرير.
function ProgramSlide({ slide }: { slide: { programNameAr: string; ranking: RankItem[] } }) {
  const { podium, next2, rest } = partitionRanking(slide.ranking);
  const heights = new Map([[1, "20vh"], [2, "16vh"], [3, "13vh"]]);
  return (
    <>
      <Title>{slide.programNameAr}</Title>
      <div style={{ display: "flex", gap: "2vw", alignItems: "flex-end", justifyContent: "center", marginBottom: "2vh" }}>
        {podium.map((r) => (
          <div key={r.rank} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8vh" }}>
            <Medallion rank={r.rank} />
            <div style={{ color: CREAM, fontWeight: 700, fontSize: "2.4vh", textAlign: "center", maxWidth: "20vw" }}>{r.name}</div>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: "2.2vh" }}>{arNum(r.points)}</div>
            {r.badges.length > 0 && <div style={{ fontSize: "2.2vh" }}>{r.badges.slice(0, 5).join(" ")}</div>}
            <div style={{ width: "10vw", height: heights.get(r.rank), background: "linear-gradient(180deg,rgba(184,146,74,.5),rgba(184,146,74,.1))", borderTop: `3px solid ${GOLD}`, borderRadius: "6px 6px 0 0" }} />
          </div>
        ))}
      </div>
      {next2.length > 0 && (
        <div style={{ display: "flex", gap: "1.5vw", marginBottom: "1.5vh" }}>
          {next2.map((r) => (
            <div key={r.rank} style={{ display: "flex", alignItems: "center", gap: "1vw", background: "rgba(255,255,255,.08)", border: `1px solid ${GOLD}66`, borderRadius: 14, padding: "1vh 1.6vw" }}>
              <span style={{ color: GOLD, fontWeight: 700, fontSize: "2.4vh" }}>{arNum(r.rank)}</span>
              <span style={{ color: CREAM, fontWeight: 600, fontSize: "2.2vh" }}>{r.name}</span>
              <span style={{ color: GOLD, fontSize: "2vh" }}>{arNum(r.points)}</span>
              {r.badges.length > 0 && <span style={{ fontSize: "2vh" }}>{r.badges.slice(0, 5).join(" ")}</span>}
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 && <CalmList rows={rest.map((r) => ({ rank: r.rank, name: r.name, points: r.points, hl: false }))} />}
    </>
  );
}

function Medallion({ rank }: { rank: number }) {
  const frame = FRAME[rank - 1] ?? FRAME[2];
  return (
    <div style={{ position: "relative", width: "11vw", maxWidth: 140, aspectRatio: "1" }}>
      <img src={frame} alt="" aria-hidden style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#3a2a12", fontWeight: 800, fontSize: "3.4vh" }}>{arNum(rank)}</span>
    </div>
  );
}

// البيت: بطاقة الابن (مُبرَزة) + العشرة الأوائل مع إبراز الابن أينما كان.
function HomeSlide({ slide }: { slide: { programNameAr: string; son: Son; top: HomeTop[] } }) {
  const { son } = slide;
  return (
    <>
      <Title>{slide.programNameAr}</Title>
      <div style={{ background: "rgba(184,146,74,.16)", border: `2px solid ${GOLD}`, borderRadius: 20, padding: "2vh 3vw", marginBottom: "2vh", textAlign: "center", maxWidth: "60vw" }}>
        <div style={{ color: CREAM, fontSize: "3.2vh", fontWeight: 700 }}>{son.name}</div>
        <div style={{ display: "flex", gap: "2vw", justifyContent: "center", marginTop: "1vh", color: CREAM, fontSize: "2.4vh" }}>
          <span style={{ color: GOLD, fontWeight: 700 }}>{arNum(son.points)} {t("pointsWord")}</span>
          {son.rank != null && <span>{t("rankWord")}: {arNum(son.rank)}</span>}
          <span>🔥 {arNum(son.streak)}</span>
        </div>
        {son.badges.length > 0 && <div style={{ marginTop: "1vh", fontSize: "2.6vh" }}>{son.badges.map((b) => b.emoji ?? "🏅").join(" ")}</div>}
        {son.motivation && <div style={{ marginTop: "1vh", color: MUTED, fontSize: "2vh" }}>{son.motivation}</div>}
      </div>
      <CalmList rows={slide.top.map((r) => ({ rank: r.rank, name: r.name, points: r.points, hl: r.isSon }))} />
    </>
  );
}

// قائمةٌ هادئة بتمريرٍ آليٍّ إن طالت (تكرار المحتوى مرّتين لحلقةٍ سلسة).
function CalmList({ rows }: { rows: { rank: number; name: string; points: number; hl: boolean }[] }) {
  const scroll = rows.length > 8;
  const dur = Math.max(12, rows.length * 2.2);
  const Row = (r: { rank: number; name: string; points: number; hl: boolean }, k: number) => (
    <div key={k} style={{ display: "flex", alignItems: "center", gap: "1.2vw", padding: "0.8vh 1.4vw", borderRadius: 10,
      background: r.hl ? "rgba(184,146,74,.22)" : "transparent", border: r.hl ? `1.5px solid ${GOLD}` : "1px solid transparent", fontSize: "2.2vh" }}>
      <span style={{ color: GOLD, fontWeight: 700, minWidth: "3vw" }}>{arNum(r.rank)}</span>
      <span style={{ color: CREAM, fontWeight: 600, flex: 1 }}>{r.name}</span>
      <span style={{ color: MUTED }}>{arNum(r.points)}</span>
    </div>
  );
  return (
    <div style={{ width: "62vw", maxHeight: "34vh", overflow: "hidden", position: "relative" }}>
      <div className={scroll ? "tv-marquee" : undefined} style={scroll ? { animationDuration: `${dur}s` } : undefined}>
        {rows.map(Row)}
        {scroll && rows.map((r, i) => Row(r, i + rows.length))}
      </div>
    </div>
  );
}
