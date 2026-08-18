"use client";
/* eslint-disable @next/next/no-img-element -- صورة وجهٍ من CDN (WebP)؛ لا تحتاج next/image. */

import { useEffect, useState } from "react";

import { ui } from "./tokens";

interface Poly { surahNumber: number; ayahNumber: number; polygon: string }
interface HeatAyah { surah: number; ayah: number; level: number }

// شدّة التظليل البرونزيّ حسب عتبات محمد: ١ فاتح · ٢ أغمق · ٣+ الأغمق. لا إشارات مرور.
const OPACITY: Record<number, number> = { 1: 0.28, 2: 0.5, 3: 0.72 };

/** وجه مصحفٍ مع تظليل آياتٍ بتدرّجٍ برونزيّ (خريطة الضعف — الفكرة ١). عرضٌ فقط. */
export function FaceHeatmap({ imageUrl, polygonsUrl, viewBox, ayahs, width = "min(92vw, 340px)" }: {
  imageUrl: string;
  polygonsUrl: string;
  viewBox: { width: number; height: number };
  ayahs: HeatAyah[];
  width?: number | string;
}) {
  const [polys, setPolys] = useState<Poly[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try { const p = (await (await fetch(polygonsUrl)).json()) as Poly[]; if (alive) setPolys(p); } catch { /* بلا مضلّعات */ }
    })();
    return () => { alive = false; };
  }, [polygonsUrl]);

  const levelOf = new Map(ayahs.map((a) => [`${a.surah}:${a.ayah}`, a.level]));

  return (
    <div style={{ position: "relative", width, border: `1px solid ${ui.color.border}`, background: ui.color.surface, borderRadius: ui.radius.md, overflow: "hidden" }}>
      <img src={imageUrl} alt={`وجه ${viewBox.width}×${viewBox.height}`} style={{ width: "100%", display: "block" }} />
      <svg viewBox={`0 0 ${viewBox.width} ${viewBox.height}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {polys.map((p, i) => {
          const lvl = levelOf.get(`${p.surahNumber}:${p.ayahNumber}`);
          if (!lvl) return null;
          return <path key={i} d={p.polygon} fill={ui.color.bronze} fillOpacity={OPACITY[Math.min(3, lvl)] ?? 0} />;
        })}
      </svg>
    </div>
  );
}
