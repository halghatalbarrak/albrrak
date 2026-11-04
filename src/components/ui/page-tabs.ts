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

/** المُدَّكِر: البرنامج · الطلبات · الطاقم (يُعرَض الشريط للمشرف/المدير). */
export const muddakirTabs: TabItem[] = [
  { label: L.tabMuddakirProgram, href: "/admin/muddakir" },
  { label: L.tabMuddakirRequests, href: "/admin/muddakir/requests" },
  { label: L.tabMuddakirStaff, href: "/admin/muddakir/staff" },
];
