// دوالّ عرض التلفاز النقيّة (ش٤) — قابلةٌ للاختبار بمعزلٍ عن DOM.

const DEFAULT_BG: Record<string, string> = { MOSQUE: "/brand/display-mosque-bg.webp", HOME: "/brand/display-home-bg.webp" };

/** تقسيم الترتيب إلى منصّة تتويجٍ (الثلاثة الأوائل بترتيب العرض ٢·١·٣) ثمّ الرابع والخامس ثمّ البقيّة. */
export function partitionRanking<T>(ranking: readonly T[]): { podium: T[]; next2: T[]; rest: T[] } {
  const top3 = ranking.slice(0, 3);
  const podium = [top3[1], top3[0], top3[2]].filter((x): x is T => x !== undefined); // ٢ ١ ٣
  return { podium, next2: ranking.slice(3, 5), rest: ranking.slice(5) };
}

/** الخلفيّة المفعّلة: المرفوعة من الإدارة إن وُجدت، وإلّا افتراضيّة النوع. والفيديو يُعرض عنصرَ <video>. */
export function pickBackground(background: { url: string; type: "IMAGE" | "VIDEO" } | null, kind: string): { image: string | null; video: string | null } {
  if (background?.type === "VIDEO") return { image: null, video: background.url };
  return { image: background?.url ?? DEFAULT_BG[kind] ?? null, video: null };
}
