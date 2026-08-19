// أقسام الشريط الجانبيّ حسب الدور (قرار محمد): لا يرى أحدٌ ما لا يخصّه. دوالُّ نقيّةٌ قابلةٌ للاختبار.

export interface NavItem { label: string; href: string }

// ── الشريط الجانبيّ (المرحلة ٤): أقسامٌ قابلةٌ للطيّ، محكومةٌ بالدور. ──

export interface NavSection { key: string; label: string; items: NavItem[] }

/**
 * أقسام الشريط الجانبيّ (قرار محمد): **اتّحاد** أقسام كلّ أدوار المستخدم — لا «أعلى
 * دورٍ يفوز». الترتيب ثابت: الإدارة · التشغيل · الحصاد · البرامج · التعلّم · الرسائل.
 * لا يُسقط دورٌ دوراً. ومن لا دور له (لم يصل بعد) ⟵ [] (منع وميض شريط الطالب).
 *
 * المشرف العام والمدير يريان **كلّ** أقسام العمل (الإدارة والتشغيل والحصاد)، لأنّ من
 * يشرف على الحلقات يحتاج أن يرى ما يراه المعلّم ليتابع ويسدّ الغياب. هذا **عرضٌ** فقط
 * — الصلاحيّات الفعليّة (حرّاس الخادم) لا تُمسّ. و«الرسائل» يراها الطالب ووليّ الأمر.
 *
 * «البرامج» (المنهج لا بيانات شخص) يراه كلّ ذي دورٍ في المنصّة — المشرف والمدير
 * والمعلّم والمُسمِّع والطالب — لأنّه سلالم القاعدة المدنية ومراقي المشتركة. أمّا
 * «صفحتي» فتبقى في «التعلّم» للطالب وحده — فهي شاشته عن نفسه، لا معنى لها للمشرف.
 */
export function navSections(roles: string[]): NavSection[] {
  if (roles.length === 0) return [];
  const has = (r: string) => roles.includes(r);
  const supervises = has("SUPER_ADMIN") || has("CIRCLE_MANAGER");
  // كلّ ذي دورٍ حقيقيٍّ في المنصّة يرى المنهج؛ الوليّ الصرف (رسائل فقط) لا يراه.
  const seesPrograms = supervises || has("TEACHER") || has("RECITER") || has("STUDENT");

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

  // البرامج — المنهج المشترك (سلالم القاعدة المدنية ومراقي)، يراه كلّ ذي دور.
  // القاعدة المدنية أوّلاً (المسار التربويّ)، ثمّ مراقي (سلّمه تنازليٌّ: الناس أوّلاً).
  if (seesPrograms) {
    sections.push({
      key: "programs", label: "البرامج", items: [
        { label: "القاعدة المدنية", href: "/programs/civil-base" },
        { label: "مراقي", href: "/programs/maraqi" },
      ],
    });
  }

  // التعلّم — الطالب وحده (صفحته عن نفسه). «صفحتي» لا معنى لها للمشرف.
  if (has("STUDENT")) {
    sections.push({
      key: "learn", label: "التعلّم", items: [
        { label: "صفحتي", href: "/me" },
      ],
    });
  }

  // الرسائل — الطالب ووليّ الأمر (لا تُحبس في قسم واحد). وليٌّ صرفٌ ⟵ هذا القسم وحده.
  if (has("STUDENT") || has("GUARDIAN")) {
    sections.push({ key: "messages", label: "الرسائل", items: [{ label: "الرسائل", href: "/messages" }] });
  }

  return sections;
}
