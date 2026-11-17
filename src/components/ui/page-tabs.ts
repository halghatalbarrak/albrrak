import { navAr as L } from "@/i18n/ar/nav";
import type { TabItem } from "./Tabs";

// قوائم تبويباتٍ ثابتةٌ للصفحات المتقاربة (تنقّلٌ فقط). تُعرَض بشرط رؤية المستخدم في الصفحة.

/** الطلاب والقيد: الطلبات · الاعتمادات · القيد (كلّها للمشرف/المدير). */
export const intakeTabs: TabItem[] = [
  { label: L.tabApplications, href: "/admin/applications" },
  { label: L.tabApprovals, href: "/admin/approvals" },
  { label: L.tabEnrollment, href: "/admin/enrollment" },
];

/** الحضور: الحضور · قفل الحضور (قفل الحضور للمشرف/المدير — يُعرَض الشريط لهم). */
export const attendanceTabs: TabItem[] = [
  { label: L.tabAttendanceDaily, href: "/admin/attendance" },
  { label: L.tabAttendanceLock, href: "/admin/attendance-lock" },
];

/** مركز إعداد المُدَّكِر: ٦ تبويبات (نظرة عامّة · حفّاظ · مشرفون · مختبِرون · الإعدادات · الطلبات). */
export const muddakirTabs: TabItem[] = [
  { label: L.tabMuddakirOverview, href: "/admin/muddakir/overview" },
  { label: L.tabMuddakirHafiz, href: "/admin/muddakir" },
  { label: L.tabMuddakirSupervisors, href: "/admin/muddakir/supervisors" },
  { label: L.tabMuddakirExaminers, href: "/admin/muddakir/examiners" },
  { label: L.tabMuddakirSettings, href: "/admin/muddakir/tathbit" },
  { label: L.tabMuddakirRequests, href: "/admin/muddakir/requests" },
];
