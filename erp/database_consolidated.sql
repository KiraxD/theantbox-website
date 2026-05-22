-- =================================================================================
-- THE ANT BOX ERP — CONSOLIDATED DATABASE SCHEMA & POLICIES
-- =================================================================================
-- Run this entire script in your Supabase SQL Editor (Database > SQL Editor > New Query)
-- This script safely constructs all tables, constraints, foreign keys, triggers,
-- and RLS policies for all modules (Employee, Leave, Tasks, Attendance, Payroll, 
-- Notifications, Activity Logs, Inventory, and Invoices).
-- =================================================================================

-- ---------------------------------------------------------------------------------
-- STEP 1: Enable Extensions
-- ---------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------------
-- STEP 2: Create Core Tables (If Not Exist)
-- ---------------------------------------------------------------------------------

-- 2.1 Departments Table
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 Employees Table
-- (Using UUID PRIMARY KEY without immediate auth.users check constraint to support manual creation by HR before Auth account is linked)
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'employee',
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    designation TEXT,
    salary DECIMAL(10,2) DEFAULT 0.00,
    joining_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'probation')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure correct check constraint for roles including admin and accountant
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_role_check 
    CHECK (role IN ('employee', 'manager', 'hr', 'super_admin', 'intern', 'admin', 'accountant'));

-- 2.3 Attendance Table
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE,
    date DATE NOT NULL,
    clock_in TIMESTAMPTZ,
    clock_out TIMESTAMPTZ,
    total_hours DECIMAL(5,2),
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'half_day', 'leave', 'late')),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, date)
);

-- 2.4 Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE,
    assigned_to UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'in_review', 'done')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    deadline DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.5 Task Comments Table
CREATE TABLE IF NOT EXISTS public.task_comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON UPDATE CASCADE ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.6 Leave Requests Table
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

-- 2.7 Payroll Table
CREATE TABLE IF NOT EXISTS public.payroll (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE,
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

-- 2.8 Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Notification',
    message TEXT NOT NULL DEFAULT '',
    read_status BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.9 Activity Logs Table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,   -- e.g. 'task', 'employee', 'leave'
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.10 Inventory Items Table
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.11 Inventory Transactions Table
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('stock_in', 'stock_out')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    performed_by UUID NOT NULL REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.12 Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    client_name TEXT NOT NULL,
    client_email TEXT,
    issued_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_by UUID NOT NULL REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.13 Invoice Items Table
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
    amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0)
);

-- 2.14 Employee Documents Table
CREATE TABLE IF NOT EXISTS public.employee_documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_path TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    file_size INTEGER,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);


-- ---------------------------------------------------------------------------------
-- STEP 2.14: Apply Schema Modifications & Update Constraints for Existing Databases
-- ---------------------------------------------------------------------------------

-- Add missing columns to support all features on existing installations
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Drop foreign key on employees.id referencing auth.users(id) to allow manual employee insertion by HR
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_id_fkey;
ALTER TABLE public.employees ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- Drop and recreate foreign keys referencing employees(id) to support ON UPDATE CASCADE
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_employee_id_fkey;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.task_comments DROP CONSTRAINT IF EXISTS task_comments_author_id_fkey;
ALTER TABLE public.task_comments ADD CONSTRAINT task_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_employee_id_fkey;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_reviewed_by_fkey;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.payroll DROP CONSTRAINT IF EXISTS payroll_employee_id_fkey;
ALTER TABLE public.payroll ADD CONSTRAINT payroll_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_performed_by_fkey;
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------------
-- STEP 3: Setup Helper Security Function
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.employees WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- ---------------------------------------------------------------------------------
-- STEP 4: Configure Row Level Security (RLS) & Policies
-- ---------------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;


-- 4.1 Departments Policies
DROP POLICY IF EXISTS "Anyone can read departments" ON public.departments;
CREATE POLICY "Anyone can read departments" ON public.departments 
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "HR and Managers can insert/update departments" ON public.departments;
CREATE POLICY "HR and Managers can insert/update departments" ON public.departments 
    FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

-- 4.2 Employees Policies
DROP POLICY IF EXISTS "Employees Select Policy" ON public.employees;
CREATE POLICY "Employees Select Policy" ON public.employees
  FOR SELECT
  USING (
    public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant', 'manager')
    OR (public.get_my_role() = 'employee' AND (id = auth.uid() OR role = 'intern'))
    OR (id = auth.uid())
  );

DROP POLICY IF EXISTS "Employees Insert Policy" ON public.employees;
CREATE POLICY "Employees Insert Policy" ON public.employees
  FOR INSERT
  WITH CHECK (public.get_my_role() IN ('super_admin', 'admin', 'hr'));

DROP POLICY IF EXISTS "Employees Update Policy" ON public.employees;
CREATE POLICY "Employees Update Policy" ON public.employees
  FOR UPDATE
  USING (
    id = auth.uid()
    OR public.get_my_role() IN ('super_admin', 'admin', 'hr')
  );

DROP POLICY IF EXISTS "Employees Delete Policy" ON public.employees;
CREATE POLICY "Employees Delete Policy" ON public.employees
  FOR DELETE
  USING (public.get_my_role() IN ('super_admin', 'admin', 'hr'));

-- 4.3 Attendance Policies
DROP POLICY IF EXISTS "Employees can view own attendance" ON public.attendance;
CREATE POLICY "Employees can view own attendance" ON public.attendance 
    FOR SELECT USING (auth.uid() = employee_id);

DROP POLICY IF EXISTS "HR/Managers can view all attendance" ON public.attendance;
CREATE POLICY "HR/Managers can view all attendance" ON public.attendance 
    FOR SELECT USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

DROP POLICY IF EXISTS "Employees can insert own attendance" ON public.attendance;
CREATE POLICY "Employees can insert own attendance" ON public.attendance 
    FOR INSERT WITH CHECK (auth.uid() = employee_id);

DROP POLICY IF EXISTS "Employees can update own attendance" ON public.attendance;
CREATE POLICY "Employees can update own attendance" ON public.attendance 
    FOR UPDATE USING (auth.uid() = employee_id);

DROP POLICY IF EXISTS "HR/Managers can insert/update all attendance" ON public.attendance;
CREATE POLICY "HR/Managers can insert/update all attendance" ON public.attendance 
    FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

-- 4.4 Tasks Policies
DROP POLICY IF EXISTS "Tasks Select Policy" ON public.tasks;
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

DROP POLICY IF EXISTS "Tasks Insert Policy" ON public.tasks;
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

DROP POLICY IF EXISTS "Tasks Update Policy" ON public.tasks;
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

DROP POLICY IF EXISTS "Tasks Delete Policy" ON public.tasks;
CREATE POLICY "Tasks Delete Policy" ON public.tasks
  FOR DELETE
  USING (
    public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant', 'manager')
    OR (public.get_my_role() = 'employee' AND created_by = auth.uid())
  );

-- 4.5 Task Comments Policies
DROP POLICY IF EXISTS "Anyone can read task comments" ON public.task_comments;
CREATE POLICY "Anyone can read task comments" ON public.task_comments 
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Employees can insert task comments" ON public.task_comments;
CREATE POLICY "Employees can insert task comments" ON public.task_comments 
    FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can delete their task comments" ON public.task_comments;
CREATE POLICY "Authors can delete their task comments" ON public.task_comments 
    FOR DELETE USING (auth.uid() = author_id OR public.get_my_role() IN ('super_admin', 'admin', 'hr'));

-- 4.6 Leave Requests Policies
DROP POLICY IF EXISTS "Employees can view own leave requests" ON public.leave_requests;
CREATE POLICY "Employees can view own leave requests" ON public.leave_requests 
    FOR SELECT USING (auth.uid() = employee_id);

DROP POLICY IF EXISTS "HR and Managers can view all leave requests" ON public.leave_requests;
CREATE POLICY "HR and Managers can view all leave requests" ON public.leave_requests 
    FOR SELECT USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

DROP POLICY IF EXISTS "Employees can insert own leave requests" ON public.leave_requests;
CREATE POLICY "Employees can insert own leave requests" ON public.leave_requests 
    FOR INSERT WITH CHECK (auth.uid() = employee_id);

DROP POLICY IF EXISTS "Employees can update own pending leave requests" ON public.leave_requests;
CREATE POLICY "Employees can update own pending leave requests" ON public.leave_requests 
    FOR UPDATE USING (auth.uid() = employee_id AND status = 'pending');

DROP POLICY IF EXISTS "HR and Managers can update any leave requests" ON public.leave_requests;
CREATE POLICY "HR and Managers can update any leave requests" ON public.leave_requests 
    FOR UPDATE USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

DROP POLICY IF EXISTS "Employees can delete own pending leave requests" ON public.leave_requests;
CREATE POLICY "Employees can delete own pending leave requests" ON public.leave_requests 
    FOR DELETE USING (auth.uid() = employee_id AND status = 'pending');

DROP POLICY IF EXISTS "HR and Managers can delete any leave requests" ON public.leave_requests;
CREATE POLICY "HR and Managers can delete any leave requests" ON public.leave_requests 
    FOR DELETE USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

-- 4.7 Payroll Policies
DROP POLICY IF EXISTS "Employees can view own payroll" ON public.payroll;
CREATE POLICY "Employees can view own payroll" ON public.payroll 
    FOR SELECT USING (auth.uid() = employee_id);

DROP POLICY IF EXISTS "HR and Super Admin can view all payroll" ON public.payroll;
CREATE POLICY "HR and Super Admin can view all payroll" ON public.payroll 
    FOR SELECT USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant'));

DROP POLICY IF EXISTS "HR and Super Admin can manage payroll" ON public.payroll;
CREATE POLICY "HR and Super Admin can manage payroll" ON public.payroll 
    FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant'));

-- 4.8 Notifications Policies
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "HR and admins can insert notifications" ON public.notifications;
CREATE POLICY "HR and admins can insert notifications" ON public.notifications
    FOR INSERT WITH CHECK (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

-- 4.9 Activity Logs Policies
DROP POLICY IF EXISTS "HR and admins can view activity logs" ON public.activity_logs;
CREATE POLICY "HR and admins can view activity logs" ON public.activity_logs
    FOR SELECT USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

DROP POLICY IF EXISTS "Anyone can insert activity logs" ON public.activity_logs;
CREATE POLICY "Anyone can insert activity logs" ON public.activity_logs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 4.10 Inventory Policies
DROP POLICY IF EXISTS "Anyone can view inventory items" ON public.inventory_items;
CREATE POLICY "Anyone can view inventory items" ON public.inventory_items
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view inventory transactions" ON public.inventory_transactions;
CREATE POLICY "Anyone can view inventory transactions" ON public.inventory_transactions
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized roles can manage inventory items" ON public.inventory_items;
CREATE POLICY "Authorized roles can manage inventory items" ON public.inventory_items
    FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

DROP POLICY IF EXISTS "Authorized roles can insert inventory transactions" ON public.inventory_transactions;
CREATE POLICY "Authorized roles can insert inventory transactions" ON public.inventory_transactions
    FOR INSERT WITH CHECK (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

-- 4.11 Invoice Policies
DROP POLICY IF EXISTS "Finance roles can manage invoices" ON public.invoices;
CREATE POLICY "Finance roles can manage invoices" ON public.invoices
    FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant'));

DROP POLICY IF EXISTS "Finance roles can manage invoice items" ON public.invoice_items;
CREATE POLICY "Finance roles can manage invoice items" ON public.invoice_items
    FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant'));

-- 4.12 Employee Documents Policies
DROP POLICY IF EXISTS "Employees can view own documents" ON public.employee_documents;
CREATE POLICY "Employees can view own documents" ON public.employee_documents
    FOR SELECT USING (auth.uid() = employee_id);

DROP POLICY IF EXISTS "HR and Managers can view all documents" ON public.employee_documents;
CREATE POLICY "HR and Managers can view all documents" ON public.employee_documents
    FOR SELECT USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

DROP POLICY IF EXISTS "Employees can insert own documents" ON public.employee_documents;
CREATE POLICY "Employees can insert own documents" ON public.employee_documents
    FOR INSERT WITH CHECK (auth.uid() = employee_id);

DROP POLICY IF EXISTS "Employees can delete own documents" ON public.employee_documents;
CREATE POLICY "Employees can delete own documents" ON public.employee_documents
    FOR DELETE USING (auth.uid() = employee_id);

DROP POLICY IF EXISTS "HR and Managers can manage all documents" ON public.employee_documents;
CREATE POLICY "HR and Managers can manage all documents" ON public.employee_documents
    FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));


-- ---------------------------------------------------------------------------------
-- STEP 5: Realtime Replication Setup
-- ---------------------------------------------------------------------------------
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

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_documents;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ---------------------------------------------------------------------------------
-- STEP 6: Setup SignUp / Triggers
-- ---------------------------------------------------------------------------------
-- Links newly signed-up users to existing employees (created by HR manually) 
-- or registers a new default employee profile.
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.employees WHERE email = new.email) THEN
    UPDATE public.employees SET id = new.id WHERE email = new.email;
  ELSE
    INSERT INTO public.employees (id, full_name, email, role)
    VALUES (
      new.id, 
      COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 
      new.email, 
      COALESCE(new.raw_user_meta_data->>'role', 'employee')
    );
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ---------------------------------------------------------------------------------
-- STEP 7: Storage Bucket Setup
-- ---------------------------------------------------------------------------------
-- Create public bucket 'employee-files' if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-files', 'employee-files', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Storage Policies
DROP POLICY IF EXISTS "Allow authenticated users to upload files" ON storage.objects;
CREATE POLICY "Allow authenticated users to upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'employee-files');

DROP POLICY IF EXISTS "Allow authenticated users to select files" ON storage.objects;
CREATE POLICY "Allow authenticated users to select files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'employee-files');

DROP POLICY IF EXISTS "Allow authenticated users to delete files" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'employee-files');

-- Done!
SELECT 'database_consolidated.sql loaded successfully' AS status;

