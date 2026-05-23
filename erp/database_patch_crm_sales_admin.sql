-- =================================================================================
-- THE ANT BOX ERP — Database Schema Patch for CRM, Sales, Vendors & Admin
-- Run this in your Supabase SQL Editor (Database > SQL Editor > New Query)
-- =================================================================================

-- 1. LEAVE TABLES
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

-- Seed leave types
INSERT INTO public.leave_types (name, days_per_year, is_paid, color_code) VALUES
  ('Casual Leave', 12, true, '#F59E0B'),
  ('Sick Leave', 10, true, '#EF4444'),
  ('Paid Time Off', 15, true, '#10B981'),
  ('Unpaid Leave', 0, false, '#6B7280'),
  ('Maternity Leave', 180, true, '#EC4899'),
  ('Paternity Leave', 30, true, '#8B5CF6')
ON CONFLICT (name) DO NOTHING;

-- 2. CRM TABLES
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_by UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.leads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    designation TEXT,
    industry TEXT,
    source TEXT,
    assigned_to UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost')),
    created_by UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.crm_interactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    lead_id UUID REFERENCES public.leads(id) ON UPDATE CASCADE ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE CASCADE,
    interaction_type TEXT NOT NULL,
    interaction_date TIMESTAMPTZ DEFAULT NOW(),
    subject TEXT NOT NULL,
    notes TEXT,
    outcome TEXT,
    next_steps TEXT,
    created_by UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales_pipeline_stages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    key TEXT NOT NULL UNIQUE,
    sequence INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed sales pipeline stages
INSERT INTO public.sales_pipeline_stages (name, key, sequence) VALUES
('New', 'new', 1),
('Contacted', 'contacted', 2),
('Qualified', 'qualified', 3),
('Proposal Sent', 'proposal_sent', 4),
('In Negotiation', 'negotiation', 5),
('Won', 'won', 6),
('Lost', 'lost', 7)
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, sequence = EXCLUDED.sequence;

-- 3. VENDOR TABLES
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
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
    credit_rating TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
    created_by UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.vendor_contacts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    designation TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SALES, PURCHASING & FINANCE TABLES
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    quotation_number TEXT NOT NULL UNIQUE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE CASCADE,
    valid_until DATE NOT NULL,
    subtotal DECIMAL(12,2) DEFAULT 0.00,
    tax_amount DECIMAL(12,2) DEFAULT 0.00,
    total_amount DECIMAL(12,2) DEFAULT 0.00,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
    created_by UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON UPDATE CASCADE ON DELETE CASCADE,
    item_description TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales_orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE CASCADE,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal DECIMAL(12,2) DEFAULT 0.00,
    tax_amount DECIMAL(12,2) DEFAULT 0.00,
    total_amount DECIMAL(12,2) DEFAULT 0.00,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'fulfilled', 'cancelled')),
    created_by UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.sales_order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
    item_description TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    po_number TEXT NOT NULL UNIQUE,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal DECIMAL(12,2) DEFAULT 0.00,
    tax_amount DECIMAL(12,2) DEFAULT 0.00,
    total_amount DECIMAL(12,2) DEFAULT 0.00,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
    created_by UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
    item_description TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.general_ledger (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    account_name TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
    description TEXT,
    reference_type TEXT,
    reference_id UUID,
    created_by UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_ledger ENABLE ROW LEVEL SECURITY;

-- 6. CREATE RLS POLICIES

-- Leave tables RLS
DROP POLICY IF EXISTS "Select Leaves" ON public.leaves;
CREATE POLICY "Select Leaves" ON public.leaves FOR SELECT USING (true);
DROP POLICY IF EXISTS "Modify Leaves" ON public.leaves;
CREATE POLICY "Modify Leaves" ON public.leaves FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr'));

DROP POLICY IF EXISTS "Select Leave Types" ON public.leave_types;
CREATE POLICY "Select Leave Types" ON public.leave_types FOR SELECT USING (true);
DROP POLICY IF EXISTS "Modify Leave Types" ON public.leave_types;
CREATE POLICY "Modify Leave Types" ON public.leave_types FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr'));

-- CRM Tables RLS
DROP POLICY IF EXISTS "Select Clients" ON public.clients;
CREATE POLICY "Select Clients" ON public.clients FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'hr', 'accountant', 'employee')
);
DROP POLICY IF EXISTS "Insert/Update Clients" ON public.clients;
CREATE POLICY "Insert/Update Clients" ON public.clients FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'hr', 'accountant', 'employee')
);

DROP POLICY IF EXISTS "Select Leads" ON public.leads;
CREATE POLICY "Select Leads" ON public.leads FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'hr', 'employee')
);
DROP POLICY IF EXISTS "Insert/Update Leads" ON public.leads;
CREATE POLICY "Insert/Update Leads" ON public.leads FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'hr', 'employee')
);

DROP POLICY IF EXISTS "Select CRM Interactions" ON public.crm_interactions;
CREATE POLICY "Select CRM Interactions" ON public.crm_interactions FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'hr', 'employee')
);
DROP POLICY IF EXISTS "Insert/Update CRM Interactions" ON public.crm_interactions;
CREATE POLICY "Insert/Update CRM Interactions" ON public.crm_interactions FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'hr', 'employee')
);

DROP POLICY IF EXISTS "Select Pipeline Stages" ON public.sales_pipeline_stages;
CREATE POLICY "Select Pipeline Stages" ON public.sales_pipeline_stages FOR SELECT USING (true);
DROP POLICY IF EXISTS "Modify Pipeline Stages" ON public.sales_pipeline_stages;
CREATE POLICY "Modify Pipeline Stages" ON public.sales_pipeline_stages FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin'));

-- Vendor Tables RLS
DROP POLICY IF EXISTS "Select Vendors" ON public.vendors;
CREATE POLICY "Select Vendors" ON public.vendors FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);
DROP POLICY IF EXISTS "Insert/Update Vendors" ON public.vendors;
CREATE POLICY "Insert/Update Vendors" ON public.vendors FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);

DROP POLICY IF EXISTS "Select Vendor Contacts" ON public.vendor_contacts;
CREATE POLICY "Select Vendor Contacts" ON public.vendor_contacts FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);
DROP POLICY IF EXISTS "Insert/Update Vendor Contacts" ON public.vendor_contacts;
CREATE POLICY "Insert/Update Vendor Contacts" ON public.vendor_contacts FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);

-- Sales & Purchase & Ledger Tables RLS
DROP POLICY IF EXISTS "Select Quotations" ON public.quotations;
CREATE POLICY "Select Quotations" ON public.quotations FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);
DROP POLICY IF EXISTS "Insert/Update Quotations" ON public.quotations;
CREATE POLICY "Insert/Update Quotations" ON public.quotations FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);

DROP POLICY IF EXISTS "Select Quotation Items" ON public.quotation_items;
CREATE POLICY "Select Quotation Items" ON public.quotation_items FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);
DROP POLICY IF EXISTS "Insert/Update Quotation Items" ON public.quotation_items;
CREATE POLICY "Insert/Update Quotation Items" ON public.quotation_items FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);

DROP POLICY IF EXISTS "Select Sales Orders" ON public.sales_orders;
CREATE POLICY "Select Sales Orders" ON public.sales_orders FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);
DROP POLICY IF EXISTS "Insert/Update Sales Orders" ON public.sales_orders;
CREATE POLICY "Insert/Update Sales Orders" ON public.sales_orders FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);

DROP POLICY IF EXISTS "Select Sales Order Items" ON public.sales_order_items;
CREATE POLICY "Select Sales Order Items" ON public.sales_order_items FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);
DROP POLICY IF EXISTS "Insert/Update Sales Order Items" ON public.sales_order_items;
CREATE POLICY "Insert/Update Sales Order Items" ON public.sales_order_items FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);

DROP POLICY IF EXISTS "Select Purchase Orders" ON public.purchase_orders;
CREATE POLICY "Select Purchase Orders" ON public.purchase_orders FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);
DROP POLICY IF EXISTS "Insert/Update Purchase Orders" ON public.purchase_orders;
CREATE POLICY "Insert/Update Purchase Orders" ON public.purchase_orders FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);

DROP POLICY IF EXISTS "Select Purchase Order Items" ON public.purchase_order_items;
CREATE POLICY "Select Purchase Order Items" ON public.purchase_order_items FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);
DROP POLICY IF EXISTS "Insert/Update Purchase Order Items" ON public.purchase_order_items;
CREATE POLICY "Insert/Update Purchase Order Items" ON public.purchase_order_items FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee')
);

DROP POLICY IF EXISTS "Select General Ledger" ON public.general_ledger;
CREATE POLICY "Select General Ledger" ON public.general_ledger FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant')
);
DROP POLICY IF EXISTS "Insert/Update General Ledger" ON public.general_ledger;
CREATE POLICY "Insert/Update General Ledger" ON public.general_ledger FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'accountant')
);

-- 7. SYSTEM SETTINGS TABLE & SEEDING
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

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select System Settings" ON public.system_settings;
CREATE POLICY "Select System Settings" ON public.system_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Modify System Settings" ON public.system_settings;
CREATE POLICY "Modify System Settings" ON public.system_settings FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin')
);

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

-- 8. ENABLE REALTIME FOR ALL NEW TABLES
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_interactions;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vendors;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.general_ledger;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_orders;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.quotations;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_types;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leaves;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
