-- =================================================================================
-- THE ANT BOX ERP — Database Schema Patch for Employees Cascading & Admin Signups
-- Run this in your Supabase SQL Editor to allow creating employees before signup
-- =================================================================================

-- 1. Remove the strict constraint requiring employees to have auth users immediately
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_id_fkey;

-- 2. Add default value for employees.id to auto-generate UUIDs for manual additions
ALTER TABLE public.employees ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- 3. Drop and recreate all foreign keys referencing employees(id) with ON UPDATE CASCADE
-- Table: employee_documents
ALTER TABLE public.employee_documents DROP CONSTRAINT IF EXISTS employee_documents_employee_id_fkey;
ALTER TABLE public.employee_documents ADD CONSTRAINT employee_documents_employee_id_fkey 
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Table: employees (self-references)
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_created_by_fkey;
ALTER TABLE public.employees ADD CONSTRAINT employees_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_updated_by_fkey;
ALTER TABLE public.employees ADD CONSTRAINT employees_updated_by_fkey 
  FOREIGN KEY (updated_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: expenses
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_employee_id_fkey;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_employee_id_fkey 
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_approved_by_fkey;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_approved_by_fkey 
  FOREIGN KEY (approved_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: general_ledger
ALTER TABLE public.general_ledger DROP CONSTRAINT IF EXISTS general_ledger_created_by_fkey;
ALTER TABLE public.general_ledger ADD CONSTRAINT general_ledger_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: inventory_items
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_created_by_fkey;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: inventory_transactions
ALTER TABLE public.inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_performed_by_fkey;
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_performed_by_fkey 
  FOREIGN KEY (performed_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: inventory_warehouses
ALTER TABLE public.inventory_warehouses DROP CONSTRAINT IF EXISTS inventory_warehouses_created_by_fkey;
ALTER TABLE public.inventory_warehouses ADD CONSTRAINT inventory_warehouses_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: invoices
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: leads
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;
ALTER TABLE public.leads ADD CONSTRAINT leads_assigned_to_fkey 
  FOREIGN KEY (assigned_to) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_created_by_fkey;
ALTER TABLE public.leads ADD CONSTRAINT leads_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: leave_requests
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_employee_id_fkey;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_employee_id_fkey 
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_reviewed_by_fkey;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_reviewed_by_fkey 
  FOREIGN KEY (reviewed_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: leaves
ALTER TABLE public.leaves DROP CONSTRAINT IF EXISTS leaves_employee_id_fkey;
ALTER TABLE public.leaves ADD CONSTRAINT leaves_employee_id_fkey 
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.leaves DROP CONSTRAINT IF EXISTS leaves_requested_by_fkey;
ALTER TABLE public.leaves ADD CONSTRAINT leaves_requested_by_fkey 
  FOREIGN KEY (requested_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.leaves DROP CONSTRAINT IF EXISTS leaves_approved_by_fkey;
ALTER TABLE public.leaves ADD CONSTRAINT leaves_approved_by_fkey 
  FOREIGN KEY (approved_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: notifications
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_recipient_id_fkey;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_recipient_id_fkey 
  FOREIGN KEY (recipient_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Table: payroll
ALTER TABLE public.payroll DROP CONSTRAINT IF EXISTS payroll_employee_id_fkey;
ALTER TABLE public.payroll ADD CONSTRAINT payroll_employee_id_fkey 
  FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.payroll DROP CONSTRAINT IF EXISTS payroll_processed_by_fkey;
ALTER TABLE public.payroll ADD CONSTRAINT payroll_processed_by_fkey 
  FOREIGN KEY (processed_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: purchase_orders
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_created_by_fkey;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: task_comments
ALTER TABLE public.task_comments DROP CONSTRAINT IF EXISTS task_comments_author_id_fkey;
ALTER TABLE public.task_comments ADD CONSTRAINT task_comments_author_id_fkey 
  FOREIGN KEY (author_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: tasks
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey 
  FOREIGN KEY (assigned_to) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Table: user_preferences
ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_user_id_fkey;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Table: vendors
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_created_by_fkey;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;


-- 4. Update the trigger function to handle signups of pre-created employees
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.employees WHERE email = new.email) THEN
    -- Match the pre-created record and update its ID to the auth user ID
    UPDATE public.employees
    SET id = new.id,
        status = 'active',
        updated_at = NOW()
    WHERE email = new.email;
  ELSE
    -- Otherwise, insert a brand new employee record
    INSERT INTO public.employees (id, full_name, email, role, status)
    VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'New Employee'), new.email, 'employee', 'active');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
