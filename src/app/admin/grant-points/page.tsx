import { redirect } from "next/navigation";

// صفحة «منح النقاط» انتقلت إلى الشاشة الموحّدة (قسم «نقاط اليوم» في بطاقة الطالب).
export default function GrantPointsPage() {
  redirect("/admin/unified");
}
