-- =================================================================================
-- THE ANT BOX ERP — Database Patch Version 2
-- Includes: Role extensions, Inventory tracking, Invoices & Billing
-- Run this in your Supabase SQL Editor (Database > SQL Editor > New Query)
-- =================================================================================

-- ---------------------------------------------------------------------------------
-- STEP 1: Extend Employee Roles
-- ---------------------------------------------------------------------------------
-- Drop the old constraint checking roles
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;

-- Re-add check constraint supporting admin and accountant
ALTER TABLE public.employees ADD CONSTRAINT employees_role_check 
  CHECK (role IN ('employee', 'manager', 'hr', 'super_admin', 'intern', 'admin', 'accountant'));

-- ---------------------------------------------------------------------------------
-- STEP 2: Inventory Schema & Policies
-- ---------------------------------------------------------------------------------

-- Inventory Items table
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

-- Inventory Transactions table (Stock In / Stock Out log)
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('stock_in', 'stock_out')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    performed_by UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

-- Select policies (Any authenticated employee can view stock items & transactions)
DROP POLICY IF EXISTS "Anyone can view inventory items" ON public.inventory_items;
CREATE POLICY "Anyone can view inventory items" ON public.inventory_items
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view inventory transactions" ON public.inventory_transactions;
CREATE POLICY "Anyone can view inventory transactions" ON public.inventory_transactions
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Management policies (Only super_admin, admin, hr, manager can modify items or stock)
DROP POLICY IF EXISTS "Authorized roles can manage inventory items" ON public.inventory_items;
CREATE POLICY "Authorized roles can manage inventory items" ON public.inventory_items
    FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

DROP POLICY IF EXISTS "Authorized roles can insert inventory transactions" ON public.inventory_transactions;
CREATE POLICY "Authorized roles can insert inventory transactions" ON public.inventory_transactions
    FOR INSERT WITH CHECK (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'manager'));

-- ---------------------------------------------------------------------------------
-- STEP 3: Invoices & Billing Schema & Policies
-- ---------------------------------------------------------------------------------

-- Invoices Table
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
    created_by UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice Line Items Table
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
    amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0)
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Management Policies (Only finance roles: super_admin, admin, hr, accountant can view/manage invoices)
DROP POLICY IF EXISTS "Finance roles can manage invoices" ON public.invoices;
CREATE POLICY "Finance roles can manage invoices" ON public.invoices
    FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant'));

DROP POLICY IF EXISTS "Finance roles can manage invoice items" ON public.invoice_items;
CREATE POLICY "Finance roles can manage invoice items" ON public.invoice_items
    FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant'));

-- ---------------------------------------------------------------------------------
-- STEP 4: Realtime Replication Setup
-- ---------------------------------------------------------------------------------
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

-- Validation result statement
SELECT 'database_patch_v2.sql applied successfully' AS status;
