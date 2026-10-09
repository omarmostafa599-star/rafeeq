-- رفيق 2.5.2 — سلامة المزامنة بين الأجهزة، والتحقق من اشتراكات الإشعارات، وحدود الحجم. آمن لإعادة التشغيل.

-- 1) آخر تعديل يفوز: تعديل أقدم (client_ts أصغر) لا يستبدل تعديلًا أحدث وصل من جهاز آخر.
--    نُبقي الصف كما هو ونحدّث updated_at فقط، فيسحب الجهاز الخاسر النسخة الأحدث في المزامنة التالية.
create or replace function public.keep_newer_edit() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.client_ts is not null and old.client_ts is not null and new.client_ts < old.client_ts then
    old.updated_at := now();
    return old;
  end if;
  return new;
end $$;
drop trigger if exists tasks_a_keep_newer on public.tasks;
create trigger tasks_a_keep_newer before update on public.tasks for each row execute function public.keep_newer_edit();
drop trigger if exists people_a_keep_newer on public.people;
create trigger people_a_keep_newer before update on public.people for each row execute function public.keep_newer_edit();
drop trigger if exists files_a_keep_newer on public.files;
create trigger files_a_keep_newer before update on public.files for each row execute function public.keep_newer_edit();

-- 2) اشتراكات الإشعارات: مفاتيح بصيغة صحيحة فقط (مفتاح تالف كان يُفشل الاختبار ويبقى في الجدول)
create or replace function public.save_push_sub(p_endpoint text, p_p256dh text, p_auth text, p_ua text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'bad subscription'; end if;
  if p_p256dh !~ '^[A-Za-z0-9_-]{85,90}$' or p_auth !~ '^[A-Za-z0-9_-]{20,24}$' then raise exception 'bad subscription keys'; end if;
  insert into public.push_subs (endpoint, user_id, p256dh, auth, ua) values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(coalesce(p_ua, ''), 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, created_at = now(), last_ok = null;
end $$;

-- 3) حدود حجم معقولة لكل صف (الحساب مفتوح لأي بريد Google؛ لا نسمح لحساب واحد بملء قاعدة البيانات)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_text_len') then
    alter table public.tasks add constraint tasks_text_len check (char_length(details) <= 20000 and char_length(notes) <= 20000 and char_length(result) <= 5000 and char_length(project) <= 200 and char_length(source) <= 200) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_json_size') then
    alter table public.tasks add constraint tasks_json_size check (pg_column_size(followups) < 200000 and pg_column_size(log) < 300000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'people_text_len') then
    alter table public.people add constraint people_text_len check (char_length(org) <= 200 and char_length(contact) <= 200 and char_length(notes) <= 5000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'files_text_len') then
    alter table public.files add constraint files_text_len check (char_length(name) <= 300 and char_length(note) <= 1000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_settings_size') then
    alter table public.profiles add constraint profiles_settings_size check (pg_column_size(settings) < 20000 and char_length(display_name) <= 200 and char_length(job_title) <= 200) not valid;
  end if;
end $$;

-- 4) فهرس لمزامنة الملفات (كان موجودًا للمهام والأشخاص فقط)
create index if not exists files_user_updated on public.files (user_id, updated_at);
