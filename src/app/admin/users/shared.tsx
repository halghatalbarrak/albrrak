"use client";

import { useState } from "react";
import { Button, Input, ui, sp } from "@/components/ui";

export type Role =
  | "TECH_ADMIN" | "SUPER_ADMIN" | "CIRCLE_MANAGER" | "REGISTRAR"
  | "TEACHER" | "RECITER" | "ARIF" | "STUDENT" | "GUARDIAN" | "SELLER";

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
