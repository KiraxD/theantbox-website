-- ============================================================
-- THE ANT BOX ERP - COMPLETE PRODUCTION DATABASE SCHEMA
-- Execute this in your Supabase SQL Editor
-- ============================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- DROP LEGACY TABLES TO PREVENT SCHEMA CONFLICTS (CASCADE ensures dependent constraints are clean)
DROP TABLE IF EXISTS public.system_settings CASCADE;
DROP TABLE IF EXISTS public.user_preferences CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.crm_interactions CASCADE;
DROP TABLE IF EXISTS public.sales_pipeline_stages CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.inventory_transactions CASCADE;
DROP TABLE IF EXISTS public.inventory_items CASCADE;
DROP TABLE IF EXISTS public.inventory_categories CASCADE;
DROP TABLE IF EXISTS public.inventory_warehouses CASCADE;
DROP TABLE IF EXISTS public.general_ledger CASCADE;
DROP TABLE IF EXISTS public.vendor_contacts CASCADE;
DROP TABLE IF EXISTS public.vendors CASCADE;
DROP TABLE IF EXISTS public.purchase_order_items CASCADE;
DROP TABLE IF EXISTS public.purchase_orders CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.invoice_items CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.task_comments CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.payroll_items CASCADE;
DROP TABLE IF EXISTS public.payroll CASCADE;
DROP TABLE IF EXISTS public.leaves CASCADE;
DROP TABLE IF EXISTS public.leave_types CASCADE;
DROP TABLE IF EXISTS public.attendance CASCADE;
DROP TABLE IF EXISTS public.salary_components CASCADE;
DROP TABLE IF EXISTS public.employee_documents CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.departments CASCADE;

-- ============================================================
-- 2. CORE TABLES
-- ============================================================

-- Departments
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Employees (normalized, extended)
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('super_admin', 'admin', 'hr', 'accountant', 'manager', 'employee', 'intern')),
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    designation TEXT,
    salary DECIMAL(10,2) DEFAULT 0.00,
    joining_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'probation', 'on_leave')),
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    bank_account_number TEXT,
    bank_ifsc_code TEXT,
    pan_number TEXT,
    aadhar_number TEXT,
    blood_group TEXT,
    date_of_birth DATE,
    gender TEXT CHECK (gender IN ('M', 'F', 'Other')),
    marital_status TEXT,
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Employee Documents
CREATE TABLE IF NOT EXISTS public.employee_documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('resume', 'offer_letter', 'contract', 'certification', 'id_proof', 'address_proof', 'other')),
    uploaded_by UUID NOT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Salary Components
CREATE TABLE IF NOT EXISTS public.salary_components (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    component_type TEXT NOT NULL CHECK (component_type IN ('earnings', 'deductions')),
    description TEXT,
    is_mandatory BOOLEAN DEFAULT false,
    calculation_formula TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. ATTENDANCE & LEAVE MANAGEMENT
-- ============================================================

-- Attendance (fixed schema, matches service implementation)
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    clock_in TIMESTAMPTZ,
    clock_out TIMESTAMPTZ,
    total_hours DECIMAL(5,2),
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'half_day', 'leave', 'weekend', 'holiday')),
    note TEXT,
    segments JSONB DEFAULT '[]'::jsonb,
    marked_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, date)
);

-- Leave Types
CREATE TABLE IF NOT EXISTS public.leave_types (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    days_per_year INT NOT NULL DEFAULT 0,
    is_paid BOOLEAN DEFAULT true,
    requires_approval BOOLEAN DEFAULT true,
    color_code TEXT DEFAULT '#4F46E5',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leaves / Leave Requests
CREATE TABLE IF NOT EXISTS public.leaves (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days DECIMAL(4,2) NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    requested_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    approval_date TIMESTAMPTZ,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================================
-- 4. PAYROLL
-- ============================================================

-- Payroll Records
CREATE TABLE IF NOT EXISTS public.payroll (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    month TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
    base_salary DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    bonuses DECIMAL(12,2) DEFAULT 0.00,
    deductions DECIMAL(12,2) DEFAULT 0.00,
    net_salary DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(12,2) DEFAULT 0.00,
    working_days INT DEFAULT 0,
    present_days INT DEFAULT 0,
    absent_days INT DEFAULT 0,
    half_days INT DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid', 'rejected')),
    notes TEXT,
    processed_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    paid_on TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(employee_id, month)
);

-- Payroll Items (breakdown)
CREATE TABLE IF NOT EXISTS public.payroll_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    payroll_id UUID NOT NULL REFERENCES public.payroll(id) ON DELETE CASCADE,
    component_id UUID REFERENCES public.salary_components(id) ON DELETE SET NULL,
    component_name TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. TASKS
-- ============================================================

-- Tasks (extended with more fields)
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'in_review', 'done', 'blocked')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    deadline DATE,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    project TEXT,
    tags TEXT[],
    attachment_urls TEXT[],
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Task Comments
CREATE TABLE IF NOT EXISTS public.task_comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    mentions UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================================
-- 6. FINANCE & INVOICING
-- ============================================================

-- Clients / Customers
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT,
    gstin TEXT,
    pan_number TEXT,
    contact_person_name TEXT,
    contact_person_phone TEXT,
    website TEXT,
    payment_terms TEXT,
    credit_limit DECIMAL(12,2),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_address TEXT,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    po_reference TEXT,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    tax_rate DECIMAL(5,2) DEFAULT 0.00,
    tax_amount DECIMAL(12,2) DEFAULT 0.00,
    discount DECIMAL(12,2) DEFAULT 0.00,
    total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    amount_paid DECIMAL(12,2) DEFAULT 0.00,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled')),
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Invoice Items
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    amount DECIMAL(12,2) NOT NULL,
    tax_rate DECIMAL(5,2) DEFAULT 0.00,
    tax_amount DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('travel', 'meals', 'accommodation', 'office_supplies', 'utilities', 'software', 'other')),
    amount DECIMAL(12,2) NOT NULL,
    currency TEXT DEFAULT 'INR',
    expense_date DATE NOT NULL,
    description TEXT NOT NULL,
    receipt_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    approved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    approval_date TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Vendors / Suppliers
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT,
    gstin TEXT,
    pan_number TEXT,
    contact_person_name TEXT,
    contact_person_phone TEXT,
    website TEXT,
    payment_terms TEXT,
    credit_rating TEXT CHECK (credit_rating IN ('A+', 'A', 'B+', 'B', 'C')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Vendor Contacts
CREATE TABLE IF NOT EXISTS public.vendor_contacts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    designation TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    po_number TEXT NOT NULL UNIQUE,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    vendor_name TEXT NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    delivery_date DATE,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(12,2) DEFAULT 0.00,
    total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'confirmed', 'partial_received', 'received', 'cancelled')),
    notes TEXT,
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- PO Items
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    amount DECIMAL(12,2) NOT NULL,
    quantity_received DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);



-- General Ledger (Accounting)
CREATE TABLE IF NOT EXISTS public.general_ledger (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    transaction_date DATE NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('invoice', 'payment', 'expense', 'purchase', 'adjustment', 'journal')),
    reference_id UUID,
    reference_type TEXT,
    account TEXT NOT NULL CHECK (account IN ('revenue', 'expenses', 'assets', 'liabilities', 'equity')),
    sub_account TEXT,
    debit DECIMAL(12,2) DEFAULT 0.00,
    credit DECIMAL(12,2) DEFAULT 0.00,
    balance DECIMAL(12,2) DEFAULT 0.00,
    description TEXT,
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. INVENTORY
-- ============================================================

-- Inventory Categories
CREATE TABLE IF NOT EXISTS public.inventory_categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory Items
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
    quantity INT NOT NULL DEFAULT 0,
    reorder_level INT DEFAULT 10,
    reorder_quantity INT DEFAULT 50,
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    tax_rate DECIMAL(5,2) DEFAULT 0.00,
    supplier_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    unit_of_measure TEXT DEFAULT 'pcs',
    weight DECIMAL(10,2),
    dimensions TEXT,
    barcode TEXT UNIQUE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Inventory Transactions
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('stock_in', 'stock_out', 'adjustment', 'damage', 'transfer', 'return')),
    quantity DECIMAL(10,2) NOT NULL,
    reason TEXT,
    reference_id UUID,
    reference_type TEXT,
    warehouse_from TEXT,
    warehouse_to TEXT,
    performed_by UUID NOT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT positive_quantity CHECK (quantity > 0)
);

-- Inventory Warehouses
CREATE TABLE IF NOT EXISTS public.inventory_warehouses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    location TEXT NOT NULL,
    capacity INT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. CRM
-- ============================================================

-- Leads
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    designation TEXT,
    industry TEXT,
    source TEXT CHECK (source IN ('website', 'referral', 'cold_call', 'email', 'event', 'social', 'other')),
    lead_score INT DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost')),
    assigned_to UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    next_followup_date DATE,
    notes TEXT,
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- CRM Interactions
CREATE TABLE IF NOT EXISTS public.crm_interactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('call', 'email', 'meeting', 'demo', 'proposal', 'visit', 'other')),
    interaction_date TIMESTAMPTZ NOT NULL,
    subject TEXT NOT NULL,
    notes TEXT,
    outcome TEXT,
    next_steps TEXT,
    created_by UUID NOT NULL REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales Pipeline Stages (customizable)
CREATE TABLE IF NOT EXISTS public.sales_pipeline_stages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sequence INT NOT NULL,
    description TEXT,
    color_code TEXT DEFAULT '#4F46E5',
    is_won_stage BOOLEAN DEFAULT false,
    is_lost_stage BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. SYSTEM & AUDIT
-- ============================================================

-- Activity Logs (Audit Trail)
DROP TABLE IF EXISTS public.activity_logs CASCADE;
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'import', 'approve', 'reject')),
    resource_type TEXT NOT NULL,
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failure')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
DROP TABLE IF EXISTS public.notifications CASCADE;
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    recipient_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('info', 'warning', 'success', 'error', 'alert')),
    category TEXT CHECK (category IN ('leave', 'payroll', 'task', 'invoice', 'inventory', 'approval', 'system', 'other')),
    reference_id UUID,
    reference_type TEXT,
    is_read BOOLEAN DEFAULT false,
    action_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

-- User Preferences
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
    language TEXT DEFAULT 'en' CHECK (language IN ('en', 'hi', 'es', 'fr', 'de')),
    timezone TEXT DEFAULT 'Asia/Kolkata',
    date_format TEXT DEFAULT 'DD/MM/YYYY',
    time_format TEXT DEFAULT '24h' CHECK (time_format IN ('12h', '24h')),
    notifications_email BOOLEAN DEFAULT true,
    notifications_push BOOLEAN DEFAULT false,
    notifications_sms BOOLEAN DEFAULT false,
    email_digest TEXT DEFAULT 'daily' CHECK (email_digest IN ('none', 'daily', 'weekly', 'monthly')),
    items_per_page INT DEFAULT 20 CHECK (items_per_page > 0 AND items_per_page <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- System Settings
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type TEXT NOT NULL CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    is_editable BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- ── Departments Policies
DROP POLICY IF EXISTS "depts_read" ON public.departments;
CREATE POLICY "depts_read" ON public.departments FOR SELECT USING (true);
DROP POLICY IF EXISTS "depts_edit" ON public.departments;
CREATE POLICY "depts_edit" ON public.departments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr'))
);

-- ── Employees Policies
DROP POLICY IF EXISTS "emps_read_all" ON public.employees;
CREATE POLICY "emps_read_all" ON public.employees FOR SELECT USING (true);
DROP POLICY IF EXISTS "emps_update_own" ON public.employees;
CREATE POLICY "emps_update_own" ON public.employees FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "emps_admin_all" ON public.employees;
CREATE POLICY "emps_admin_all" ON public.employees FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr'))
);

-- ── Employee Documents Policies
DROP POLICY IF EXISTS "docs_read_own_or_admin" ON public.employee_documents;
CREATE POLICY "docs_read_own_or_admin" ON public.employee_documents FOR SELECT USING (
  auth.uid() = employee_id OR 
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr'))
);
DROP POLICY IF EXISTS "docs_admin_manage" ON public.employee_documents;
CREATE POLICY "docs_admin_manage" ON public.employee_documents FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr'))
);

-- ── Attendance Policies
DROP POLICY IF EXISTS "attend_read_own" ON public.attendance;
CREATE POLICY "attend_read_own" ON public.attendance FOR SELECT USING (
  auth.uid() = employee_id
);
DROP POLICY IF EXISTS "attend_read_admin" ON public.attendance;
CREATE POLICY "attend_read_admin" ON public.attendance FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr', 'manager'))
);
DROP POLICY IF EXISTS "attend_insert_own" ON public.attendance;
CREATE POLICY "attend_insert_own" ON public.attendance FOR INSERT WITH CHECK (
  auth.uid() = employee_id
);
DROP POLICY IF EXISTS "attend_update_own" ON public.attendance;
CREATE POLICY "attend_update_own" ON public.attendance FOR UPDATE USING (
  auth.uid() = employee_id
);
DROP POLICY IF EXISTS "attend_admin_manage" ON public.attendance;
CREATE POLICY "attend_admin_manage" ON public.attendance FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr'))
);

-- ── Leaves Policies
DROP POLICY IF EXISTS "leaves_read_own" ON public.leaves;
CREATE POLICY "leaves_read_own" ON public.leaves FOR SELECT USING (
  auth.uid() = employee_id OR
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND (e.role IN ('super_admin', 'admin', 'hr', 'manager') OR e.id = approved_by))
);
DROP POLICY IF EXISTS "leaves_insert" ON public.leaves;
CREATE POLICY "leaves_insert" ON public.leaves FOR INSERT WITH CHECK (
  auth.uid() = employee_id
);
DROP POLICY IF EXISTS "leaves_admin_manage" ON public.leaves;
CREATE POLICY "leaves_admin_manage" ON public.leaves FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr', 'manager'))
);

-- ── Tasks Policies (FIXED - now restricted properly)
DROP POLICY IF EXISTS "tasks_read" ON public.tasks;
CREATE POLICY "tasks_read" ON public.tasks FOR SELECT USING (
  auth.uid() = created_by OR
  auth.uid() = assigned_to OR
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'manager', 'hr'))
);
DROP POLICY IF EXISTS "tasks_create" ON public.tasks;
CREATE POLICY "tasks_create" ON public.tasks FOR INSERT WITH CHECK (
  auth.uid() = created_by
);
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (
  auth.uid() = created_by OR
  auth.uid() = assigned_to OR
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'manager', 'hr'))
);
DROP POLICY IF EXISTS "tasks_delete_owner_or_admin" ON public.tasks;
CREATE POLICY "tasks_delete_owner_or_admin" ON public.tasks FOR DELETE USING (
  auth.uid() = created_by OR
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr'))
);

-- ── Task Comments Policies
DROP POLICY IF EXISTS "comments_read" ON public.task_comments;
CREATE POLICY "comments_read" ON public.task_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (
    auth.uid() = t.created_by OR auth.uid() = t.assigned_to OR
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.role IN ('super_admin', 'admin', 'manager', 'hr'))
  ))
);
DROP POLICY IF EXISTS "comments_insert" ON public.task_comments;
CREATE POLICY "comments_insert" ON public.task_comments FOR INSERT WITH CHECK (
  auth.uid() = author_id
);
DROP POLICY IF EXISTS "comments_delete" ON public.task_comments;
CREATE POLICY "comments_delete" ON public.task_comments FOR DELETE USING (
  auth.uid() = author_id OR
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr'))
);

-- ── Payroll Policies
DROP POLICY IF EXISTS "payroll_read_own" ON public.payroll;
CREATE POLICY "payroll_read_own" ON public.payroll FOR SELECT USING (
  auth.uid() = employee_id
);
DROP POLICY IF EXISTS "payroll_read_admin" ON public.payroll;
CREATE POLICY "payroll_read_admin" ON public.payroll FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr', 'accountant', 'manager'))
);
DROP POLICY IF EXISTS "payroll_manage_admin" ON public.payroll;
CREATE POLICY "payroll_manage_admin" ON public.payroll FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr', 'accountant'))
);

-- ── Invoice Policies
DROP POLICY IF EXISTS "invoices_read_admin" ON public.invoices;
CREATE POLICY "invoices_read_admin" ON public.invoices FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr', 'accountant', 'manager'))
);
DROP POLICY IF EXISTS "invoices_manage" ON public.invoices;
CREATE POLICY "invoices_manage" ON public.invoices FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'accountant'))
);

-- ── Inventory Policies
DROP POLICY IF EXISTS "inventory_read" ON public.inventory_items;
CREATE POLICY "inventory_read" ON public.inventory_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'manager', 'accountant', 'employee'))
);
DROP POLICY IF EXISTS "inventory_manage" ON public.inventory_items;
CREATE POLICY "inventory_manage" ON public.inventory_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'manager', 'accountant'))
);

-- ── Activity Logs Policies (audit trail - read-only for users, admin can see all)
DROP POLICY IF EXISTS "logs_admin_read" ON public.activity_logs;
CREATE POLICY "logs_admin_read" ON public.activity_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'hr'))
);

-- ── Notifications Policies
DROP POLICY IF EXISTS "notifs_read_own" ON public.notifications;
CREATE POLICY "notifs_read_own" ON public.notifications FOR SELECT USING (
  auth.uid() = recipient_id
);
DROP POLICY IF EXISTS "notifs_update_own" ON public.notifications;
CREATE POLICY "notifs_update_own" ON public.notifications FOR UPDATE USING (
  auth.uid() = recipient_id
);
DROP POLICY IF EXISTS "notifs_system_insert" ON public.notifications;
CREATE POLICY "notifs_system_insert" ON public.notifications FOR INSERT WITH CHECK (true);

-- ── User Preferences Policies
DROP POLICY IF EXISTS "prefs_read_own" ON public.user_preferences;
CREATE POLICY "prefs_read_own" ON public.user_preferences FOR SELECT USING (
  auth.uid() = user_id
);
DROP POLICY IF EXISTS "prefs_manage_own" ON public.user_preferences;
CREATE POLICY "prefs_manage_own" ON public.user_preferences FOR ALL USING (
  auth.uid() = user_id
);

-- ============================================================
-- 4. INDEXES
-- ============================================================

-- Departments
CREATE INDEX idx_departments_status ON public.departments(status);
CREATE INDEX idx_departments_deleted_at ON public.departments(deleted_at);

-- Employees
CREATE INDEX idx_employees_email ON public.employees(email);
CREATE INDEX idx_employees_department_id ON public.employees(department_id);
CREATE INDEX idx_employees_role ON public.employees(role);
CREATE INDEX idx_employees_status ON public.employees(status);
CREATE INDEX idx_employees_created_at ON public.employees(created_at);
CREATE INDEX idx_employees_deleted_at ON public.employees(deleted_at);

-- Attendance
CREATE INDEX idx_attendance_employee_date ON public.attendance(employee_id, date);
CREATE INDEX idx_attendance_date ON public.attendance(date);
CREATE INDEX idx_attendance_status ON public.attendance(status);

-- Leaves
CREATE INDEX idx_leaves_employee_id ON public.leaves(employee_id);
CREATE INDEX idx_leaves_status ON public.leaves(status);
CREATE INDEX idx_leaves_start_date ON public.leaves(start_date);
CREATE INDEX idx_leaves_end_date ON public.leaves(end_date);

-- Payroll
CREATE INDEX idx_payroll_employee_month ON public.payroll(employee_id, month);
CREATE INDEX idx_payroll_status ON public.payroll(status);

-- Tasks
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_priority ON public.tasks(priority);
CREATE INDEX idx_tasks_deadline ON public.tasks(deadline);
CREATE INDEX idx_tasks_tags ON public.tasks USING GIN(tags);

-- Invoices
CREATE INDEX idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX idx_invoices_number ON public.invoices(invoice_number);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_due_date ON public.invoices(due_date);

-- Expenses
CREATE INDEX idx_expenses_employee_id ON public.expenses(employee_id);
CREATE INDEX idx_expenses_category ON public.expenses(category);
CREATE INDEX idx_expenses_status ON public.expenses(status);
CREATE INDEX idx_expenses_date ON public.expenses(expense_date);

-- PO
CREATE INDEX idx_po_vendor_id ON public.purchase_orders(vendor_id);
CREATE INDEX idx_po_number ON public.purchase_orders(po_number);
CREATE INDEX idx_po_status ON public.purchase_orders(status);

-- Inventory
CREATE INDEX idx_inv_items_sku ON public.inventory_items(sku);
CREATE INDEX idx_inv_items_category ON public.inventory_items(category_id);
CREATE INDEX idx_inv_items_status ON public.inventory_items(status);
CREATE INDEX idx_inv_transactions_item ON public.inventory_transactions(item_id);
CREATE INDEX idx_inv_transactions_type ON public.inventory_transactions(transaction_type);

-- CRM
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_assigned_to ON public.leads(assigned_to);
CREATE INDEX idx_crm_interactions_lead ON public.crm_interactions(lead_id);
CREATE INDEX idx_crm_interactions_client ON public.crm_interactions(client_id);

-- Activity Logs
CREATE INDEX idx_activity_logs_user ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_resource ON public.activity_logs(resource_type, resource_id);
CREATE INDEX idx_activity_logs_created ON public.activity_logs(created_at DESC);

-- Notifications
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id);
CREATE INDEX idx_notifications_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

-- ============================================================
-- 5. TRIGGERS & FUNCTIONS
-- ============================================================

-- Auto-create employee record when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.employees (id, full_name, email, role)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', 'User'),
    new.email, 
    COALESCE(new.raw_user_meta_data->>'role', 'employee')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Auto-create user preferences on employee creation
CREATE OR REPLACE FUNCTION public.handle_new_employee()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id, theme, language, timezone)
  VALUES (new.id, 'light', 'en', 'Asia/Kolkata');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_employee_created ON public.employees;
CREATE TRIGGER on_employee_created
  AFTER INSERT ON public.employees
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_employee();

-- Auto-log activity for record changes
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.activity_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values,
    status
  ) VALUES (
    auth.uid(),
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'create'
      WHEN TG_OP = 'UPDATE' THEN 'update'
      WHEN TG_OP = 'DELETE' THEN 'delete'
      ELSE 'unknown'
    END,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END,
    'success'
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable activity logging on key tables
DROP TRIGGER IF EXISTS log_employees_changes ON public.employees;
CREATE TRIGGER log_employees_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE PROCEDURE public.log_activity();

DROP TRIGGER IF EXISTS log_payroll_changes ON public.payroll;
CREATE TRIGGER log_payroll_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll
  FOR EACH ROW EXECUTE PROCEDURE public.log_activity();

DROP TRIGGER IF EXISTS log_invoice_changes ON public.invoices;
CREATE TRIGGER log_invoice_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE PROCEDURE public.log_activity();

-- ============================================================
-- 6. REALTIME SETUP
-- ============================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leaves;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 7. INITIAL DATA SETUP
-- ============================================================

-- Insert default leave types
INSERT INTO public.leave_types (name, days_per_year, is_paid, color_code) VALUES
  ('Casual Leave', 12, true, '#F59E0B'),
  ('Sick Leave', 10, true, '#EF4444'),
  ('Paid Time Off', 15, true, '#10B981'),
  ('Unpaid Leave', 0, false, '#6B7280'),
  ('Maternity Leave', 180, true, '#EC4899'),
  ('Paternity Leave', 30, true, '#8B5CF6')
ON CONFLICT (name) DO NOTHING;

-- Insert default salary components
INSERT INTO public.salary_components (name, component_type, is_mandatory) VALUES
  ('Basic Salary', 'earnings', true),
  ('House Rent Allowance', 'earnings', false),
  ('Conveyance Allowance', 'earnings', false),
  ('Dearness Allowance', 'earnings', false),
  ('Performance Bonus', 'earnings', false),
  ('Provident Fund', 'deductions', false),
  ('Income Tax', 'deductions', false),
  ('Health Insurance', 'deductions', false)
ON CONFLICT (name) DO NOTHING;

-- Insert default sales pipeline stages
INSERT INTO public.sales_pipeline_stages (name, sequence, color_code, is_won_stage) VALUES
  ('New Lead', 1, '#E5E7EB', false),
  ('Contacted', 2, '#BFDBFE', false),
  ('Qualified', 3, '#93C5FD', false),
  ('Proposal Sent', 4, '#60A5FA', false),
  ('Negotiation', 5, '#3B82F6', false),
  ('Won', 6, '#10B981', true)
ON CONFLICT (name) DO NOTHING;

-- Insert default inventory categories
INSERT INTO public.inventory_categories (name, description) VALUES
  ('Electronics', 'Electronic components and devices'),
  ('Stationery', 'Office stationery and supplies'),
  ('Raw Materials', 'Raw materials for production'),
  ('Finished Goods', 'Ready for sale products'),
  ('Packaging', 'Packaging materials')
ON CONFLICT (name) DO NOTHING;

-- Insert default system settings
INSERT INTO public.system_settings (setting_key, setting_value, setting_type, description) VALUES
  ('company_name', 'The Ant Box', 'string', 'Company name'),
  ('company_email', 'contact@theantbox.com', 'string', 'Company email'),
  ('company_phone', '+91 9999999999', 'string', 'Company phone'),
  ('timezone', 'Asia/Kolkata', 'string', 'System timezone'),
  ('currency', 'INR', 'string', 'Default currency'),
  ('financial_year_start', '04-01', 'string', 'Financial year start (MM-DD)'),
  ('working_days_per_week', '5', 'number', 'Standard working days'),
  ('working_hours_per_day', '8', 'number', 'Standard working hours'),
  ('allow_employee_self_checkout', 'true', 'boolean', 'Can employees mark themselves absent?'),
  ('require_leave_approval', 'true', 'boolean', 'Require manager approval for leaves'),
  ('minimum_password_length', '8', 'number', 'Minimum password length'),
  ('enable_mfa', 'false', 'boolean', 'Enable multi-factor authentication'),
  ('session_timeout_minutes', '30', 'number', 'Session timeout in minutes')
ON CONFLICT (setting_key) DO NOTHING;

-- Sync existing auth.users to public.employees if they are missing
INSERT INTO public.employees (id, full_name, email, role, status)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'full_name', 'User'),
  email,
  COALESCE(raw_user_meta_data->>'role', 'employee'),
  'active'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- END OF SCHEMA
-- ============================================================
