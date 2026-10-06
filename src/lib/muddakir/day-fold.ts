// طيّ أحداث يومٍ واحد إلى عدّادات — **نقيّ**، يستعمله الخادم (deriveDay) والجهاز معًا (العدّادات
// المحليّة والفوريّة + استعادتها بعد إعادة التحميل). محايدٌ لترتيب الوصول: يُفرز بـoccurredAt ثمّ
// يُطوى. قاعدة الثلاث الأولى (§٤٫١). firstCleanReps من Setting، لا رقمَ مكتوب.

/** حدثٌ محايدٌ للطيّ (مرآةٌ لحقول MuddakirEvent اللازمة، بلا Prisma). */
export interface FoldEvent {
  type: string;
  occurredAtMs: number;
  page?: number | null;
  reason?: string | null;
  makeupForDate?: string | null;
}

export interface FaceCounters { reps: number; repErrors: number; yesterdayReps: number }

export interface DayFoldResult {
  faces: Map<number, FaceCounters>;
  newPages: Set<number>;
  ribatDone: boolean;
  reviewDone: boolean;
  excuseReason: string | null;
  completedAtMs: number | null;
  makeupForDate: string | null;
}

export function foldDay(events: readonly FoldEvent[], firstCleanReps: number): DayFoldResult {
  const faces = new Map<number, FaceCounters>();
  const face = (p: number): FaceCounters => {
    let f = faces.get(p);
    if (!f) { f = { reps: 0, repErrors: 0, yesterdayReps: 0 }; faces.set(p, f); }
    return f;
  };
  const out: DayFoldResult = { faces, newPages: new Set(), ribatDone: false, reviewDone: false, excuseReason: null, completedAtMs: null, makeupForDate: null };
  const ordered = [...events].sort((a, b) => a.occurredAtMs - b.occurredAtMs);
  for (const e of ordered) {
    const p = e.page ?? null;
    switch (e.type) {
      case "NEW_REP": if (p != null) { face(p).reps += 1; out.newPages.add(p); } break;
      case "NEW_ERROR": if (p != null) { const f = face(p); f.repErrors += 1; out.newPages.add(p); if (f.reps < firstCleanReps) f.reps = 0; } break; // الثلاث الأولى تُصفّر
      case "NEW_UNDO": if (p != null) { const f = face(p); f.reps = Math.max(0, f.reps - 1); out.newPages.add(p); } break;
      case "YESTERDAY_REP": if (p != null) face(p).yesterdayReps += 1; break;
      case "RIBAT_DONE": out.ribatDone = true; break;
      case "REVIEW_DONE": out.reviewDone = true; break;
      case "EXCUSE": if (typeof e.reason === "string" && e.reason) out.excuseReason = e.reason; break;
      case "DAY_COMPLETE": if (out.completedAtMs == null || e.occurredAtMs > out.completedAtMs) out.completedAtMs = e.occurredAtMs; break;
      case "MAKEUP_COMPLETE": if (typeof e.makeupForDate === "string") out.makeupForDate = e.makeupForDate; break;
    }
  }
  return out;
}

/** عدّاد وجهٍ واحدٍ من أحداث الجديد (reps/repErrors) — للعرض الفوريّ لبطاقة الوجه. */
export function faceCounter(events: readonly FoldEvent[], page: number, firstCleanReps: number): FaceCounters {
  return foldDay(events.filter((e) => (e.page ?? null) === page), firstCleanReps).faces.get(page) ?? { reps: 0, repErrors: 0, yesterdayReps: 0 };
}
