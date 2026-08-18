// أقسام الشريط الجانبيّ حسب الدور (قرار محمد): لا يرى أحدٌ ما لا يخصّه. دوالُّ نقيّةٌ قابلةٌ للاختبار.

export interface NavItem { label: string; href: string }

// ── الشريط الجانبيّ (المرحلة ٤): أقسامٌ قابلةٌ للطيّ، محكومةٌ بالدور. ──

export interface NavSection { key: string; label: string; items: NavItem[] }

/**
 * أقسام الشريط الجانبيّ (قرار محمد): التعلّم · الإدارة · التشغيل · الحصاد.
 * نفس منطق menuForRoles (الأعلى صلاحيّةً يُقدَّم، لا خلط)، لكن كلّ صفحاتِ الدور
 * تُتاح للوصول — كي «لا تُترك صفحة». المعلّم يرى قسمَي التشغيل والحصاد.
 */
export function navSections(roles: string[]): NavSection[] {
  const has = (r: string) => roles.includes(r);

  if (has("CIRCLE_MANAGER") || has("SUPER_ADMIN")) {
    return [{
      key: "manage", label: "الإدارة", items: [
        { label: "الاعتمادات", href: "/admin/approvals" },
        { label: "الطلبات", href: "/admin/applications" },
        { label: "الحلقات", href: "/admin/circles" },
        { label: "الطلاب", href: "/admin/students" },
        { label: "القوائم", href: "/admin/lists" },
        { label: "العرفاء", href: "/admin/arifs" },
        { label: "القيد", href: "/admin/enrollment" },
      ],
    }];
  }

  if (has("TEACHER")) {
    return [
      {
        key: "operate", label: "التشغيل", items: [
          { label: "الجلسة اليومية", href: "/admin/session" },
          { label: "الحضور", href: "/admin/attendance" },
          { label: "حلقتي", href: "/admin/circles" },
          { label: "العرفاء", href: "/admin/arifs" },
        ],
      },
      { key: "harvest", label: "الحصاد", items: [{ label: "الحصاد", href: "/admin/hasad" }] },
    ];
  }

  if (has("RECITER")) {
    return [{ key: "harvest", label: "الحصاد", items: [{ label: "الحصاد", href: "/admin/hasad" }] }];
  }

  return [{
    key: "learn", label: "التعلّم", items: [
      { label: "صفحتي", href: "/me" },
      { label: "السلّم البياني", href: "/programs/civil-base" },
      { label: "مراقي", href: "/programs/maraqi" },
    ],
  }];
}
