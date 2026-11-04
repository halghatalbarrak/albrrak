// أقسام الشريط الجانبيّ حسب الدور (قرار محمد): لا يرى أحدٌ ما لا يخصّه. دوالُّ نقيّةٌ قابلةٌ للاختبار.
// النصوص من i18n (navAr). التصنيف وظيفيٌّ (لا بالدور) مع الحفاظ التامّ على رؤية كلّ دور:
// صلاحيّات الخادم لا تُمسّ — هذا تنقّلٌ فقط. الصفحات المتقاربة تُجمَع بأشرطة تبويباتٍ فوق مساراتها.

import { navAr as L } from "@/i18n/ar/nav";

export interface NavItem { label: string; href: string }
export interface NavSection { key: string; label: string; items: NavItem[] }

/**
 * أقسام الشريط الجانبيّ: مجموعاتٌ وظيفيّةٌ قابلةٌ للطيّ، بترتيبٍ ثابت:
 * الرئيسية · التشغيل اليوميّ · الحلقات والحضور · الطلاب والقيد · التقييم والاختبارات ·
 * التحفيز · المناهج · المُدَّكِر · الإعدادات — ثمّ أقسام الأدوار المُحصَّرة (طاقم المُدَّكِر،
 * البائع) وأقسام الطالب/الوليّ (التعلّم · الرسائل). المجموعة الفارغة لدور المستخدم تُخفى.
 */
export function navSections(roles: string[], muddakirStaff: string[] = []): NavSection[] {
  const hasStaff = (r: string) => muddakirStaff.includes(r);
  if (roles.length === 0 && muddakirStaff.length === 0) return [];
  const has = (r: string) => roles.includes(r);
  const supervises = has("SUPER_ADMIN") || has("CIRCLE_MANAGER");
  const managesUsers = has("SUPER_ADMIN") || has("TECH_ADMIN");
  const teacher = has("TEACHER");
  const reciter = has("RECITER");
  const seesPrograms = supervises || teacher || reciter || has("STUDENT");
  // أدوارٌ عامّةٌ تشغيليّة/إداريّة ترى «الرئيسية» (لا الطالب/الوليّ/البائع الصرف، ولا طاقم المدّكر المُحصَّر).
  const generalStaff = supervises || teacher || reciter || managesUsers;

  const sections: NavSection[] = [];
  const push = (key: string, label: string, items: NavItem[]) => { if (items.length) sections.push({ key, label, items }); };

  // ١. الرئيسية
  if (generalStaff) push("home", L.grpHome, [{ label: L.home, href: "/" }]);

  // ٢. التشغيل اليوميّ — المعلّم والمشرف/المدير.
  if (teacher || supervises) {
    push("operate", L.grpOperate, [
      { label: L.unified, href: "/admin/unified" },
      { label: L.session, href: "/admin/session" },
      { label: L.grantPoints, href: "/admin/grant-points" },
    ]);
  }

  // ٣. الحلقات والحضور — المعلّم والمشرف/المدير. (قفل الحضور تبويبٌ داخل صفحة الحضور، للمشرف.)
  if (teacher || supervises) {
    push("circles", L.grpCircles, [
      { label: supervises ? L.circles : L.circlesMine, href: "/admin/circles" },
      { label: L.attendance, href: "/admin/attendance" },
      { label: L.arifs, href: "/admin/arifs" },
    ]);
  }

  // ٤. الطلاب والقيد — المشرف/المدير. (الطلبات/الاعتمادات/القيد تبويباتٌ فوق مساراتها.)
  if (supervises) {
    const items: NavItem[] = [
      { label: L.students, href: "/admin/students" },
      { label: L.applications, href: "/admin/applications" },
    ];
    if (has("SUPER_ADMIN")) items.push({ label: L.studentsImport, href: "/admin/students/import" });
    push("students", L.grpStudents, items);
  }

  // ٥. التقييم والاختبارات — المعلّم والمُسمِّع والمشرف/المدير.
  if (teacher || reciter || supervises) {
    push("assess", L.grpAssess, [
      { label: L.hasad, href: "/admin/hasad" },
      { label: L.stageExam, href: "/admin/stage-exam" },
    ]);
  }

  // ٦. التحفيز — المشرف/المدير.
  if (supervises) {
    push("motivate", L.grpMotivate, [
      { label: L.economy, href: "/admin/economy" },
      { label: L.market, href: "/admin/market" },
      { label: L.gamification, href: "/admin/gamification" },
      { label: L.display, href: "/admin/display" },
    ]);
  }

  // ٧. المناهج — المنهج المشترك، يراه كلّ ذي دور.
  if (seesPrograms) {
    push("programs", L.grpPrograms, [
      { label: L.civilBase, href: "/programs/civil-base" },
      { label: L.maraqi, href: "/programs/maraqi" },
    ]);
  }

  // ٨. المُدَّكِر — المشرف/المدير (البرنامج/الطلبات/الطاقم تبويباتٌ فوق مساراتها).
  if (supervises) {
    push("muddakir", L.grpMuddakir, [
      { label: L.muddakirProgram, href: "/admin/muddakir" },
      { label: L.muddakirRequests, href: "/admin/muddakir/requests" },
      { label: L.muddakirStaff, href: "/admin/muddakir/staff" },
      { label: L.muddakirTathbit, href: "/admin/muddakir/tathbit" },
      { label: L.muddakirMeeting, href: "/muddakir/supervisor" },
      { label: L.muddakirRecitation, href: "/muddakir/recitation" },
    ]);
  }

  // ٩. الإعدادات — القوائم (المشرف/المدير) والمستخدمون (المشرف/التقنيّ).
  {
    const items: NavItem[] = [];
    if (supervises) items.push({ label: L.lists, href: "/admin/lists" });
    if (managesUsers) items.push({ label: L.users, href: "/admin/users" });
    push("settings", L.grpSettings, items);
  }

  // ── أقسام الأدوار المُحصَّرة (طاقم المُدَّكِر بلا دورٍ عامّ، §٢) ──
  if ((hasStaff("MANAGER") || hasStaff("ADMIN")) && !supervises) {
    const items: NavItem[] = [
      { label: L.muddakirHifazi, href: "/admin/muddakir" },
      { label: hasStaff("MANAGER") ? L.muddakirRequests : L.muddakirMyRequests, href: "/admin/muddakir/requests" },
    ];
    if (hasStaff("MANAGER")) items.push({ label: L.muddakirStaff, href: "/admin/muddakir/staff" });
    items.push({ label: L.muddakirTathbit, href: "/admin/muddakir/tathbit" });
    if (hasStaff("MANAGER")) {
      items.push({ label: L.muddakirMeeting, href: "/muddakir/supervisor" });
      items.push({ label: L.muddakirRecitation, href: "/muddakir/recitation" });
    }
    push("muddakirAdmin", L.grpMuddakirAdmin, items);
  }
  if ((has("ARIF") || hasStaff("SUPERVISOR")) && !supervises) {
    push("muddakir", L.grpMuddakir, [
      { label: L.muddakirHifazi, href: "/admin/muddakir" },
      { label: L.muddakirWeekly, href: "/muddakir/supervisor" },
    ]);
  }
  if ((reciter || hasStaff("EXAMINER")) && !supervises) {
    push("muddakirExam", L.grpMuddakirExam, [{ label: L.muddakirRecitation, href: "/muddakir/recitation" }]);
  }

  // ── البائع (م٦ب): نقطة بيع البيدر وحدها ──
  if (has("SELLER")) push("market", L.grpMarket, [{ label: L.sell, href: "/sell" }]);

  // ── الطالب والوليّ ──
  if (has("STUDENT")) {
    push("learn", L.grpLearn, [
      { label: L.myPage, href: "/me" },
      { label: L.myJourney, href: "/me/journey" },
    ]);
  }
  if (has("STUDENT") || has("GUARDIAN")) push("messages", L.grpMessages, [{ label: L.messages, href: "/messages" }]);

  return sections;
}
