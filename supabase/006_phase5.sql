-- رفيق 2.5 — المهام المتكررة، وقت المهمة والتذكير، والإشعارات
-- 1) حقول المهمة
alter table public.tasks add column if not exists recur jsonb;
alter table public.tasks add column if not exists due_time text;
alter table public.tasks add column if not exists remind_min int;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_due_time_check') then
    alter table public.tasks add constraint tasks_due_time_check check (due_time is null or due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_remind_min_check') then
    alter table public.tasks add constraint tasks_remind_min_check check (remind_min is null or remind_min between -1 and 1440);
  end if;
end $$;

-- 2) اشتراكات الإشعارات (لكل جهاز)
create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  ua         text not null default '',
  created_at timestamptz not null default now(),
  last_ok    timestamptz
);
create index if not exists push_subs_user on public.push_subs (user_id);
alter table public.push_subs enable row level security;
drop policy if exists push_subs_read on public.push_subs;
create policy push_subs_read on public.push_subs for select using (user_id = auth.uid());
revoke insert, update, delete on public.push_subs from anon, authenticated;

create or replace function public.save_push_sub(p_endpoint text, p_p256dh text, p_auth text, p_ua text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then raise exception 'bad subscription'; end if;
  insert into public.push_subs (endpoint, user_id, p256dh, auth, ua) values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(coalesce(p_ua, ''), 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, created_at = now();
end $$;
create or replace function public.delete_push_sub(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subs where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.save_push_sub(text, text, text, text) from public, anon;
revoke all on function public.delete_push_sub(text) from public, anon;
grant execute on function public.save_push_sub(text, text, text, text) to authenticated;
grant execute on function public.delete_push_sub(text) to authenticated;

-- 3) جداول داخلية للخادم فقط (لا سياسات = لا وصول للمستخدمين)
create table if not exists public.app_kv (k text primary key, v jsonb not null, updated_at timestamptz not null default now());
alter table public.app_kv enable row level security;
revoke all on public.app_kv from anon, authenticated;
create table if not exists public.notif_sent (user_id uuid not null, key text not null, sent_at timestamptz not null default now(), primary key (user_id, key));
alter table public.notif_sent enable row level security;
revoke all on public.notif_sent from anon, authenticated;

-- مفتاح داخلي لاستدعاء دالة الإشعارات من المجدول (يُولَّد هنا ولا يغادر قاعدة البيانات)
insert into public.app_kv (k, v) values ('cron_key', to_jsonb(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
on conflict (k) do nothing;

-- 4) جدولة كل 5 دقائق
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin perform cron.unschedule('rafeeq-notify'); exception when others then null; end $$;
select cron.schedule('rafeeq-notify', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://khuccltwwinaobkcukyn.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select v #>> '{}' from public.app_kv where k = 'cron_key')),
    body := '{"run":"cron"}'::jsonb,
    timeout_milliseconds := 25000);
$cron$);
-- تنظيف سجل الإرسال القديم يوميًا
do $$ begin perform cron.unschedule('rafeeq-notif-clean'); exception when others then null; end $$;
select cron.schedule('rafeeq-notif-clean', '17 3 * * *', $c$ delete from public.notif_sent where sent_at < now() - interval '3 days' $c$);
