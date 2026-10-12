// قاموس نصوص قفل الحضور (العربيّة) — المصدر الوحيد لنصوص المهمّة ٩ (docs/ATTENDANCE_LOCK_RULES.md).
// الأرقام تُعرض مشرقيّةً في طبقة العرض (arNum). الاتّجاه RTL.

export const attendanceLockAr = {
  // شارة حالة اليوم (الشاشة الموحّدة)
  stateOpen: "مفتوح",
  stateApproved: "معتمَد",
  stateAutoLocked: "مقفلٌ تلقائيّاً",
  stateTempOpen: "مفتوحٌ مؤقّتاً",
  dayStatus: "حالة اليوم",

  // أزرار المعلّم
  approveDay: "اعتماد حضور اليوم",
  approveConfirm: "باعتمادك يُقفل حضور اليوم لحلقتك — لا رصد بعده إلا بفتحٍ. أتعتمد؟",
  approved: "اعتُمد حضور اليوم — أُقفِل.",
  requestUnlock: "طلب فتح",
  unlockReasonPrompt: "سبب طلب الفتح:",
  unlockRequested: "قُدِّم طلب الفتح — بانتظار صاحب الصلاحية.",
  lockedHint: "اليوم مقفل. لتعديل الرصد اطلب فتحه.",

  // بلا إنترنت
  offlineLockedBadge: "اليوم مقفل",
  offlineLockedHint: "رصدٌ محفوظٌ لم يُقبل (اليوم مقفل). اطلب الفتح، ثم زامِن.",

  // المدير
  adminTitle: "قفل الحضور",
  unapprovedTitle: "أيّامٌ لم يعتمدها المعلّم",
  unlockRequestsTitle: "طلبات فتح القفل",
  noUnapproved: "لا أيّامَ معلّقةٌ بلا اعتماد.",
  noRequests: "لا طلبات فتحٍ معلّقة.",
  circle: "الحلقة",
  day: "اليوم",
  reason: "السبب",
  state: "الحالة",
  approve: "فتح",
  reject: "رفض",
  rejectReasonPrompt: "سبب الرفض:",
  unlockedOk: "فُتِح اليوم.",
  rejectedOk: "رُفض الطلب — بقي اليوم مقفلاً.",

  // مهلة القفل
  graceTitle: "مهلة القفل التلقائيّ (أيّام)",
  graceHint: "اليوم يُقفل تلقائيّاً بعد انقضاء هذه المهلة بتوقيت مكّة.",
  graceSave: "حفظ المهلة",
  graceSaved: "حُفظت المهلة.",
} as const;
