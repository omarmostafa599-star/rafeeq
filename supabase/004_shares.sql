-- =====================================================================
-- رفيق — الإصدار 2.3: روابط المشاركة (لقطة ثابتة للقراءة فقط). آمن لإعادة التشغيل.
-- =====================================================================
create table if not exists public.shares (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token       text not null unique check (char_length(token) between 20 and 80),
  title       text not null default '' check (char_length(title) <= 200),
  period      text not null default '',
  payload     jsonb not null check (pg_column_size(payload) < 400000),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  revoked     boolean not null default false,
  views       int not null default 0
);
create index if not exists shares_user on public.shares (user_id, created_at desc);

alter table public.shares enable row level security;
drop policy if exists "own shares" on public.shares;
create policy "own shares" on public.shares for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.shares to authenticated;
revoke all on public.shares from anon;

-- قراءة عامة بالرمز فقط (لا يمكن سرد الروابط أو الوصول لغيرها)
create or replace function public.get_share(tok text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.shares;
begin
  if tok is null or char_length(tok) < 20 then return null; end if;
  select * into s from public.shares where token = tok and not revoked and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  update public.shares set views = views + 1 where id = s.id;
  return jsonb_build_object('title', s.title, 'period', s.period, 'created_at', s.created_at, 'expires_at', s.expires_at, 'payload', s.payload);
end $$;
revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;
