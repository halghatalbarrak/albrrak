// ═══════════════ محرّك تقدير الحصاد (الحكم ٧ — قرارات محمد) ═══════════════
//
// دالّةٌ **نقيّةٌ** (بلا قاعدة بيانات) هي أصل الصحّة: تحسب مرتبة حصاد الحزب من أخطائه
// وتردّداته. الأخطاء **تراكميّة على الحزب** (كل خطأٍ = ١ بصرف النظر عن وجهه). والتردّد
// يُنسب للوجه: **ثلاث تردّداتٍ في الوجه نفسه = خطأ واحد** (بلا شرط تتابع)، والمتباعدة عبر
// الأوجه **لا تتراكم** (٢ في وجهٍ + ٢ في آخر = صفر). ثم:
//   تميّز (EXCELLENT): ≤ خطأ واحد · اجتياز (PASS): ≤ خمسة · رسوب (FAIL): ≥ ستة.
//
// هذه المرحلة ٢: المحرّك النقيّ فقط. ربطه بـrecordHasad وتخزين الوجه/التردّد (ترحيل)
// في مرحلةٍ تالية. المرتبة تُطابق enum HasadResult (EXCELLENT/PASS/FAIL) القائم.

/** ثلاث تردّداتٍ في الوجه الواحد = خطأ واحد. */
export const HESITATIONS_PER_ERROR = 3;

/** حدود المراتب على الحزب: ≤١ تميّز، ≤٥ اجتياز، ≥٦ رسوب. */
export const RANK_THRESHOLDS = { EXCELLENT_MAX: 1, PASS_MAX: 5 } as const;

/** مرتبة الحزب — تُطابق enum HasadResult. */
export type HizbRank = "EXCELLENT" | "PASS" | "FAIL";

export interface HarvestError {
  faceNo: number; // الوجه الذي وقع فيه الخطأ (للتقرير/الترميم — لا يؤثّر في العدّ)
  surah?: number; // الآية بعينها (تغذّي تقرير المعلّم والحكم ٥)
  ayah?: number;
  errorType: "WORD" | "LETTER" | "FORGOTTEN_AYAH";
}

export interface HarvestHesitation {
  faceNo: number; // التردّد يُنسب للوجه المعروض
}

export interface HizbHarvestInput {
  errors: HarvestError[];
  hesitations: HarvestHesitation[];
}

export interface HizbGrade {
  rank: HizbRank;
  totalErrors: number; // التراكميّ على الحزب = المباشر + الناتج عن التردّد
  directErrors: number; // أخطاء «خطأ» المباشرة
  hesitationErrors: number; // ⌊تردّد الوجه ÷ ٣⌋ مجموعةً على الأوجه
  hesitationsByFace: Record<number, number>; // شفّافية: تردّد كل وجه
}

/**
 * يقدّر حصاد حزبٍ واحد (الحكم ٧): يجمع الأخطاء المباشرة مع الأخطاء الناتجة عن التردّد
 * (⌊عدد تردّد الوجه ÷ ٣⌋ لكل وجهٍ على حدة)، ثم يسند المرتبة بالحدود الثلاثة. دالّةٌ نقيّة.
 */
export function gradeHizbHarvest(input: HizbHarvestInput): HizbGrade {
  const directErrors = input.errors.length;

  // تردّد كل وجهٍ على حدة — لا يتراكم عبر الأوجه.
  const perFace = new Map<number, number>();
  for (const h of input.hesitations) {
    perFace.set(h.faceNo, (perFace.get(h.faceNo) ?? 0) + 1);
  }
  let hesitationErrors = 0;
  const hesitationsByFace: Record<number, number> = {};
  for (const [face, count] of perFace) {
    hesitationsByFace[face] = count;
    hesitationErrors += Math.floor(count / HESITATIONS_PER_ERROR);
  }

  const totalErrors = directErrors + hesitationErrors;
  const rank: HizbRank =
    totalErrors <= RANK_THRESHOLDS.EXCELLENT_MAX
      ? "EXCELLENT"
      : totalErrors <= RANK_THRESHOLDS.PASS_MAX
        ? "PASS"
        : "FAIL";

  return { rank, totalErrors, directErrors, hesitationErrors, hesitationsByFace };
}
