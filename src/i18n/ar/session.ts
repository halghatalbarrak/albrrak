// قاموس نصوص الجلسة اليومية (العربيّة) — المصدر الوحيد لكل نصٍّ يظهر للمستخدم في شاشة
// /admin/session. يُستدعى بمفتاحٍ عبر tSession، تمهيداً لإضافة لغاتٍ موازية لاحقاً (المفاتيح
// نفسها). النصوص منقولةٌ حرفاً بحرف من الصفحة بلا تغيير. لا تُكتب الأرقام هنا؛ العرض الرقميّ
// بـarNum في طبقة العرض، والأجزاء المتغيّرة تُركَّب في الصفحة لا داخل القيمة.

export const sessionAr = {
  // شاشة «تحتاج دخولًا»
  needLogin: "تحتاج دخولًا.",
  login: "دخول",

  // عنوان الشاشة ومسار التنقّل
  pageTitle: "الجلسة اليومية",
  crumbHome: "الرئيسة",
  crumbOperation: "التشغيل",
  crumbSession: "الجلسة اليومية",

  // ترويسة الحلقة (الجزء الثابت بعد اسم الحلقة)
  circleHeaderSuffix: " — طلابها اليوم، كلٌّ بحاله وخطوته التالية.",
  weaknessMapLink: "خريطة ضعف الحلقة",

  // شريط العمل بلا إنترنت (الجزء الثابت قبل/بعد العدد)
  offlinePrefix: "لا اتصال — ",
  offlineSuffix: " رصدٌ محفوظٌ محليّاً، سيُزامن تلقائيّاً عند عودة الشبكة.",
  syncNow: "مزامنة الآن",

  // التحميل والأخطاء والحالات الفارغة
  loadFailed: "تعذّر التحميل. ",
  retry: "إعادة",
  noCircleTitle: "لم تُسنَد إليك حلقة",
  noCircleDesc: "راجِع الحلقات لإسناد حلقةٍ إليك.",
  noStudents: "لا طلاب في هذه الحلقة",

  // بطاقة الطالب (الرأس)
  deferredToday: "مؤجَّل اليوم",
  stageLabelPrefix: "مرحلته: ",
  hizbInline: " · حزب ", // لِـ« · حزب ٣» — يتبعه رقم الحزب
  yesterdayLabel: "حفظ أمس: ",
  notMasteredSuffix: " (لم يُتقن)",
  requiredTodayPrefix: "المطلوب اليوم: ",
  requiredTarseekhPrefix: "ترسيخ ", // يتبعه العدد
  requiredKhumsPrefix: " · خُمس ≈ ", // يتبعه العدد
  weeklyCyclePrefix: "دورة الأسبوع: ",
  todayTargetTitle: "وجهة اليوم",

  // تفاصيل الطالب — التقدير الإرشاديّ (أجزاؤه الثابتة)
  forecastPrefix: "تقديرٌ إرشاديّ (~", // يتبعه الرقم ثم «آية/يوم»
  forecastPerDaySuffix: " آية/يوم):",
  forecastHizbPrefix: " إتمام الحزب نحو ", // يتبعه التاريخ ثم «؛»
  forecastSemicolon: "؛",
  forecastGraduationPrefix: " التخرّج نحو ", // يتبعه التاريخ ثم «.»
  forecastPeriod: ".",

  // أزرار الجاهزية والتأجيل
  declareReadinessBtn: "أعلن الجاهزية للحصاد",
  declareReadinessTitle: "الحصاد يُجريه مُسمِّعٌ ليس معلمه — أنت تُعلن الجاهزية فقط",
  deferBtn: "مؤجَّل (حاضرٌ لم يُسمَّع)",
  deferTitle: "حاضرٌ جاهزٌ لم يُسمَّع لضيق الوقت — يُوثَّق حاضراً أدّى، بلا نقلٍ للموضع",

  // قسم الحفظ
  hifzTitle: "الحفظ (المعلم وحده)",
  hifzSuggestionPrefix: "الحقل مملوءٌ بمقترح وجهة اليوم (", // يتبعه النطاق ثم اللاحقة
  hifzSuggestionSuffix: ") — أكّده أو عدّله.",
  hifzGatePrefix: "⚠️ الحكم ١: يعيد ", // يتبعه «نفس المقطع» ثم النطاق
  hifzGateSameSegment: "نفس المقطع",
  hifzGateSuffix: ")، لا حفظ جديد.",
  hifzGateRangeOpen: " (", // قبل نطاق الحكم ١
  fillSegment: "املأ المقطع",
  fromSurah: "من سورة",
  ayah: "آية",
  toSurah: "إلى سورة",
  attempts: "المحاولات",
  mastered: "أتقن",
  save: "حفظ",
  recordedTodayPrefix: "مُسجَّل اليوم: ", // يتبعه نطاقٌ وأرقام مركّبة في الصفحة
  attemptsMid: " · محاولات ", // بين النطاق وعدد المحاولات
  masteredSep: " · ", // قبل «أتقن»/«لم يُتقن»
  notMastered: "لم يُتقن",

  // قسم «ما يُسمَّع اليوم»
  heardTodayTitle: "ما يُسمَّع اليوم",
  tarseekhStrong: "الترسيخ",
  tarseekhWindowPrefix: " (آخر ", // يتبعه عدد المقاطع ثم اللاحقة
  tarseekhWindowSuffix: " مقاطع):",
  noSegmentsYet: " — لا مقاطع بعد",
  weeklyReviewStrong: "المراجعة الأسبوعية",
  weeklyReviewMid: ": الراسخ ", // يتبعه العدد ثم «مقطعًا»
  weeklyReviewStockSuffix: " مقطعًا · خُمس اليوم ≈ ", // يتبعه الرقم
  weeklyCycleDonePrefix: "دورة الأسبوع: أُنجِز ", // أجزاء مركّبة في الصفحة
  weeklyCycleOf: " من ",
  weeklyCycleRemaining: " — المتبقّي ",
  weeklyCyclePercentOpen: " (",
  weeklyCyclePercentClose: "٪)",
  weeklyCycleComplete: " · اكتملت ✓",

  // قسم الترسيخ والمراجعة (تمّ/لم يتم)
  consolidationTitle: "الترسيخ والمراجعة",
  tarseekhInlineLabel: "الترسيخ: ",
  done: "تمّ",
  notDone: "لم يتم",
  murajaahInlinePrefix: "المراجعة اليوم (مقاطع): ",
  recordAmount: "رصد المقدار",
  oneError: "خطأ واحد",
  twoErrors: "خطآن ← ترميم",

  // رسائل الحفظ والرصد (تنبيه/نجاح/خطأ)
  savedMsg: "حُفظ.",
  saveFailed: "تعذّر الحفظ.",
  offlineSavedMsg: "لا اتصال — حُفظ محليّاً وسيُزامن تلقائيّاً عند عودة الشبكة.",
  reviewTwoErrorsMsg: "خطآن — عاد المقطع حفظًا جديدًا.",
  reviewOneErrorMsg: "خطأٌ واحد — تنبيهٌ، يبقى راسخًا.",
  reviewFailed: "تعذّر الرصد.",
  reviewNeedsOnline: "رصد الترميم يتطلّب اتصالاً — أعِد المحاولة متّصلاً.",
  readinessDeclaredMsg: "أُعلنت الجاهزية للحصاد.",
  readinessFailed: "تعذّر إعلان الجاهزية.",
  readinessNeedsOnline: "إعلان الجاهزية يتطلّب اتصالاً — أعِد المحاولة متّصلاً.",

  // حالات تحميل تفاصيل الطالب
  detailLoading: "…جارٍ التحميل",
  detailLoadFailed: "تعذّر تحميل الجلسة.",
  maraqiOnlyNote: "الجلسة اليومية لطلاب مراقي. هذا الطالب في القاعدة المدنية.",
} as const;

/** مفاتيح قاموس الجلسة (للتحقّق الثابت عند الاستدعاء). */
export type SessionKey = keyof typeof sessionAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس الجلسة. */
export function tSession(key: SessionKey): string {
  return sessionAr[key];
}
