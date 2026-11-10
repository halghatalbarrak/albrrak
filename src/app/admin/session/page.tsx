import { redirect } from "next/navigation";

// /admin/session اندمجت في الشاشة الموحّدة (عرض البطاقات).
export default function SessionRedirectPage() {
  redirect("/admin/unified?view=cards");
}
