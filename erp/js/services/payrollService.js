// ============================================================
// THE ANT BOX ERP — payrollService.js
// Payroll generation, deductions, bonuses, payslip export
// Schema: payroll(id, employee_id, month[YYYY-MM], base_salary,
//                 bonuses, deductions, net_salary, status,
//                 created_at, updated_at)
// ============================================================

import getSupabaseClient from './supabaseClient.js';

// ── Helper: build YYYY-MM string ──────────────────────────────
function toMonthKey(month, year) {
  if (typeof month === 'string' && month.includes('-')) return month; // already YYYY-MM
  return `${year}-${String(month).padStart(2, '0')}`;
}

// ── Get Payroll Records ───────────────────────────────────────
export async function getPayrollRecords({ page = 1, pageSize = 20, month = null, year = null, employeeId = null } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  let query = supabase
    .from('payroll')
    .select(`
      *,
      employee:employees(id, full_name, avatar_url, designation, department:departments(name))
    `, { count: 'exact' })
    .range(from, to)
    .order('created_at', { ascending: false });

  if (month && year) query = query.eq('month', toMonthKey(month, year));
  else if (month)    query = query.like('month', `%-${String(month).padStart(2,'0')}`);
  if (employeeId)    query = query.eq('employee_id', employeeId);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0, pages: Math.ceil((count ?? 0) / pageSize) };
}

// ── Get Single Payroll Record ─────────────────────────────────
export async function getPayrollRecord(id) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('payroll')
    .select(`
      *,
      employee:employees(*, department:departments(name))
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// ── Generate Payroll for an Employee ─────────────────────────
export async function generatePayroll(payload) {
  const supabase = await getSupabaseClient();

  const {
    employee_id,
    month,      // can be number or YYYY-MM string
    year,       // only used if month is a number
    base_salary = 0,
    bonus = 0,
    bonuses = 0,           // accept either name
    deductions = 0,
    total_deductions = 0,  // accept either name
    status = 'draft',
  } = payload;

  const monthKey = toMonthKey(month, year);
  const bonusAmt = bonus || bonuses || 0;
  const deductAmt = deductions || total_deductions || 0;
  const netSalary = base_salary + bonusAmt - deductAmt;

  const { data: payroll, error } = await supabase
    .from('payroll')
    .insert({
      employee_id,
      month: monthKey,
      base_salary,
      bonuses: bonusAmt,
      deductions: deductAmt,
      net_salary: netSalary,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return payroll;
}

// ── Bulk Generate Payroll for All Employees ───────────────────
export async function bulkGeneratePayroll(month, year) {
  const supabase = await getSupabaseClient();
  const monthKey = toMonthKey(month, year);

  // Get all active employees with salary
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, salary')
    .in('role', ['employee', 'manager', 'hr'])
    .eq('status', 'active')
    .not('salary', 'is', null);

  if (empErr) throw empErr;

  // Check which already have payroll for this period
  const { data: existing } = await supabase
    .from('payroll')
    .select('employee_id')
    .eq('month', monthKey);

  const alreadyGenerated = new Set((existing || []).map(r => r.employee_id));

  const rows = employees
    .filter(e => !alreadyGenerated.has(e.id))
    .map(e => ({
      employee_id: e.id,
      month: monthKey,
      base_salary: e.salary || 0,
      bonuses: 0,
      deductions: 0,
      net_salary: e.salary || 0,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return { generated: 0, skipped: employees.length };

  const { data, error } = await supabase.from('payroll').insert(rows).select();
  if (error) throw error;

  return { generated: data.length, skipped: alreadyGenerated.size };
}

// ── Update Payroll Status ─────────────────────────────────────
export async function updatePayrollStatus(id, status) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('payroll')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Get Payroll Stats (for dashboard KPI) ────────────────────
export async function getPayrollStats(month, year) {
  const supabase = await getSupabaseClient();
  const monthKey = toMonthKey(month, year);

  const { data, error } = await supabase
    .from('payroll')
    .select('net_salary, status, base_salary, bonuses, deductions')
    .eq('month', monthKey);

  if (error) throw error;

  const total = data.reduce((s, r) => s + (r.net_salary || 0), 0);
  const totalBonus = data.reduce((s, r) => s + (r.bonuses || 0), 0);
  const totalDeductions = data.reduce((s, r) => s + (r.deductions || 0), 0);

  return {
    total_payroll:    total,
    total_bonus:      totalBonus,
    total_deductions: totalDeductions,
    count:   data.length,
    paid:    data.filter(r => r.status === 'paid').length,
    pending: data.filter(r => r.status === 'draft').length,
    // Legacy aliases (so dashboard.js continues to work unchanged)
    net_pay: total,
    bonus: totalBonus,
  };
}

// ── Delete Payroll Record ─────────────────────────────────────
export async function deletePayrollRecord(id) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('payroll').delete().eq('id', id);
  if (error) throw error;
}

// ── Format Currency ───────────────────────────────────────────
export function formatCurrency(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}
