-- =================================================================================
-- THE ANT BOX ERP
-- Database Patch: Invoices RLS Support for Interns
-- Run this in your Supabase SQL Editor (Database > SQL Editor > New Query)
-- =================================================================================

-- Drop existing potential policies on invoices
DROP POLICY IF EXISTS "Finance roles can manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "invoices_manage" ON public.invoices;
DROP POLICY IF EXISTS "invoices_read_admin" ON public.invoices;

-- Recreate consolidated invoices policy including 'intern'
CREATE POLICY "Finance roles can manage invoices" ON public.invoices
    FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant', 'intern'));

-- Drop existing potential policies on invoice items
DROP POLICY IF EXISTS "Finance roles can manage invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_manage" ON public.invoice_items;

-- Recreate consolidated invoice items policy including 'intern'
CREATE POLICY "Finance roles can manage invoice items" ON public.invoice_items
    FOR ALL USING (public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant', 'intern'));
