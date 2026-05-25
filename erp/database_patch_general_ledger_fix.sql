-- 1. Drop existing general_ledger table
DROP TABLE IF EXISTS public.general_ledger CASCADE;

-- 2. Create general_ledger table with correct schema
CREATE TABLE public.general_ledger (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    transaction_date DATE NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    account_name TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    reference_type TEXT,
    reference_id UUID,
    created_by UUID REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.general_ledger ENABLE ROW LEVEL SECURITY;

-- 4. Recreate RLS policies
DROP POLICY IF EXISTS "Select General Ledger" ON public.general_ledger;
CREATE POLICY "Select General Ledger" ON public.general_ledger FOR SELECT USING (
    public.get_my_role() IN ('super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern')
);

DROP POLICY IF EXISTS "Insert/Update General Ledger" ON public.general_ledger;
CREATE POLICY "Insert/Update General Ledger" ON public.general_ledger FOR ALL USING (
    public.get_my_role() IN ('super_admin', 'admin', 'accountant')
);

-- 5. Add back to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.general_ledger;
