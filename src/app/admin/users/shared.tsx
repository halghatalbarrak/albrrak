"use client";

import { useState } from "react";
import { Button, Input, ui, sp } from "@/components/ui";
import { tMuddakir } from "@/i18n/ar/muddakir";

export type Role =
  | "TECH_ADMIN" | "SUPER_ADMIN" | "CIRCLE_MANAGER" | "REGISTRAR"
  | "TEACHER" | "RECITER" | "ARIF" | "STUDENT" | "GUARDIAN" | "SELLER";

// ── طاقم المدّكر (و١): إسنادٌ مُحصَّرٌ في MuddakirStaff، لا دورٌ عامّ. نصوصٌ من i18n العربي. ──
export type MuddakirStaffRole = "MANAGER" | "ADMIN" | "SUPERVISOR" | "EXAMINER";
export const MUDDAKIR_STAFF: MuddakirStaffRole[] = ["MANAGER", "ADMIN", "SUPERVISOR", "EXAMINER"];
export const MUDDAKIR_STAFF_AR: Record<MuddakirStaffRole, string> = {
  MANAGER: tMuddakir("rolesWinManager"), ADMIN: tMuddakir("rolesWinAdmin"),
  SUPERVISOR: tMuddakir("rolesWinSupervisor"), EXAMINER: tMuddakir("rolesWinExaminer"),
};
export const MUDDAKIR_SECTION = tMuddakir("rolesWinSection");
export const MUDDAKIR_NO_PERM = tMuddakir("rolesWinNoPerm");
export const MUDDAKIR_SENT = tMuddakir("rolesWinSentForApproval");
export const MUDDAKIR_EXCLUSIVE = tMuddakir("rolesWinExclusive");
export const MUDDAKIR_NONE = tMuddakir("rolesWinNone");
export const MUDDAKIR_EXCESS = tMuddakir("rolesWinExcessWarn");

/** هل يجمع المستخدم اليوم وظيفة مدّكرٍ مع غيرها (دورٌ عامّ أو وظيفةٌ ثانية)؟ — تنبيه «أزل الزائد». */
export const violatesExclusivity = (roles: readonly string[], staff: readonly string[]): boolean =>
  staff.length > 0 && (roles.length > 0 || staff.length > 1);
export const toggleStaff = (list: MuddakirStaffRole[], r: MuddakirStaffRole): MuddakirStaffRole[] =>
  list.includes(r) ? list.filter((x) => x !== r) : [...list, r];

/**
 * صلاحيّة الفاعل على طاقم المدّكر (مرآةٌ للخادم؛ الخادم يحكم): مدير المنصّة (SUPER_ADMIN/
 * CIRCLE_MANAGER) أو مدير البرنامج (MANAGER) ⟵ تعيينٌ مباشر؛ والإداريّ (ADMIN) ⟵ بطلبٍ يُعتمد.
 * «مدير البرنامج» (MANAGER) لا يعيّنه إلا مدير المنصّة.
 */
export function muddakirStaffCaps(roles: string[], staff: string[]) {
  const platform = roles.includes("SUPER_ADMIN") || roles.includes("CIRCLE_MANAGER");
  const programManager = staff.includes("MANAGER");
  const manage = platform || programManager;
  const adminActor = staff.includes("ADMIN") && !manage;
  const can = (r: MuddakirStaffRole) => (r === "MANAGER" ? platform : manage || adminActor);
  return { manage, adminActor, canEdit: manage || adminActor, can };
}

// الأدوار القابلة للإسناد للكادر من الشاشة (لا STUDENT/GUARDIAN — تُنشأ بالقيد).
// SELLER صلاحيّةٌ مستقلّة (م٦ب) تُمنح لأيّ حساب كادرٍ (معلّم/إداريّ/موظّف سوق).
export const STAFF_ROLES: Role[] = ["TECH_ADMIN", "SUPER_ADMIN", "CIRCLE_MANAGER", "REGISTRAR", "TEACHER", "RECITER", "SELLER"];
export const ROLE_AR: Record<Role, string> = {
  TECH_ADMIN: "مدير تقنيّ", SUPER_ADMIN: "مشرف عام", CIRCLE_MANAGER: "مدير حلقات",
  REGISTRAR: "مُسجِّل", TEACHER: "معلّم", RECITER: "مُسمِّع", ARIF: "عريف",
  STUDENT: "طالب", GUARDIAN: "وليّ", SELLER: "أمين البيدر",
};

export const toggleIn = (list: Role[], r: Role): Role[] => (list.includes(r) ? list.filter((x) => x !== r) : [...list, r]);

/** صندوق رابطٍ مع زرّ نسخٍ جاهزٍ للّصق في واتساب. */
export function LinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: sp(2), alignItems: "center", marginTop: sp(3) }}>
      <Input readOnly value={url} style={{ flex: 1, direction: "ltr" }} onFocus={(e) => e.currentTarget.select()} />
      <Button size="sm" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>
        {copied ? "نُسخ ✓" : "نسخ"}
      </Button>
    </div>
  );
}

export const linkBoxCard: React.CSSProperties = {
  background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, padding: sp(4), marginBottom: sp(5),
};
