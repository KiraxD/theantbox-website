-- =================================================================================
-- THE ANT BOX ERP
-- Database Patch: Role-Based Access Control (RLS) Version 3
-- Run this in Supabase SQL Editor (Database > SQL Editor > New Query)
-- =================================================================================

-- ---------------------------------------------------------------------------------
-- STEP 0: Create get_my_role() helper if not already exists.
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.employees WHERE id = auth.uid() LIMIT 1;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- =================================================================================
-- SECTION 1: Employees — Role-Based Visibility & Permissions
-- =================================================================================
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Drop existing employee policies to avoid conflict
DROP POLICY IF EXISTS "Employees Select Policy" ON public.employees;
DROP POLICY IF EXISTS "Employees can view all employees" ON public.employees;
DROP POLICY IF EXISTS "Employees Insert Policy" ON public.employees;
DROP POLICY IF EXISTS "Employees Update Policy" ON public.employees;
DROP POLICY IF EXISTS "Employees Delete Policy" ON public.employees;

-- SELECT:
-- 1. High roles (super_admin, admin, hr, accountant, manager) can view all profiles
-- 2. Employees can view themselves and all interns
-- 3. Interns can only view their own profile
CREATE POLICY "Employees Select Policy" ON public.employees
  FOR SELECT
  USING (
    public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant', 'manager')
    OR (public.get_my_role() = 'employee' AND (id = auth.uid() OR role = 'intern'))
    OR (id = auth.uid())
  );

-- INSERT: Only HR and Super Admin/Admin can add new employee records
CREATE POLICY "Employees Insert Policy" ON public.employees
  FOR INSERT
  WITH CHECK (
    public.get_my_role() IN ('super_admin', 'admin', 'hr')
  );

-- UPDATE: Users can update their own profile; HR, Super Admin, and Admin can update any profile
CREATE POLICY "Employees Update Policy" ON public.employees
  FOR UPDATE
  USING (
    id = auth.uid()
    OR public.get_my_role() IN ('super_admin', 'admin', 'hr')
  );

-- DELETE/Archive: Only HR, Super Admin, and Admin can archive (delete) employee records
CREATE POLICY "Employees Delete Policy" ON public.employees
  FOR DELETE
  USING (
    public.get_my_role() IN ('super_admin', 'admin', 'hr')
  );

-- =================================================================================
-- SECTION 2: Tasks — Role-Based Visibility & Permissions
-- =================================================================================
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Drop existing task policies
DROP POLICY IF EXISTS "Tasks Select Policy" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can read tasks" ON public.tasks;
DROP POLICY IF EXISTS "Tasks Insert Policy" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Tasks Update Policy" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Tasks Delete Policy" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can delete tasks" ON public.tasks;

-- SELECT:
-- 1. High roles (super_admin, admin, hr, accountant, manager) can view all tasks
-- 2. Employees can view tasks assigned to them, created by them, or assigned to interns
-- 3. Interns can only view tasks assigned to them
CREATE POLICY "Tasks Select Policy" ON public.tasks
  FOR SELECT
  USING (
    public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant', 'manager')
    OR (public.get_my_role() = 'employee' AND (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.employees WHERE id = assigned_to AND role = 'intern'
      )
    ))
    OR (assigned_to = auth.uid())
  );

-- INSERT:
-- 1. High roles can insert any tasks
-- 2. Employees can create tasks for themselves or interns
-- 3. Interns cannot create tasks
CREATE POLICY "Tasks Insert Policy" ON public.tasks
  FOR INSERT
  WITH CHECK (
    public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant', 'manager')
    OR (public.get_my_role() = 'employee' AND (
      created_by = auth.uid()
      AND (
        assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.employees WHERE id = assigned_to AND role = 'intern'
        )
      )
    ))
  );

-- UPDATE:
-- 1. High roles can update any task
-- 2. Employees can update their own, created, or intern-assigned tasks
-- 3. Interns can update tasks assigned to them (e.g. to update task status)
CREATE POLICY "Tasks Update Policy" ON public.tasks
  FOR UPDATE
  USING (
    public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant', 'manager')
    OR (public.get_my_role() = 'employee' AND (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.employees WHERE id = assigned_to AND role = 'intern'
      )
    ))
    OR (assigned_to = auth.uid())
  );

-- DELETE:
-- 1. High roles can delete any task
-- 2. Employees can delete tasks they created
-- 3. Interns cannot delete tasks
CREATE POLICY "Tasks Delete Policy" ON public.tasks
  FOR DELETE
  USING (
    public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant', 'manager')
    OR (public.get_my_role() = 'employee' AND created_by = auth.uid())
  );
