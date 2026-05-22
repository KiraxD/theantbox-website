-- ============================================================
-- THE ANT BOX ERP — database_patch_notifications.sql
-- Creates notifications and activity_logs tables
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Notification',
    message TEXT NOT NULL DEFAULT '',
    read_status BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "HR and admins can insert notifications" ON public.notifications;
CREATE POLICY "HR and admins can insert notifications" ON public.notifications
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.employees
            WHERE id = auth.uid()
            AND role IN ('hr', 'super_admin', 'manager')
        )
    );

-- 3. Enable Realtime for notifications
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,   -- e.g. 'task', 'employee', 'leave'
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable RLS for activity_logs
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR and admins can view activity logs" ON public.activity_logs;
CREATE POLICY "HR and admins can view activity logs" ON public.activity_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.employees
            WHERE id = auth.uid()
            AND role IN ('hr', 'super_admin', 'manager')
        )
    );

DROP POLICY IF EXISTS "Anyone can insert activity logs" ON public.activity_logs;
CREATE POLICY "Anyone can insert activity logs" ON public.activity_logs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 6. Enable Realtime for activity_logs
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Attendance table: add missing columns if running old schema
-- (The original schema had clock_in/clock_out, some patches used check_in/check_out)
-- Ensure the correct columns exist:
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS note TEXT;

-- 8. Fix the payroll table unique constraint to use month as YYYY-MM string
-- (original schema was UNIQUE(employee_id, month) — keep as-is, just verify)
-- Already correct in original schema.

-- Done!
SELECT 'database_patch_notifications.sql applied successfully' AS status;
