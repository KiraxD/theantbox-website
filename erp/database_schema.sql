-- The Ant Box ERP - Database Schema & Policies
-- Execute this script in your Supabase SQL Editor

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLES

-- Departments Table
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employees Table
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'manager', 'hr', 'super_admin', 'intern')),
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    designation TEXT,
    salary DECIMAL(10,2) DEFAULT 0.00,
    joining_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'probation')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance Table
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    clock_in TIMESTAMPTZ,
    clock_out TIMESTAMPTZ,
    total_hours DECIMAL(5,2),
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'half_day', 'leave')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, date)
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'in_review', 'done')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    deadline DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payroll Table
CREATE TABLE IF NOT EXISTS public.payroll (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    month TEXT NOT NULL, -- Format: 'YYYY-MM'
    base_salary DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    bonuses DECIMAL(10,2) DEFAULT 0.00,
    deductions DECIMAL(10,2) DEFAULT 0.00,
    net_salary DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, month)
);

-- 3. ROW LEVEL SECURITY (RLS)

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

-- 3.1 Departments Policies
DROP POLICY IF EXISTS "Anyone can read departments" ON public.departments;
CREATE POLICY "Anyone can read departments" ON public.departments FOR SELECT USING (true);
DROP POLICY IF EXISTS "HR and Managers can insert/update departments" ON public.departments;
CREATE POLICY "HR and Managers can insert/update departments" ON public.departments 
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('hr', 'manager', 'super_admin'))
);

-- 3.2 Employees Policies
DROP POLICY IF EXISTS "Employees can view all employees" ON public.employees;
CREATE POLICY "Employees can view all employees" ON public.employees FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.employees;
CREATE POLICY "Users can update their own profile" ON public.employees FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "HR and Super Admin can update any employee" ON public.employees;
CREATE POLICY "HR and Super Admin can update any employee" ON public.employees 
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('hr', 'super_admin'))
);

-- 3.3 Attendance Policies
DROP POLICY IF EXISTS "Employees can view own attendance" ON public.attendance;
CREATE POLICY "Employees can view own attendance" ON public.attendance FOR SELECT USING (auth.uid() = employee_id);
DROP POLICY IF EXISTS "HR/Managers can view all attendance" ON public.attendance;
CREATE POLICY "HR/Managers can view all attendance" ON public.attendance 
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('hr', 'manager', 'super_admin'))
);
DROP POLICY IF EXISTS "Employees can insert own attendance" ON public.attendance;
CREATE POLICY "Employees can insert own attendance" ON public.attendance FOR INSERT WITH CHECK (auth.uid() = employee_id);
DROP POLICY IF EXISTS "Employees can update own attendance" ON public.attendance;
CREATE POLICY "Employees can update own attendance" ON public.attendance FOR UPDATE USING (auth.uid() = employee_id);
DROP POLICY IF EXISTS "HR/Managers can insert/update all attendance" ON public.attendance;
CREATE POLICY "HR/Managers can insert/update all attendance" ON public.attendance 
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('hr', 'manager', 'super_admin'))
);

-- 3.4 Tasks Policies
DROP POLICY IF EXISTS "Anyone can read tasks" ON public.tasks;
CREATE POLICY "Anyone can read tasks" ON public.tasks FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can insert tasks" ON public.tasks;
CREATE POLICY "Anyone can insert tasks" ON public.tasks FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update tasks" ON public.tasks;
CREATE POLICY "Anyone can update tasks" ON public.tasks FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Anyone can delete tasks" ON public.tasks;
CREATE POLICY "Anyone can delete tasks" ON public.tasks FOR DELETE USING (true);

-- 3.5 Payroll Policies
DROP POLICY IF EXISTS "Employees can view own payroll" ON public.payroll;
CREATE POLICY "Employees can view own payroll" ON public.payroll FOR SELECT USING (auth.uid() = employee_id);
DROP POLICY IF EXISTS "HR and Super Admin can view all payroll" ON public.payroll;
CREATE POLICY "HR and Super Admin can view all payroll" ON public.payroll 
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('hr', 'super_admin'))
);
DROP POLICY IF EXISTS "HR and Super Admin can manage payroll" ON public.payroll;
CREATE POLICY "HR and Super Admin can manage payroll" ON public.payroll 
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('hr', 'super_admin'))
);

-- 4. REALTIME SETUP
-- Turn on realtime for specific tables so clients get live updates
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. TRIGGERS
-- Auto-create employee record when a new user signs up in Auth
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.employees (id, full_name, email, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email, COALESCE(new.raw_user_meta_data->>'role', 'employee'));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- End of Script
