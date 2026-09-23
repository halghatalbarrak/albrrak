"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// «المسارات المُجهَّزة» انتقلت داخل صفحة برنامج مراقي (تبويب). هذا المسار القديم يحوّل إليها
// حفظًا للروابط/العادة — بلا شاشةٍ مكرّرة.
export default function TracksMovedRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/programs/maraqi?tab=tracks"); }, [router]);
  return null;
}
