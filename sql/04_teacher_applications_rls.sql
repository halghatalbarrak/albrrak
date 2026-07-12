-- ============================================================
--  أمان الصفوف (RLS) لجدول طلبات توظيف المعلمين
--  المبدأ:
--    • التقديم (INSERT) متاح للعموم (رابط عام بلا تسجيل دخول) — anon + authenticated.
--    • القراءة/المراجعة/التحديث للكادر المخوّل فقط (بيانات هوية حسّاسة — PDPL).
--  شغّله بعد: 01 و 02 و 03 (يعتمد على الدالة public.app_is_staff()).
-- ============================================================

alter table public.teacher_applications enable row level security;

-- ---------- التقديم العام: أي زائر يُرسل طلبه ----------
drop policy if exists tapps_public_insert on public.teacher_applications;
create policy tapps_public_insert on public.teacher_applications
  for insert to anon, authenticated
  with check (true);

-- ---------- القراءة: الكادر فقط (مشرف/معلم/إداري/مُسمِّع ومُفعَّل) ----------
drop policy if exists tapps_staff_read on public.teacher_applications;
create policy tapps_staff_read on public.teacher_applications
  for select using (public.app_is_staff());

-- ---------- التحديث (مراجعة الحالة لاحقاً): الكادر فقط ----------
drop policy if exists tapps_staff_update on public.teacher_applications;
create policy tapps_staff_update on public.teacher_applications
  for update using (public.app_is_staff()) with check (public.app_is_staff());

-- ---------- الحذف: الإداري فقط (مشرف عام/إداري مُفعَّل) ----------
drop policy if exists tapps_admin_delete on public.teacher_applications;
create policy tapps_admin_delete on public.teacher_applications
  for delete using (public.app_is_admin());

-- ملاحظة أمنية: التقديم المفتوح للعموم قد يتعرّض لإرسالٍ آلي (spam)؛
-- يُنصح لاحقاً بإضافة تحقّق بشري (captcha) أو حدّ معدّل على مستوى الحافة (edge).
-- تم بحمد الله
