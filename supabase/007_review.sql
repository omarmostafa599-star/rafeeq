-- رفيق 2.5.1 — حد يومي مشترك لاستخدام Gemini (كل المستخدمين معًا) + قيود طول + فهرس
-- 1) ai_usage: السماح بصف عام لا يرتبط بمستخدم (uid الصفري)
alter table public.ai_usage drop constraint if exists ai_usage_user_id_fkey;
-- 2) فهرس للإشعارات: مهام اليوم لكل مستخدم
create index if not exists tasks_user_due on public.tasks (user_id, due) where deleted = false;
-- 3) تنظيف عدّاد الاستخدام القديم
do $$ begin perform cron.unschedule('rafeeq-ai-clean'); exception when others then null; end $$;
select cron.schedule('rafeeq-ai-clean', '23 3 * * *', $c$ delete from public.ai_usage where day < current_date - 7 $c$);
