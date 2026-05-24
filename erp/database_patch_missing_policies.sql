-- =================================================================================
-- THE ANT BOX ERP — Database Schema Patch for Missing RLS Policies
-- Run this in your Supabase SQL Editor to define policies for tables that have RLS enabled but lack policies
-- =================================================================================

-- 1. expenses
DROP POLICY IF EXISTS "Select Expenses" ON public.expenses;
CREATE POLICY "Select Expenses" ON public.expenses FOR SELECT USING (
  auth.uid() = employee_id OR
  public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant', 'manager')
);

DROP POLICY IF EXISTS "Insert Expenses" ON public.expenses;
CREATE POLICY "Insert Expenses" ON public.expenses FOR INSERT WITH CHECK (
  auth.uid() = employee_id
);

DROP POLICY IF EXISTS "Modify Expenses" ON public.expenses;
CREATE POLICY "Modify Expenses" ON public.expenses FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant')
);

-- 2. inventory_categories
DROP POLICY IF EXISTS "Select Inventory Categories" ON public.inventory_categories;
CREATE POLICY "Select Inventory Categories" ON public.inventory_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Modify Inventory Categories" ON public.inventory_categories;
CREATE POLICY "Modify Inventory Categories" ON public.inventory_categories FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'admin', 'manager')
);

-- 3. inventory_transactions
DROP POLICY IF EXISTS "Select Inventory Transactions" ON public.inventory_transactions;
CREATE POLICY "Select Inventory Transactions" ON public.inventory_transactions FOR SELECT USING (
  public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Modify Inventory Transactions" ON public.inventory_transactions;
CREATE POLICY "Modify Inventory Transactions" ON public.inventory_transactions FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'admin', 'manager')
);

-- 4. inventory_warehouses
DROP POLICY IF EXISTS "Select Inventory Warehouses" ON public.inventory_warehouses;
CREATE POLICY "Select Inventory Warehouses" ON public.inventory_warehouses FOR SELECT USING (true);

DROP POLICY IF EXISTS "Modify Inventory Warehouses" ON public.inventory_warehouses;
CREATE POLICY "Modify Inventory Warehouses" ON public.inventory_warehouses FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'admin', 'manager')
);

-- 5. payroll_items
DROP POLICY IF EXISTS "Select Payroll Items" ON public.payroll_items;
CREATE POLICY "Select Payroll Items" ON public.payroll_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.payroll p
    WHERE p.id = payroll_id AND p.employee_id = auth.uid()
  ) OR
  public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant', 'manager')
);

DROP POLICY IF EXISTS "Modify Payroll Items" ON public.payroll_items;
CREATE POLICY "Modify Payroll Items" ON public.payroll_items FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'admin', 'hr', 'accountant')
);

-- 6. salary_components
DROP POLICY IF EXISTS "Select Salary Components" ON public.salary_components;
CREATE POLICY "Select Salary Components" ON public.salary_components FOR SELECT USING (true);

DROP POLICY IF EXISTS "Modify Salary Components" ON public.salary_components;
CREATE POLICY "Modify Salary Components" ON public.salary_components FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'admin', 'hr')
);

-- 7. sales_pipeline_stages
DROP POLICY IF EXISTS "Select Sales Pipeline Stages" ON public.sales_pipeline_stages;
CREATE POLICY "Select Sales Pipeline Stages" ON public.sales_pipeline_stages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Modify Sales Pipeline Stages" ON public.sales_pipeline_stages;
CREATE POLICY "Modify Sales Pipeline Stages" ON public.sales_pipeline_stages FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'admin')
);

-- 8. system_settings
DROP POLICY IF EXISTS "Select System Settings" ON public.system_settings;
CREATE POLICY "Select System Settings" ON public.system_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Modify System Settings" ON public.system_settings;
CREATE POLICY "Modify System Settings" ON public.system_settings FOR ALL USING (
  public.get_my_role() IN ('super_admin', 'admin')
);
