-- =====================================================================
-- رفيق — Rafeeq · قاعدة البيانات (Supabase / Postgres)
-- شغّل هذا الملف مرة واحدة من: Supabase → SQL Editor → New query → Run
-- آمن لإعادة التشغيل.
-- =====================================================================

-- 1) الملف الشخصي لكل مستخدم
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  job_title    text not null default '',
  lang         text not null default 'ar' check (lang in ('ar','en')),
  settings     jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

-- 2) الأشخاص والجهات
create table if not exists public.people (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  org         text not null default '',
  contact     text not null default '',
  notes       text not null default '',
  deleted     boolean not null default false,
  client_ts   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3) المهام (المتابعات والسجل مخزنة داخل المهمة)
create table if not exists public.tasks (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 500),
  details      text not null default '',
  status       text not null default 'todo' check (status in ('todo','prog','wait','hold','done','cancelled')),
  priority     text not null default 'mid'  check (priority in ('hi','mid','lo')),
  role         text not null default 'exec' check (role in ('exec','follow','both')),
  due          date,
  project      text not null default '',
  source       text not null default '',
  waiting_on   uuid,
  waiting_what text not null default 'reply' check (waiting_what in ('reply','decision','approval')),
  notes        text not null default '',
  steps_done   int  not null default 0 check (steps_done >= 0),
  steps_total  int  not null default 0 check (steps_total >= 0),
  completed_on date,
  result       text not null default '',
  archived     boolean not null default false,
  followups    jsonb not null default '[]'::jsonb,
  log          jsonb not null default '[]'::jsonb,
  deleted      boolean not null default false,
  client_ts    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tasks_user_updated  on public.tasks  (user_id, updated_at);
create index if not exists people_user_updated on public.people (user_id, updated_at);

-- 4) وقت آخر تعديل يضبطه الخادم (أساس المزامنة)
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before insert or update on public.tasks
  for each row execute function public.touch_updated_at();
drop trigger if exists people_touch on public.people;
create trigger people_touch before insert or update on public.people
  for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_updated_at();

-- 5) إنشاء الملف الشخصي تلقائيًا عند أول دخول
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6) العزل: كل مستخدم يرى بياناته فقط
alter table public.profiles enable row level security;
alter table public.people   enable row level security;
alter table public.tasks    enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "own people" on public.people;
create policy "own people" on public.people for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 7) نقطة تنبيه بسيطة تُبقي المشروع نشطًا (يستدعيها GitHub كل 3 أيام)
create or replace function public.keepalive() returns text
language sql stable as $$ select 'ok'::text $$;
grant execute on function public.keepalive() to anon, authenticated;
