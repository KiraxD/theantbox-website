-- The Ant Box ERP - Database Schema Patch
-- Run this in your Supabase SQL Editor to add missing columns and tables

-- 1. Add avatar_url to employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create task_comments table
CREATE TABLE IF NOT EXISTS public.task_comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS and Policies for task_comments
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read task comments" ON public.task_comments;
CREATE POLICY "Anyone can read task comments" ON public.task_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Employees can insert task comments" ON public.task_comments;
CREATE POLICY "Employees can insert task comments" ON public.task_comments FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can delete their task comments" ON public.task_comments;
CREATE POLICY "Authors can delete their task comments" ON public.task_comments FOR DELETE USING (auth.uid() = author_id);

-- 4. Enable Realtime for task_comments
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Fix for HR managers creating employees (RLS and constraints)
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_id_fkey;
ALTER TABLE public.employees ALTER COLUMN id SET DEFAULT uuid_generate_v4();

DROP POLICY IF EXISTS "HR and Super Admin can insert employees" ON public.employees;
CREATE POLICY "HR and Super Admin can insert employees" ON public.employees 
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('hr', 'super_admin', 'manager'))
);

-- Update foreign keys to cascade ON UPDATE so we can link auth accounts later
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_employee_id_fkey;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.payroll DROP CONSTRAINT IF EXISTS payroll_employee_id_fkey;
ALTER TABLE public.payroll ADD CONSTRAINT payroll_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.task_comments DROP CONSTRAINT IF EXISTS task_comments_author_id_fkey;
ALTER TABLE public.task_comments ADD CONSTRAINT task_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Update the handle_new_user trigger to link the newly registered auth.user with an existing employee record if one was created by HR
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.employees WHERE email = new.email) THEN
    UPDATE public.employees SET id = new.id WHERE email = new.email;
  ELSE
    INSERT INTO public.employees (id, full_name, email, role)
    VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email, COALESCE(new.raw_user_meta_data->>'role', 'employee'));
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
