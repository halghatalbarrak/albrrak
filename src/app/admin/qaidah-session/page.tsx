"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// جلسة القاعدة المدنية دُمجت في «الشاشة الموحّدة» (م ج) — لوحة الطالب فيها تعرض الباب والدرس
// الحاليّ وأزرار متقن/غير متقن/مؤجَّل. هذا المسار القديم يحوّل إليها حفظًا للروابط/العادة (كنمط
// /admin/tracks). مسارات الـAPI (api/circles|students/[id]/qaidah-session · api/me/qaidah) باقية.
export default function QaidahSessionMovedRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/unified"); }, [router]);
  return null;
}
