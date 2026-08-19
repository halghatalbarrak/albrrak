// أقسام الشريط الجانبيّ حسب الدور (قرار محمد): لا يرى أحدٌ ما لا يخصّه. دوالُّ نقيّةٌ قابلةٌ للاختبار.

export interface NavItem { label: string; href: string }

// ── الشريط الجانبيّ (المرحلة ٤): أقسامٌ قابلةٌ للطيّ، محكومةٌ بالدور. ──

export interface NavSection { key: string; label: string; items: NavItem[] }

/**
 * أقسام الشريط الجانبيّ (قرار محمد): **اتّحاد** أقسام كلّ أدوار المستخدم — لا «أعلى
 * دورٍ يفوز». الترتيب ثابت: الإدارة · التشغيل · الحصاد · التعلّم · الرسائل. لا يُسقط
 * دورٌ دوراً. ومن لا دور له (لم يصل بعد) ⟵ [] (منع وميض شريط الطالب).
 *
 * المشرف العام والمدير يريان **كلّ** أقسام العمل (الإدارة والتشغيل والحصاد)، لأنّ من
 * يشرف على الحلقات يحتاج أن يرى ما يراه المعلّم ليتابع ويسدّ الغياب. هذا **عرضٌ** فقط
 * — الصلاحيّات الفعليّة (حرّاس الخادم) لا تُمسّ. و«الرسائل» يراها الطالب ووليّ الأمر.
 */
export function navSections(roles: string[]): NavSection[] {
  if (roles.length === 0) return [];
  const has = (r: string) => roles.includes(r);
  const supervises = has("SUPER_ADMIN") || has("CIRCLE_MANAGER");

  const sections: NavSection[] = [];

  // الإدارة — المدير والمشرف العام.
  if (supervises) {
    sections.push({
      key: "manage", label: "الإدارة", items: [
        { label: "الاعتمادات", href: "/admin/approvals" },
        { label: "الطلبات", href: "/admin/applications" },
        { label: "الحلقات", href: "/admin/circles" },
        { label: "الطلاب", href: "/admin/students" },
        { label: "القوائم", href: "/admin/lists" },
        { label: "العرفاء", href: "/admin/arifs" },
        { label: "القيد", href: "/admin/enrollment" },
      ],
    });
  }

  // التشغيل — المعلّم؛ والمشرف/المدير (يرى ما يراه المعلّم ليتابع ويسدّ الغياب).
  if (has("TEACHER") || supervises) {
    sections.push({
      key: "operate", label: "التشغيل", items: [
        { label: "الجلسة اليومية", href: "/admin/session" },
        { label: "الحضور", href: "/admin/attendance" },
        { label: "حلقتي", href: "/admin/circles" },
        { label: "العرفاء", href: "/admin/arifs" },
      ],
    });
  }

  // الحصاد — المعلّم والمُسمِّع؛ والمشرف/المدير.
  if (has("TEACHER") || has("RECITER") || supervises) {
    sections.push({ key: "harvest", label: "الحصاد", items: [{ label: "الحصاد", href: "/admin/hasad" }] });
  }

  // التعلّم — الطالب (صفحاته الشخصيّة).
  if (has("STUDENT")) {
    sections.push({
      key: "learn", label: "التعلّم", items: [
        { label: "صفحتي", href: "/me" },
        { label: "السلّم البياني", href: "/programs/civil-base" },
        { label: "مراقي", href: "/programs/maraqi" },
      ],
    });
  }

  // الرسائل — الطالب ووليّ الأمر (لا تُحبس في قسم واحد). وليٌّ صرفٌ ⟵ هذا القسم وحده.
  if (has("STUDENT") || has("GUARDIAN")) {
    sections.push({ key: "messages", label: "الرسائل", items: [{ label: "الرسائل", href: "/messages" }] });
  }

  return sections;
}
