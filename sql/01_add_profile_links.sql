alter table public.profiles
  add column if not exists student_id  bigint references public.students(id),
  add column if not exists guardian_id text   references public.guardians(id);

create index if not exists idx_profiles_student  on public.profiles(student_id);
create index if not exists idx_profiles_guardian on public.profiles(guardian_id);

alter table public.students enable row level security;

drop policy if exists students_read on public.students;
create policy students_read on public.students
for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('general','teacher','admin','examiner')
  )
  or id = (select student_id from public.profiles where id = auth.uid())
  or guardian_id = (select guardian_id from public.profiles where id = auth.uid())
);
