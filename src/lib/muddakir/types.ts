// أنواع إدخال دوالّ المُدَّكِر النقيّة (مرآةٌ لحقول MuddakirProfile/MuddakirFace وإعدادات §٩)،
// معرّفةٌ محليّاً كي تبقى الدوالّ نقيّةً مستقلّةً عن عميل Prisma وقابلةً للاختبار بلا قاعدة.

/** حالة الوجه (§٤٫٢): NEW → IN_RIBAT → HEARD → IN_REVIEW. */
export type MuddakirFaceState = "NEW" | "IN_RIBAT" | "HEARD" | "IN_REVIEW";

/** ما يلزم من ملفّ الحافظ (MuddakirProfile) لحساب يومه. */
export interface ProfileInput {
  track: number; // ١ | ٢ | ٣ أوجه/يوم
  reviewCycleDays: number; // دورة المراجعة لهذا الحافظ (§٤٫٣)
}

/** حالة وجهٍ لحافظ (MuddakirFace) بما يلزم لنافذة الربط. التواريخ YYYY-MM-DD بتوقيت مكّة. */
export interface FaceStateInput {
  page: number;
  state: MuddakirFaceState;
  firstMemorizedOn: string | null; // يوم أوّل حفظٍ (قرآنيّ)
  heard: boolean; // هل سمعه المشرف؟ (state === HEARD/IN_REVIEW أو heardAt غير فارغ)
}

/** إعدادات المدير (§٩) التي تمسّ حساب اليوم — كلّها من Setting، لا قيمَ مكتوبة. */
export interface MuddakirSettings {
  stageJuzCount: number; // أجزاء المرحلة (٥ ⟵ ٦ مراحل)
  tracks: number[]; // المسارات المتاحة ([1,2,3])
  newReps: number; // تكرار الجديد (٣٠)
  firstCleanReps: number; // التكرارات الأولى التي يجب أن تسلم (٣)
  yesterdayReps: number; // تكرار الأمس (١٠)
  ribatWindowDays: Record<string, number>; // نافذة الربط بحسب المسار ({"1":20,"2":15,"3":10})
  reviewCycleDays: number; // دورة المراجعة الافتراضيّة (٧)
}
