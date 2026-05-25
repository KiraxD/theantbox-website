-- ============================================================
-- THE ANT BOX ERP — database_patch_notices.sql
-- Notice Board & Emojis Reactions Tables
-- ============================================================

-- 1. Create notices table
CREATE TABLE IF NOT EXISTS public.notices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- 2. Create notice_reactions table
CREATE TABLE IF NOT EXISTS public.notice_reactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    notice_id UUID REFERENCES public.notices(id) ON DELETE CASCADE NOT NULL,
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
    reaction_type TEXT NOT NULL CHECK (reaction_type IN ('thumbs_up', 'heart', 'clap', 'fire')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_notice_emp_reaction UNIQUE (notice_id, employee_id, reaction_type)
);

-- 3. Enable RLS
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_reactions ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for notices
DROP POLICY IF EXISTS "Select Notices" ON public.notices;
CREATE POLICY "Select Notices" ON public.notices FOR SELECT USING (true);

DROP POLICY IF EXISTS "Modify Notices" ON public.notices;
CREATE POLICY "Modify Notices" ON public.notices FOR ALL USING (public.get_my_role() IN ('super_admin', 'hr'));

-- 5. Create RLS Policies for notice_reactions
DROP POLICY IF EXISTS "Select Reactions" ON public.notice_reactions;
CREATE POLICY "Select Reactions" ON public.notice_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Insert Reactions" ON public.notice_reactions;
CREATE POLICY "Insert Reactions" ON public.notice_reactions FOR INSERT WITH CHECK (auth.uid() = employee_id);

DROP POLICY IF EXISTS "Delete Reactions" ON public.notice_reactions;
CREATE POLICY "Delete Reactions" ON public.notice_reactions FOR DELETE USING (auth.uid() = employee_id);

-- 6. Grant privileges
GRANT ALL PRIVILEGES ON public.notices TO authenticated;
GRANT ALL PRIVILEGES ON public.notice_reactions TO authenticated;
