import { Role } from "@prisma/client";

// ═══ الصلاحيات القابلة للتفويض (DESIGN §٣٫٣ و§٣٫٤) ═══
// الأصل: الصلاحية للمدير (CIRCLE_MANAGER)، وله أن يفوّضها لدورٍ آخر — لا لفرد.
// كل قيمة سطرٌ في جدول PermissionDelegation.capability.
export const CAPABILITIES = [
  "ABSENCE_EXCUSE", // قبول العذر / الاستئذان
  "TRACK_PROMOTION", // اقتراح ترقية المسار
  "TRACK_DEMOTION", // اقتراح خفض المسار
  "READY_DECLARATION", // إعلان الجاهزية للحصاد
] as const;

export type Capability = (typeof CAPABILITIES)[number];

// الأدوار التي تملك الصلاحية أصالةً بلا تفويض (DESIGN §٣٫٣: أصلها للمدير).
// SUPER_ADMIN مطلق. CIRCLE_MANAGER أصل الصلاحيات.
export const CAPABILITY_ORIGIN_ROLES: readonly Role[] = [
  Role.SUPER_ADMIN,
  Role.CIRCLE_MANAGER,
];

// ═══ من يملك قراءة رقم الهوية بالنص الصريح (م٥ + DESIGN §٦٫١) ═══
// المُسجِّل يُدخل الهوية عند القيد؛ المدير والمشرف كادرٌ إداري.
// المعلم/المُسمِّع/العريف/الطالب/الولي ⟵ ممنوعون (اختبار القبول: معلم يستعلم ← يُرفض).
// ملاحظة: مجموعة مبدئية مشتقّة من التصميم؛ تُراجَع إن حدّد محمد كادرًا أضيق/أوسع.
export const NATIONAL_ID_VIEWER_ROLES: readonly Role[] = [
  Role.SUPER_ADMIN,
  Role.CIRCLE_MANAGER,
  Role.REGISTRAR,
];
