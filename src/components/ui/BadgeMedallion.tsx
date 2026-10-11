"use client";
/* eslint-disable @next/next/no-img-element -- إطارُ وسامٍ زخرفيٌّ بأبعادٍ ثابتة؛ والرمز يظهر فوقه ولو غاب الإطار. */
import { ui } from "./tokens";

// ميدالية وسامٍ (م٣): رمزُ الوسام داخل إطارٍ نجميٍّ بلون فئته. يتلاشى الإطار إن تعذّر تحميله ويبقى الرمز.

const FRAME: Record<string, string> = {
  ACHIEVEMENT: "/brand/badge-frame-gold.webp",
  MASTERY: "/brand/badge-frame-silver.webp",
  ONBOARDING: "/brand/badge-frame-bronze.webp",
  REGULARITY: "/brand/badge-frame-purple.webp",
};

export function BadgeMedallion({ emoji, category, size = 72, dim = false }: { emoji: string | null; category: string; size?: number; dim?: boolean }) {
  const frame = FRAME[category] ?? FRAME.ACHIEVEMENT;
  return (
    <div style={{ position: "relative", width: size, height: size, opacity: dim ? 0.45 : 1 }}>
      <img src={frame} alt="" aria-hidden="true" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.34, color: ui.color.text }}>{emoji ?? "🏅"}</span>
    </div>
  );
}
