-- =====================================================================
-- رفيق — الإصدار 2.1: مكتبة الملفات + ربط Google Drive
-- يُشغَّل مرة واحدة بعد schema.sql. آمن لإعادة التشغيل.
-- =====================================================================

-- 1) بيانات الملفات (الملف نفسه في Google Drive الخاص بالمستخدم)
create table if not exists public.files (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  drive_id    text not null check (char_length(drive_id) between 1 and 200),
  name        text not null check (char_length(name) between 1 and 300),
  mime        text not null default '',
  size        bigint not null default 0 check (size >= 0),
  task_id     uuid,
  person_id   uuid,
  note        text not null default '',
  deleted     boolean not null default false,
  client_ts   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists files_user_updated on public.files (user_id, updated_at);

drop trigger if exists files_touch on public.files;
create trigger files_touch before insert or update on public.files
  for each row execute function public.touch_updated_at();

alter table public.files enable row level security;
drop policy if exists "own files" on public.files;
create policy "own files" on public.files for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.files to authenticated;
revoke all on public.files from anon;

-- 2) مفتاح Google طويل الأمد: يُكتب فقط، ولا يقرؤه المتصفح أبدًا (تقرؤه دالة الخادم وحدها)
create table if not exists public.google_links (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  scope         text not null default '',
  updated_at    timestamptz not null default now()
);
alter table public.google_links enable row level security;
revoke all on public.google_links from anon, authenticated;

create or replace function public.save_google_link(rt text, sc text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if rt is null or char_length(rt) < 10 then raise exception 'bad token'; end if;
  insert into public.google_links (user_id, refresh_token, scope, updated_at)
  values (auth.uid(), rt, coalesce(sc, ''), now())
  on conflict (user_id) do update set refresh_token = excluded.refresh_token, scope = excluded.scope, updated_at = now();
end $$;

create or replace function public.google_link_status() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.google_links where user_id = auth.uid());
$$;

create or replace function public.unlink_google() returns void
language sql security definer set search_path = public as $$
  delete from public.google_links where user_id = auth.uid();
$$;

revoke all on function public.save_google_link(text, text) from public, anon;
revoke all on function public.google_link_status() from public, anon;
revoke all on function public.unlink_google() from public, anon;
grant execute on function public.save_google_link(text, text) to authenticated;
grant execute on function public.google_link_status() to authenticated;
grant execute on function public.unlink_google() to authenticated;
