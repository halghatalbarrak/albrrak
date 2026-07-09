-- ============================================================
-- منصة حلقات الشيخ محمد البراك — مخطط قاعدة البيانات (Supabase / PostgreSQL)
-- مبنيٌّ على نموذج البيانات في وثيقة SRS 4.0 (القسم 11)
-- شغّل هذا الملف في: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ---------- الأنواع (Enums) ----------
do $$ begin
  create type student_status  as enum ('tajribi','active','excused','interrupted','graduated','deleted');
  create type course_type      as enum ('new','review','consolidate','link');       -- جديد/مراجعة/تثبيت/ربط
  create type mistake_type     as enum ('lafzi','adi','shak');                        -- لفظي/عادي/شكّ
  create type session_perf     as enum ('itqan','jayyid','needs_review');            -- متقن/جيّد/يحتاج مراجعة
  create type sync_state       as enum ('local','synced');                            -- Offline-first
  create type payment_kind     as enum ('fees','donation','prize');                   -- رسوم/تبرّع/جائزة
  create type payment_status   as enum ('success','failed','refunded');
  create type waitlist_status  as enum ('pending','accepted','rejected');
  create type harvest_status   as enum ('pending','passed','repeat');
exception when duplicate_object then null; end $$;

-- ---------- الحلقات ----------
create table if not exists circles (
  id          text primary key,
  name        text not null,
  mosque      text,
  teacher     text,
  capacity    int default 50,
  created_at  timestamptz default now()
);

-- ---------- أولياء الأمور ----------
create table if not exists guardians (
  id          text primary key,
  name        text not null,
  phone       text,          -- حسّاس
  created_at  timestamptz default now()
);

-- ---------- المعلمون ----------
create table if not exists teachers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  specialty   text,
  circle_id   text references circles(id),
  created_at  timestamptz default now()
);

-- ---------- الطلاب ----------
create table if not exists students (
  id            bigserial primary key,
  full_name     text not null,
  birth_date    date,
  national_id   text,          -- حسّاس (PDPL)
  mobile        text,          -- حسّاس
  age           int,
  guardian_id   text references guardians(id),
  circle_id     text references circles(id),
  program       text,          -- معارج/مراقي/مُذّكِر
  riwaya        text default 'حفص',
  last_stop_surah int,
  last_stop_ayah  int,
  daily_target  int default 8,
  points        int default 0,
  streak        int default 0,
  status        student_status default 'active',
  created_at    timestamptz default now()
);

-- ---------- المقررات ----------
create table if not exists courses (
  id            bigserial primary key,
  student_id    bigint references students(id) on delete cascade,
  type          course_type not null,
  unit          text,          -- سطر/وجه
  daily_target  int,
  last_stop_ayah int,
  direction     text,          -- اتجاه التسميع
  created_at    timestamptz default now()
);

-- ---------- جلسات التسميع ----------
create table if not exists sessions (
  id            bigserial primary key,
  student_id    bigint references students(id) on delete cascade,
  course_id     bigint references courses(id),
  session_date  timestamptz default now(),
  start_ayah    int,
  stop_ayah     int,
  achieved_lines int,
  performance   session_perf,
  attendance    text,          -- حاضر/متأخر/مستأذن/غائب
  itqan         boolean default false,
  sync_state    sync_state default 'synced',
  teacher_id    uuid references teachers(id)
);

-- ---------- الأخطاء ----------
create table if not exists mistakes (
  id            bigserial primary key,
  session_id    bigint references sessions(id) on delete cascade,
  ayah_id       int,
  type          mistake_type not null,
  required_reps int not null,     -- 100 / 45 / 20 (SRS 7.3)
  remaining_reps int,
  resolved      boolean default false,
  created_at    timestamptz default now()
);

-- ---------- النقاط ----------
create table if not exists points (
  id             bigserial primary key,
  student_id     bigint references students(id) on delete cascade,
  value          int not null,             -- موجب كسب / سالب صرف
  reason         text not null,            -- شفافية سبب الكسب/الصرف
  source_event   text,                     -- الحدث النظامي الموثّق (كشف تلاعب)
  created_at     timestamptz default now()
);

-- ---------- الدفعات والتبرّعات ----------
create table if not exists payments (
  id            bigserial primary key,
  payer         text not null,
  amount        numeric(10,2) not null,
  kind          payment_kind not null,
  target        text,
  gateway_ref   text,          -- مرجع المزوّد (لا بيانات بطاقة)
  status        payment_status default 'success',
  created_at    timestamptz default now()
);

-- ---------- قائمة الانتظار ----------
create table if not exists waitlist (
  id            bigserial primary key,
  full_name     text not null,
  age           int,
  phone         text,
  status        waitlist_status default 'pending',
  applied_at    timestamptz default now()
);

-- ---------- الحصاد ----------
create table if not exists harvest (
  id            bigserial primary key,
  student_id    bigint references students(id) on delete cascade,
  scope         text,
  parts         int,
  status        harvest_status default 'pending',
  note          text,
  examiner      text,
  created_at    timestamptz default now()
);

-- ---------- الجوائز (سوق الحلقة) ----------
create table if not exists rewards (
  id            text primary key,
  name          text not null,
  cost          int not null,
  stock         int default 0,
  icon          text
);

-- ---------- سجل التدقيق ----------
create table if not exists audit_log (
  id            bigserial primary key,
  actor         text not null,     -- الفاعل
  action        text not null,     -- الإجراء
  created_at    timestamptz default now()
);

-- ============================================================
-- أمان الصفوف (Row Level Security) — يُفعّل ويُضبط لاحقاً بالأدوار (RBAC)
-- في هذه المرحلة نسمح للقراءة/الكتابة عبر مفتاح anon للنموذج،
-- ويُشدَّد لاحقاً حسب مصفوفة الصلاحيات (SRS 5.4) وحماية بيانات القُصّر (PDPL).
-- ============================================================
alter table circles   enable row level security;
alter table guardians enable row level security;
alter table teachers  enable row level security;
alter table students  enable row level security;
alter table courses   enable row level security;
alter table sessions  enable row level security;
alter table mistakes  enable row level security;
alter table points    enable row level security;
alter table payments  enable row level security;
alter table waitlist  enable row level security;
alter table harvest   enable row level security;
alter table rewards   enable row level security;
alter table audit_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['circles','guardians','teachers','students','courses','sessions',
                           'mistakes','points','payments','waitlist','harvest','rewards','audit_log']
  loop
    execute format('drop policy if exists p_all on %I;', t);
    execute format('create policy p_all on %I for all using (true) with check (true);', t);
  end loop;
end $$;

-- ============================================================
-- بيانات بذور (Seed) — لتشغيل النموذج مباشرةً بعد الربط
-- ============================================================
insert into circles (id,name,mosque,teacher) values
  ('sabah','حلقة الفجر','جامع الإمام','أ. عبدالرحمن القحطاني'),
  ('asr','حلقة العصر','جامع الإمام','أ. عبدالرحمن القحطاني')
on conflict (id) do nothing;

insert into guardians (id,name,phone) values
  ('g1','أبو محمد الغامدي','0555xxx123'),
  ('g2','أبو يوسف الدوسري','0555xxx456'),
  ('g3','أبو إبراهيم القرني','0555xxx789')
on conflict (id) do nothing;

insert into students (full_name,age,guardian_id,circle_id,program,last_stop_surah,last_stop_ayah,daily_target,points,streak,status) values
  ('محمد بن سعد الغامدي',12,'g1','sabah','مراقي',2,183,10,128,6,'active'),
  ('عبدالله بن فهد العتيبي',11,'g1','sabah','مراقي',2,142,10,95,4,'active'),
  ('يوسف بن خالد الدوسري',13,'g2','sabah','مُذّكِر',3,45,15,210,9,'active'),
  ('إبراهيم بن ناصر القرني',9,'g3','sabah','معارج',2,88,8,64,2,'active'),
  ('عمر بن تركي الشهري',12,'g2','sabah','مراقي',2,201,10,150,7,'active'),
  ('سلمان بن عايض الزهراني',11,'g3','sabah','مراقي',4,12,10,88,3,'active'),
  ('أنس بن ماجد الحربي',12,'g1','asr','مراقي',5,3,10,172,8,'active'),
  ('زياد بن مشعل المطيري',13,'g2','asr','مُذّكِر',6,72,12,140,5,'active'),
  ('فيصل بن بدر السبيعي',10,'g3','asr','معارج',2,255,10,60,1,'active'),
  ('تركي بن نايف العنزي',14,'g1','asr','مُذّكِر',7,40,12,196,10,'active')
on conflict do nothing;

insert into waitlist (full_name,age,phone,status) values
  ('خالد بن عبدالعزيز المالكي',11,'0554xxx001','pending'),
  ('ريان بن سلطان العمري',9,'0554xxx002','pending'),
  ('عبدالإله بن حمد الشمري',13,'0554xxx003','pending')
on conflict do nothing;

insert into rewards (id,name,cost,stock,icon) values
  ('r1','مصحف مجزّأ فاخر',400,5,'📗'),
  ('r2','قلم قرائي إلكتروني',650,3,'🖊️'),
  ('r3','حقيبة الحلقة',250,8,'🎒'),
  ('r4','بطاقة هدية مكتبة',500,4,'🎁'),
  ('r5','وسام المواظبة',150,20,'🏅'),
  ('r6','رحلة الحلقة',800,2,'🚌')
on conflict (id) do nothing;

insert into payments (payer,amount,kind,target,status) values
  ('أبو محمد الغامدي',300,'fees','—','success'),
  ('داعم — م. سعد',2000,'donation','برنامج مُذّكِر','success'),
  ('أبو يوسف الدوسري',300,'fees','—','refunded')
on conflict do nothing;

-- تم بحمد الله
