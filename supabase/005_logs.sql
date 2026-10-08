-- رفيق 2.4 — سجل الإنجازات: أعمال منجزة لا تُسجَّل كمهام
alter table public.tasks add column if not exists kind text not null default 'task';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_kind_check') then
    alter table public.tasks add constraint tasks_kind_check check (kind in ('task','log'));
  end if;
end $$;
