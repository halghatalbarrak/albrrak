// توحيد صيغة الجوال السعوديّ — دالّةٌ نقيّة (تصلح للعميل والخادم، بلا تبعيّات).
// تُوحَّد الصيغ المختلفة لنفس الرقم (05XXXXXXXX · +9665XXXXXXXX · 009665… · 5XXXXXXXX) فلا
// يتكرّر الحساب خفيةً. المرجع: علّة إنشاء المستخدم (05… مقابل +9665…).

/** أرقام E.164 بلا «+» (9665XXXXXXXX) للسعوديّ؛ وغير المعروف يُترك أرقاماً كما هو. */
export function normalizeSaudiPhone(phone: string): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2); // بادئة دوليّة 00
  if (d.startsWith("966")) return d; // دوليّ أصلاً
  if (d.startsWith("0") && d.length === 10 && d[1] === "5") return "966" + d.slice(1); // محليّ 05XXXXXXXX
  if (d.startsWith("5") && d.length === 9) return "966" + d; // بلا صفرٍ ولا مفتاح
  return d; // غير معروف الصيغة — يُترك كما هو
}

/** البريد الاصطناعيّ من الصيغة الموحّدة (الهويّة المعتمدة للحسابات الجديدة). */
export const canonicalEmail = (phone: string): string => `u${normalizeSaudiPhone(phone)}@albrrak.app`;

/** البريد الاصطناعيّ من الأرقام الخام (صيغة الحسابات القديمة قبل التوحيد). */
export const legacyEmail = (phone: string): string => `u${(phone ?? "").replace(/\D/g, "")}@albrrak.app`;

/** صيغتا البريد (الموحّد والخام) — للمقارنة التي تقبل القديم والجديد بلا تغيير المخزَّن. */
export const emailVariants = (phone: string): string[] => [...new Set([canonicalEmail(phone), legacyEmail(phone)])];

/**
 * صيغة العرض الموحّدة للواجهة — تُظهر السعوديّ بـ+9665XXXXXXXX مهما كانت صيغة تخزينه
 * (05… · 9665… بلا + · 009665… · 5…)، بلا تغيير المخزَّن. غير المعروف يُعرض كما هو.
 * دالّةٌ واحدةٌ يمرّ بها كلّ عرض جوالٍ في الواجهة.
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return "";
  const canon = normalizeSaudiPhone(phone); // 9665XXXXXXXX للسعوديّ
  return canon.startsWith("966") ? `+${canon}` : phone;
}
