-- =================================================================================
-- THE ANT BOX ERP
-- Database Patch: Role-Based Access Control (RLS) Version 4 — CRM & Sales for Interns
-- Run this in Supabase SQL Editor (Database > SQL Editor > New Query)
-- =================================================================================

-- 1. CRM Tables RLS Updates
DROP POLICY IF EXISTS "Select Clients" ON public.clients;
CREATE POLICY "Select Clients" ON public.clients FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'hr', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Insert/Update Clients" ON public.clients;
CREATE POLICY "Insert/Update Clients" ON public.clients FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'hr', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Select Leads" ON public.leads;
CREATE POLICY "Select Leads" ON public.leads FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'hr', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Insert/Update Leads" ON public.leads;
CREATE POLICY "Insert/Update Leads" ON public.leads FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'hr', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Select CRM Interactions" ON public.crm_interactions;
CREATE POLICY "Select CRM Interactions" ON public.crm_interactions FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'hr', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Insert/Update CRM Interactions" ON public.crm_interactions;
CREATE POLICY "Insert/Update CRM Interactions" ON public.crm_interactions FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'hr', 'employee', 'intern')
);

-- 2. Vendor Tables RLS Updates
DROP POLICY IF EXISTS "Select Vendors" ON public.vendors;
CREATE POLICY "Select Vendors" ON public.vendors FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Insert/Update Vendors" ON public.vendors;
CREATE POLICY "Insert/Update Vendors" ON public.vendors FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Select Vendor Contacts" ON public.vendor_contacts;
CREATE POLICY "Select Vendor Contacts" ON public.vendor_contacts FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Insert/Update Vendor Contacts" ON public.vendor_contacts;
CREATE POLICY "Insert/Update Vendor Contacts" ON public.vendor_contacts FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

-- 3. Sales & Purchase & Ledger Tables RLS Updates
DROP POLICY IF EXISTS "Select Quotations" ON public.quotations;
CREATE POLICY "Select Quotations" ON public.quotations FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Insert/Update Quotations" ON public.quotations;
CREATE POLICY "Insert/Update Quotations" ON public.quotations FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Select Quotation Items" ON public.quotation_items;
CREATE POLICY "Select Quotation Items" ON public.quotation_items FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Insert/Update Quotation Items" ON public.quotation_items;
CREATE POLICY "Insert/Update Quotation Items" ON public.quotation_items FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Select Sales Orders" ON public.sales_orders;
CREATE POLICY "Select Sales Orders" ON public.sales_orders FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Insert/Update Sales Orders" ON public.sales_orders;
CREATE POLICY "Insert/Update Sales Orders" ON public.sales_orders FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Select Sales Order Items" ON public.sales_order_items;
CREATE POLICY "Select Sales Order Items" ON public.sales_order_items FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Insert/Update Sales Order Items" ON public.sales_order_items;
CREATE POLICY "Insert/Update Sales Order Items" ON public.sales_order_items FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Select Purchase Orders" ON public.purchase_orders;
CREATE POLICY "Select Purchase Orders" ON public.purchase_orders FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Insert/Update Purchase Orders" ON public.purchase_orders;
CREATE POLICY "Insert/Update Purchase Orders" ON public.purchase_orders FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Select Purchase Order Items" ON public.purchase_order_items;
CREATE POLICY "Select Purchase Order Items" ON public.purchase_order_items FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Insert/Update Purchase Order Items" ON public.purchase_order_items;
CREATE POLICY "Insert/Update Purchase Order Items" ON public.purchase_order_items FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

-- General Ledger is read-only for standard employees and interns
DROP POLICY IF EXISTS "Select General Ledger" ON public.general_ledger;
CREATE POLICY "Select General Ledger" ON public.general_ledger FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);
