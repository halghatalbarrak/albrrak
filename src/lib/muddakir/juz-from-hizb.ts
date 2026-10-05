// اشتقاق حدود الأجزاء الثلاثين من جدول HizbBoundary (المصدر الموقَّع): الجزء = حزبان
// (الجزء N = الحزبان 2N−1 و2N). بداية الجزء = بداية حزبه الأوّل، ونهايته = نهاية حزبه الثاني.
// لا حدودَ مكتوبةٌ في الكود — تُمرَّر صفوف HizbBoundary وتُشتقّ منها، ثم تُمرَّر إلى deriveStages.

/** صفُّ HizbBoundary بما يلزم للاشتقاق (مرآةٌ لأعمدة الجدول). */
export interface HizbRow {
  hizb: number; // ١..٦٠
  juz: number; // ١..٣٠
  startSurahNum: number;
  startAyah: number;
  endSurahNum: number;
  endAyah: number;
}

/** حدود جزءٍ بترتيب المصحف (سورة:آية للبداية والنهاية). */
export interface JuzBound {
  juz: number;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
}

/**
 * يشتقّ حدود الأجزاء من صفوف HizbBoundary. يتحقّق أنّ كل جزءٍ حزبان بالضبط (§ الجزء = حزبان)،
 * فإن خالف صفٌّ ذلك أوقف برمي خطأٍ واضح (لا يفترض).
 */
export function juzBoundsFromHizb(rows: readonly HizbRow[]): JuzBound[] {
  const byJuz = new Map<number, HizbRow[]>();
  for (const r of rows) {
    const list = byJuz.get(r.juz) ?? [];
    list.push(r);
    byJuz.set(r.juz, list);
  }
  const juzNums = [...byJuz.keys()].sort((a, b) => a - b);
  return juzNums.map((juz) => {
    const hs = byJuz.get(juz)!.slice().sort((a, b) => a.hizb - b.hizb);
    if (hs.length !== 2) throw new Error(`الجزء ${juz}: عدد الأحزاب ${hs.length} (المتوقَّع حزبان)`);
    const [first, second] = hs;
    return {
      juz,
      startSurah: first.startSurahNum,
      startAyah: first.startAyah,
      endSurah: second.endSurahNum,
      endAyah: second.endAyah,
    };
  });
}
