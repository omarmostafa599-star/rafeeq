-- =====================================================================
-- رفيق — الإصدار 2.2: التحسين الذكي في الخلفية. آمن لإعادة التشغيل.
-- =====================================================================

-- حالة التحسين الذكي لكل مهمة (النص الأصلي، وما تغيّر، لإمكانية التراجع)
alter table public.tasks add column if not exists ai jsonb not null default '{}'::jsonb;

-- عدّاد استخدام يومي لكل مستخدم (حماية من الاستهلاك الزائد). تكتبه دالة الخادم وحدها.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default current_date,
  n       int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.ai_take(uid uuid, cap int) returns boolean
language plpgsql security definer set search_path = public as $$
declare used int;
begin
  insert into public.ai_usage (user_id, day, n) values (uid, current_date, 1)
  on conflict (user_id, day) do update set n = public.ai_usage.n + 1
  returning n into used;
  return used <= cap;
end $$;
revoke all on function public.ai_take(uuid, int) from public, anon, authenticated;
grant execute on function public.ai_take(uuid, int) to service_role;
