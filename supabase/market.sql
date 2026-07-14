-- ============================================================
-- سوق الحلقة — تخزين دائم للمتجر بالنقاط
-- (إثراء كتالوج الجوائز + جدول الطلبات)
-- شغّله في: Supabase → SQL Editor
-- (بعد schema.sql و auth_profiles.sql و rls_policies.sql)
-- ============================================================

-- ---------- 1) إثراء جدول الجوائز بحقول الكتالوج ----------
alter table rewards add column if not exists category    text default 'gifts';
alter table rewards add column if not exists description text default '';
alter table rewards add column if not exists hot         boolean default false;

-- الكتالوج الكامل (١٢ منتجًا). لا نُحدّث stock عند التعارض حتى لا يعود المخزون المُستهلك.
insert into rewards (id,name,cost,stock,icon,category,description,hot) values
 ('r1','مصحف مجزّأ فاخر',400,5,'📗','books','مصحف بتقسيم الأجزاء وجودة طباعة عالية وغلاف فاخر — رفيقٌ للحفظ والمراجعة.',false),
 ('r2','قلم قرائي إلكتروني',650,3,'🖊️','tools','قلم يقرأ الآيات صوتيًا عند لمسها، يعين على ضبط التلاوة والحفظ.',true),
 ('r3','حقيبة الحلقة',250,8,'🎒','gifts','حقيبة عملية بشعار الحلقة لحمل المصحف والأدوات.',false),
 ('r4','بطاقة هدية مكتبة',500,4,'🎁','gifts','بطاقة شراء من مكتبة معتمدة تُصرف على الكتب والأدوات.',false),
 ('r5','وسام المواظبة',150,20,'🏅','badges','وسامٌ يُمنح للمواظبين — رمزٌ تحفيزيّ أنيق يُقتنى بفخر.',false),
 ('r6','رحلة الحلقة',800,2,'🚌','trips','رحلة ترفيهية تعليمية مع الحلقة — مقاعد محدودة.',true),
 ('r7','سجّادة صلاة فاخرة',300,10,'🕌','gifts','سجّادة ناعمة عالية الجودة بتصميم أنيق.',false),
 ('r8','سمّاعات للمراجعة',550,6,'🎧','tools','سمّاعات لسماع التلاوات والمراجعة الصوتية بوضوح عالٍ.',false),
 ('r9','كتاب سيرة مصوّر',220,12,'📚','books','سيرةٌ نبوية مصوّرة مبسّطة للناشئة.',false),
 ('r10','ساعة الطالب الرقمية',480,5,'⌚','gifts','ساعة عملية بمنبّهٍ لأوقات الحلقة والمراجعة.',false),
 ('r11','وسام الإتقان الذهبي',700,4,'🥇','badges','أرفع الأوسمة — للمتقنين بلا خطأ ولا شكّ.',false),
 ('r12','عمرة مع المشرف',1500,1,'🕋','trips','رحلة عمرة برفقة المشرف — أنفَس المكافآت. مقعدٌ واحد.',true)
on conflict (id) do update set
  name=excluded.name, cost=excluded.cost, icon=excluded.icon,
  category=excluded.category, description=excluded.description, hot=excluded.hot;

-- ---------- 2) جدول الطلبات ----------
do $$ begin
  create type order_status as enum ('pending','delivered','cancelled');  -- بانتظار/سُلّم/أُلغي
exception when duplicate_object then null; end $$;

create table if not exists orders (
  id          bigserial primary key,
  student_id  bigint references students(id) on delete cascade,
  items       jsonb not null default '[]',   -- [{id,name,ic,cost,qty}]
  total       int not null,
  status      order_status default 'pending',
  created_at  timestamptz default now()
);
create index if not exists idx_orders_student on orders(student_id);

alter table orders enable row level security;

-- ---------- 3) سياسات RLS للطلبات (متوافقة مع rls_policies.sql) ----------
-- الكادر: قراءة/كتابة كل الطلبات (اعتماد التسليم).
drop policy if exists orders_staff on orders;
create policy orders_staff on orders for all
  using (public.app_is_staff()) with check (public.app_is_staff());

-- الطالب: يقرأ ويُنشئ طلباته فقط.
drop policy if exists orders_student_sel on orders;
create policy orders_student_sel on orders for select
  using (student_id = (select student_id from public.profiles where id = auth.uid()));

drop policy if exists orders_student_ins on orders;
create policy orders_student_ins on orders for insert
  with check (student_id = (select student_id from public.profiles where id = auth.uid()));

-- وليّ الأمر: يقرأ طلبات أبنائه.
drop policy if exists orders_parent_sel on orders;
create policy orders_parent_sel on orders for select
  using (student_id in (
    select id from public.students
    where guardian_id = (select guardian_id from public.profiles where id = auth.uid())
  ));

-- تم بحمد الله
