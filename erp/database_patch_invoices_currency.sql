-- =================================================================================
-- THE ANT BOX ERP
-- Database Patch: Invoices Schema Fix & Currency Support
-- Run this in your Supabase SQL Editor (Database > SQL Editor > New Query)
-- =================================================================================

-- Add missing columns to public.invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issued_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- Add new currency column to public.invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
