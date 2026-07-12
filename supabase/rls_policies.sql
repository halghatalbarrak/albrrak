-- ============================================================
-- سياسات أمان الصفوف (RLS) الإنتاجية — بالأدوار (RBAC)
-- منصة حلقات الشيخ محمد البراك — مطابقة لمصفوفة الصلاحيات (SRS 5.4)
-- وحماية بيانات القُصّر (PDPL — SRS 3.3 / 10).
-- ------------------------------------------------------------
-- شغّل هذا الملف في: Supabase → SQL Editor  (بعد schema.sql و auth_profiles.sql)
-- يُبطِل السياسات المفتوحة (using(true)) ويستبدلها بسياسات مبنية على الدور.
--
-- المبدأ الحاكم:
--   • لا وصول إطلاقاً لغير المُصادَقين (anon) — يُغلق تسريب بيانات القُصّر.
--   • الكادر (مشرف عام/مدير/معلم/مُسمِّع) يُشغّل الجداول التشغيلية.
--   • وليّ الأمر يقرأ أبناءه فقط، والطالب يقرأ سجلّه فقط.
--   • لا يستطيع أحدٌ ترقية دوره بنفسه (منع تصعيد الصلاحيات).
-- ============================================================

-- ---------- دوال مساعدة (SECURITY DEFINER لتفادي التكرار مع RLS) ----------
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.app_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid())
      in ('general','admin','teacher','examiner'),
    false)
$$;

create or replace function public.app_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('general','admin'),
    false)
$$;

-- ---------- إزالة السياسات المفتوحة القديمة ----------
do $$
declare t text;
begin
  foreach t in array array['circles','guardians','teachers','students','courses','sessions',
                           'mistakes','points','payments','waitlist','harvest','rewards','audit_log']
  loop
    execute format('drop policy if exists p_all on %I;', t);
  end loop;
end $$;

-- ============================================================
-- الجداول التشغيلية: وصولٌ كاملٌ للكادر المُصادَق فقط
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['circles','teachers','courses','sessions','mistakes',
                           'points','waitlist','harvest','rewards','audit_log']
  loop
    execute format('drop policy if exists staff_all on %I;', t);
    execute format(
      'create policy staff_all on %I for all
         using (public.app_is_staff()) with check (public.app_is_staff());', t);
  end loop;
end $$;

-- ============================================================
-- الطلاب: الكادر كامل · وليّ الأمر يقرأ أبناءه · الطالب يقرأ نفسه
-- ============================================================
drop policy if exists students_staff on students;
create policy students_staff on students for all
  using (public.app_is_staff()) with check (public.app_is_staff());

drop policy if exists students_parent_read on students;
create policy students_parent_read on students for select
  using (guardian_id = (select guardian_id from public.profiles where id = auth.uid()));

drop policy if exists students_self_read on students;
create policy students_self_read on students for select
  using (id = (select student_id from public.profiles where id = auth.uid()));

-- ============================================================
-- أولياء الأمور (بيانات حسّاسة): الكادر فقط + الوليّ يقرأ سجلّه
-- ============================================================
drop policy if exists guardians_staff on guardians;
create policy guardians_staff on guardians for all
  using (public.app_is_staff()) with check (public.app_is_staff());

drop policy if exists guardians_self on guardians;
create policy guardians_self on guardians for select
  using (id = (select guardian_id from public.profiles where id = auth.uid()));

-- ============================================================
-- المدفوعات: الكادر يقرأ الكل ويكتب · أي مُصادَق يسجّل دفعته (FR-PAR-02)
-- ============================================================
drop policy if exists payments_staff on payments;
create policy payments_staff on payments for all
  using (public.app_is_staff()) with check (public.app_is_staff());

drop policy if exists payments_auth_insert on payments;
create policy payments_auth_insert on payments for insert
  with check (auth.uid() is not null);

-- ============================================================
-- الجوائز (سوق الحلقة): قراءةٌ لأي مُصادَق · تعديلٌ للكادر فقط
-- ============================================================
drop policy if exists rewards_read on rewards;
create policy rewards_read on rewards for select
  using (auth.uid() is not null);

-- ============================================================
-- جدول الملفات (profiles): منع تصعيد الصلاحيات
-- ============================================================
-- الكادر الإداري يدير كل الملفات (منح الأدوار وربط الطلاب/الأولياء).
drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles for all
  using (public.app_is_admin()) with check (public.app_is_admin());

-- المستخدم يقرأ ملفه، ويُنشئه بدور غير مميّز فقط، ويُحدّثه (مع منع تغيير الدور عبر Trigger).
drop policy if exists p_profile_self on profiles;      -- من auth_profiles.sql
drop policy if exists p_profile_read on profiles;       -- من auth_profiles.sql
drop policy if exists profiles_self_select on profiles;
create policy profiles_self_select on profiles for select
  using (auth.uid() = id);

drop policy if exists profiles_self_insert on profiles;
create policy profiles_self_insert on profiles for insert
  with check (auth.uid() = id and role in ('parent','student'));

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Trigger يمنع تغيير الدور إلا من إداري (أو من سياق الخادم/SQL أثناء التهيئة).
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and NEW.role is distinct from OLD.role then
    -- auth.uid() فارغٌ في محرّر SQL (تهيئة أول مشرف) → يُسمح؛ ومن المتصفّح يجب أن يكون إدارياً.
    if auth.uid() is not null
       and not coalesce((select role from public.profiles where id = auth.uid()) in ('general','admin'), false)
    then
      raise exception 'تغيير الدور غير مسموح — يُمنح الدور من مشرفٍ إداري فقط';
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_guard_profile_role on profiles;
create trigger trg_guard_profile_role
  before update on profiles
  for each row execute function public.guard_profile_role();

-- ============================================================
-- تهيئة أول مشرف عام (شغّلها مرّة واحدة بعد تسجيل حسابك، وضع جوالك):
--   update public.profiles set role = 'general'
--   where id = (select id from auth.users where email = 'u<أرقام جوالك>@albrrak.app');
--
-- ملاحظات إنتاجية (موثّقة عمداً):
--   • الداعم/الكافل (sponsor) لا يصل لبيانات الطلاب الحسّاسة؛ تقارير الأثر
--     تُبنى لاحقاً على View مُجمّع بلا بيانات شخصية (FR-SPN-01 / PDPL).
--   • ربط الطالب بالوليّ يتم بتعبئة profiles.guardian_id / student_id من الإداري.
-- ============================================================

-- تم بحمد الله
