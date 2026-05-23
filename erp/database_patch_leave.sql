-- The Ant Box ERP - Database Schema Patch for Leave Requests
-- Run this in your Supabase SQL Editor to add or update the leave requests table

-- ---------------------------------------------------------------------------------
-- STEP 0: Create get_my_role() helper if not already exists.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.employees WHERE id = auth.uid() LIMIT 1;
  RETURN user_role;
END;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- 1. Create leave_requests table
CREATE TABLE IF NOT EXISTS public.leave_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE,
    leave_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist if the table was created earlier without them
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Ensure foreign key constraints are properly configured
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_employee_id_fkey;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_reviewed_by_fkey;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- 2. Enable RLS and Policies for leave_requests
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Select policies
DROP POLICY IF EXISTS "Employees can view own leave requests" ON public.leave_requests;
CREATE POLICY "Employees can view own leave requests" ON public.leave_requests 
FOR SELECT USING (auth.uid() = employee_id);

DROP POLICY IF EXISTS "HR and Managers can view all leave requests" ON public.leave_requests;
CREATE POLICY "HR and Managers can view all leave requests" ON public.leave_requests 
FOR SELECT USING (
  public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager')
);

-- Insert policies
DROP POLICY IF EXISTS "Employees can insert own leave requests" ON public.leave_requests;
CREATE POLICY "Employees can insert own leave requests" ON public.leave_requests 
FOR INSERT WITH CHECK (auth.uid() = employee_id);

-- Update policies
DROP POLICY IF EXISTS "Employees can update own pending leave requests" ON public.leave_requests;
CREATE POLICY "Employees can update own pending leave requests" ON public.leave_requests 
FOR UPDATE USING (auth.uid() = employee_id AND status = 'pending');

DROP POLICY IF EXISTS "HR and Managers can update any leave requests" ON public.leave_requests;
CREATE POLICY "HR and Managers can update any leave requests" ON public.leave_requests 
FOR UPDATE USING (
  public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager')
);

-- Delete policies
DROP POLICY IF EXISTS "Employees can delete own pending leave requests" ON public.leave_requests;
CREATE POLICY "Employees can delete own pending leave requests" ON public.leave_requests 
FOR DELETE USING (auth.uid() = employee_id AND status = 'pending');

DROP POLICY IF EXISTS "HR and Managers can delete any leave requests" ON public.leave_requests;
CREATE POLICY "HR and Managers can delete any leave requests" ON public.leave_requests 
FOR DELETE USING (
  public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager')
);

-- 3. Enable Realtime for leave_requests
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
