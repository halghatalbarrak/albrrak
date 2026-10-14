// وجهة الدخول لمستخدمٍ بلا دورٍ عامّ لكنه يحمل وظيفة مدّكر (و١).
// مَن له دورٌ عامّ يذهب إلى اللوحة الرئيسة (null). ومَن لا دورَ عامّ له يُوجَّه إلى واجهة المدّكر التي
// تقبلها صلاحيّته (requireMuddakir)، فلا يرى صفحةً فارغة أو «لا صلاحية». يطابق منطق muddakirCaps.

/** المسار الذي يُوجَّه إليه المستخدم عند الدخول، أو null للوحة الرئيسة الاعتياديّة. */
export function muddakirLanding(roles: readonly string[], muddakirStaff: readonly string[]): string | null {
  if (roles.length > 0) return null; // له دورٌ عامّ ⟵ اللوحة الرئيسة
  if (muddakirStaff.length === 0) return null; // لا دورَ ولا وظيفة ⟵ لا توجيه خاصّ

  const manage = muddakirStaff.includes("MANAGER");
  const supervise = manage || muddakirStaff.includes("SUPERVISOR");
  const examine = manage || muddakirStaff.includes("EXAMINER");

  if (supervise) return "/muddakir/supervisor"; // المدير/المشرف: لوحة المشرف
  if (examine) return "/muddakir/recitation"; // المختبِر: لوحة التسميع
  return "/muddakir/supervisor"; // الإداريّ (view): لوحة المدّكر
}
