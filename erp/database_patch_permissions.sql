-- =================================================================================
-- THE ANT BOX ERP
-- Database Patch: Role-Based Access Control (RLS) for Tasks & Employees
-- Run this in Supabase SQL Editor (Database > SQL Editor > New Query)
-- =================================================================================

-- ---------------------------------------------------------------------------------
-- STEP 0: Create a SECURITY DEFINER helper to read the current user's role.
-- This avoids infinite recursion when the employees table's SELECT policy
-- calls back into the employees table to check the role.
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
-- SECTION 1: Tasks — Role-Based Visibility & Permissions
-- =================================================================================
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Drop any existing task policies to avoid conflicts
DROP POLICY IF EXISTS "Tasks Select Policy"    ON public.tasks;
DROP POLICY IF EXISTS "Tasks Insert Policy"    ON public.tasks;
DROP POLICY IF EXISTS "Tasks Update Policy"    ON public.tasks;
DROP POLICY IF EXISTS "Tasks Delete Policy"    ON public.tasks;
DROP POLICY IF EXISTS "Tasks are viewable by assigned users or HR/Managers/Employees" ON public.tasks;
DROP POLICY IF EXISTS "Tasks are insertable by non-interns"                            ON public.tasks;
DROP POLICY IF EXISTS "Tasks are updatable by assigned interns or non-interns"         ON public.tasks;
DROP POLICY IF EXISTS "Tasks are deletable by non-interns"                             ON public.tasks;

-- SELECT: Interns only see tasks assigned to them; all other roles see every task
CREATE POLICY "Tasks Select Policy" ON public.tasks
  FOR SELECT
  USING (
    public.get_my_role() != 'intern'
    OR assigned_to = auth.uid()
  );

-- INSERT: Interns cannot create tasks
CREATE POLICY "Tasks Insert Policy" ON public.tasks
  FOR INSERT
  WITH CHECK (
    public.get_my_role() != 'intern'
  );

-- UPDATE: Interns can update tasks assigned to them (move across Kanban columns);
--         non-interns can update any task
CREATE POLICY "Tasks Update Policy" ON public.tasks
  FOR UPDATE
  USING (
    public.get_my_role() != 'intern'
    OR assigned_to = auth.uid()
  );

-- DELETE: Only non-interns can delete tasks
CREATE POLICY "Tasks Delete Policy" ON public.tasks
  FOR DELETE
  USING (
    public.get_my_role() != 'intern'
  );

-- =================================================================================
-- SECTION 2: Employees — Role-Based Visibility & Permissions
-- =================================================================================
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Drop any existing employee policies
DROP POLICY IF EXISTS "Employees Select Policy" ON public.employees;
DROP POLICY IF EXISTS "Employees Insert Policy" ON public.employees;
DROP POLICY IF EXISTS "Employees Update Policy" ON public.employees;
DROP POLICY IF EXISTS "Employees Delete Policy" ON public.employees;

-- SELECT: Interns can only view their own profile; everyone else sees the full directory
CREATE POLICY "Employees Select Policy" ON public.employees
  FOR SELECT
  USING (
    id = auth.uid()
    OR public.get_my_role() != 'intern'
  );

-- INSERT: Only HR and Super Admin can add new employee records
CREATE POLICY "Employees Insert Policy" ON public.employees
  FOR INSERT
  WITH CHECK (
    public.get_my_role() IN ('super_admin', 'hr')
  );

-- UPDATE: Users can update their own profile details;
--         HR and Super Admin can update any employee's record
CREATE POLICY "Employees Update Policy" ON public.employees
  FOR UPDATE
  USING (
    id = auth.uid()
    OR public.get_my_role() IN ('super_admin', 'hr')
  );

-- DELETE/Archive: Only HR and Super Admin can archive (delete) employee records
CREATE POLICY "Employees Delete Policy" ON public.employees
  FOR DELETE
  USING (
    public.get_my_role() IN ('super_admin', 'hr')
  );
