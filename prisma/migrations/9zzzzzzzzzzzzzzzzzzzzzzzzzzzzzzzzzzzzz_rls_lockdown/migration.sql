-- إقفال أمنيّ: تفعيل RLS على كل جداول public، وسحب صلاحيّات anon/authenticated.
-- السبب: مفتاح anon عامٌّ في المتصفّح، وواجهة PostgREST متاحةٌ لحامله؛ فأيّ جدولٍ
-- بلا RLS مكشوفٌ للقراءة/الكتابة. التطبيق لا يقرأ عبر supabase-js إلا المصادقة،
-- فلا يلزم أيّ سياسة. دور الاتّصال (postgres) مالكٌ/BYPASSRLS فلا يتأثّر Prisma.
-- كلّه آمنٌ عند إعادة التنفيذ (idempotent) ولا يحذف شيئًا. لا FORCE ولا CREATE POLICY.

-- (أ) تفعيل RLS على كل جدول public لم تُفعَّل عليه بعد — بـquote_ident (format %I).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
       AND NOT rowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END
$$;

-- (ب)+(ج) سحب الصلاحيّات وامتيازاتِ الافتراض عن anon/authenticated.
-- يُلفّ في كتلة DO تتحقّق من وجود الدورين أوّلًا؛ فقاعدة اختبارات CI (embedded-postgres)
-- لا تملكهما، فتُتخطّى الأوامرُ بلا فشل. REVOKE وALTER DEFAULT PRIVILEGES كلاهما آمنٌ
-- عند التكرار (سحبُ ما لا يُملَك لا يُخطئ).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    -- (ب) سحب الصلاحيّات القائمة.
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';
    -- (ج) سحب امتيازات الافتراض (للكائنات التي يُنشئها postgres لاحقًا).
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
  END IF;
END
$$;
