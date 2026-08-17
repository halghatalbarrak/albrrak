// القائمة حسب الدور (قرار محمد): لا يرى أحدٌ ما لا يخصّه. دالّةٌ نقيّةٌ قابلةٌ للاختبار.

export interface NavItem { label: string; href: string }

const MANAGER: NavItem[] = [
  { label: "الاعتمادات", href: "/admin/approvals" },
  { label: "الحلقات", href: "/admin/circles" },
  { label: "الطلاب", href: "/admin/students" },
  { label: "الطلبات", href: "/admin/applications" },
];
const TEACHER: NavItem[] = [
  { label: "الجلسة اليومية", href: "/admin/session" },
  { label: "الحصاد", href: "/admin/hasad" },
  { label: "حلقتي", href: "/admin/circles" },
  { label: "الحضور", href: "/admin/attendance" },
];
const RECITER: NavItem[] = [{ label: "الحصاد", href: "/admin/hasad" }];
const STUDENT: NavItem[] = [
  { label: "صفحتي", href: "/me" },
  { label: "السلّم البياني", href: "/programs/civil-base" },
  { label: "مراقي", href: "/programs/maraqi" },
];

/**
 * قائمة الدور: المدير/المشرف ⟵ إدارة، المعلّم ⟵ التشغيل، المُسمِّع ⟵ الحصاد،
 * والطالب/الوليّ ⟵ صفحته. الأعلى صلاحيّةً يُقدَّم (لا يُخلَط بين الأدوار).
 */
export function menuForRoles(roles: string[]): NavItem[] {
  const has = (r: string) => roles.includes(r);
  if (has("CIRCLE_MANAGER") || has("SUPER_ADMIN")) return MANAGER;
  if (has("TEACHER")) return TEACHER;
  if (has("RECITER")) return RECITER;
  return STUDENT; // الطالب/الوليّ (الافتراضيّ)
}

// ── الشريط الجانبيّ (المرحلة ٤): أقسامٌ قابلةٌ للطيّ، محكومةٌ بالدور كما هي. ──

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
