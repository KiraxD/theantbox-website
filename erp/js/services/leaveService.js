// ============================================================
// THE ANT BOX ERP — leaveService.js
// Leave management, approvals, balance tracking
// ============================================================

import getSupabaseClient from './supabaseClient.js';

// ── Get Leave Types ───────────────────────────────────────────
export async function getLeaveTypes() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('status', 'active')
    .order('name');

  if (error) throw new Error(`Failed to fetch leave types: ${error.message}`);
  return data ?? [];
}

// ── Get Leave Balance for Employee ─────────────────────────────
export async function getLeaveBalance(employeeId, year = new Date().getFullYear()) {
  const supabase = await getSupabaseClient();
  
  // Get all leave types
  const { data: leaveTypes, error: typesError } = await supabase
    .from('leave_types')
    .select('*')
    .eq('status', 'active');

  if (typesError) throw new Error(`Failed to fetch leave types: ${typesError.message}`);

  // Get all approved leaves for this employee in this year
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data: approvedLeaves, error: leavesError } = await supabase
    .from('leaves')
    .select('leave_type_id, total_days')
    .eq('employee_id', employeeId)
    .eq('status', 'approved')
    .gte('start_date', startDate)
    .lte('end_date', endDate);

  if (leavesError) throw new Error(`Failed to fetch leaves: ${leavesError.message}`);

  // Calculate balance for each leave type
  const balance = {};
  (leaveTypes || []).forEach(type => {
    const taken = (approvedLeaves || [])
      .filter(l => l.leave_type_id === type.id)
      .reduce((sum, l) => sum + (l.total_days || 0), 0);

    balance[type.id] = {
      leave_type_id: type.id,
      leave_type_name: type.name,
      total_days: type.days_per_year || 0,
      taken_days: taken,
      remaining_days: Math.max(0, (type.days_per_year || 0) - taken),
      is_paid: type.is_paid,
    };
  });

  return balance;
}

// ── Create Leave Request ──────────────────────────────────────
export async function createLeaveRequest(payload) {
  const supabase = await getSupabaseClient();

  const {
    employee_id,
    leave_type_id,
    start_date,
    end_date,
    reason,
  } = payload;

  if (!employee_id || !leave_type_id || !start_date || !end_date || !reason) {
    throw new Error('Missing required fields: employee_id, leave_type_id, start_date, end_date, reason');
  }

  // Calculate total days
  const start = new Date(start_date);
  const end = new Date(end_date);
  const diffTime = Math.abs(end - start);
  const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  // Check leave balance
  const balance = await getLeaveBalance(employee_id);
  const leaveTypeBalance = Object.values(balance).find(b => b.leave_type_id === leave_type_id);
  
  if (!leaveTypeBalance) {
    throw new Error('Invalid leave type');
  }

  if (leaveTypeBalance.remaining_days < totalDays) {
    throw new Error(`Insufficient leave balance. Available: ${leaveTypeBalance.remaining_days} days`);
  }

  // Check for overlapping leaves
  const { data: overlapping, error: overlapError } = await supabase
    .from('leaves')
    .select('id')
    .eq('employee_id', employee_id)
    .in('status', ['pending', 'approved'])
    .gte('start_date', start_date)
    .lte('end_date', end_date)
    .limit(1);

  if (overlapError) throw new Error(`Failed to check overlapping leaves: ${overlapError.message}`);
  if (overlapping && overlapping.length > 0) {
    throw new Error('You already have a leave request for these dates');
  }

  const { data, error } = await supabase
    .from('leaves')
    .insert({
      employee_id,
      leave_type_id,
      start_date,
      end_date,
      total_days: totalDays,
      reason,
      status: 'pending',
      requested_by: (await supabase.auth.getSession()).data.session?.user.id,
      created_at: new Date().toISOString(),
    })
    .select('*, leave_type:leave_types(name)')
    .single();

  if (error) throw new Error(`Failed to create leave request: ${error.message}`);
  return data;
}

// ── Get Leave Requests (paginated, filterable) ────────────────
export async function getLeaveRequests({ page = 1, pageSize = 20, status = '', employeeId = null, year = new Date().getFullYear() } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  let query = supabase
    .from('leaves')
    .select(`
      *,
      employee:employees!employee_id(id, full_name, avatar_url, department:departments(name)),
      leave_type:leave_types(name, color_code, is_paid),
      approved_by_emp:employees!approved_by(full_name)
    `, { count: 'exact' })
    .gte('start_date', startDate)
    .lte('end_date', endDate)
    .range(from, to)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (employeeId) query = query.eq('employee_id', employeeId);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to fetch leave requests: ${error.message}`);
  return { data: data ?? [], count: count ?? 0, pages: Math.ceil((count ?? 0) / pageSize) };
}

// ── Approve/Reject Leave Request ──────────────────────────────
export async function updateLeaveStatus(leaveId, status, remarks = '') {
  const supabase = await getSupabaseClient();

  if (!['approved', 'rejected', 'cancelled'].includes(status)) {
    throw new Error('Invalid status. Must be: approved, rejected, or cancelled');
  }

  const session = await supabase.auth.getSession();
  const currentUserId = session.data.session?.user.id;

  const { data, error } = await supabase
    .from('leaves')
    .update({
      status,
      approved_by: ['approved', 'rejected'].includes(status) ? currentUserId : null,
      approval_date: ['approved', 'rejected'].includes(status) ? new Date().toISOString() : null,
      remarks,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leaveId)
    .select(`
      *,
      employee:employees!employee_id(id, full_name, email),
      leave_type:leave_types(name)
    `)
    .single();

  if (error) throw new Error(`Failed to update leave status: ${error.message}`);
  return data;
}

// ── Get Pending Leave Approvals (for managers/hr) ──────────────
export async function getPendingLeavesForApproval() {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('leaves')
    .select(`
      *,
      employee:employees!employee_id(id, full_name, avatar_url, department:departments(name)),
      leave_type:leave_types(name, color_code)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch pending leaves: ${error.message}`);
  return data ?? [];
}

// ── Get Pending Leaves Count (for dashboard KPI) ───────────────
export async function getPendingLeavesCount(userId = null) {
  const supabase = await getSupabaseClient();

  let query = supabase
    .from('leaves')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (userId) {
    query = query.eq('employee_id', userId);
  }

  const { count, error } = await query;

  if (error) throw new Error(`Failed to count pending leaves: ${error.message}`);
  return count ?? 0;
}

// ── Get Leave Statistics ──────────────────────────────────────
export async function getLeaveStats(year = new Date().getFullYear()) {
  const supabase = await getSupabaseClient();

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data, error } = await supabase
    .from('leaves')
    .select('status, total_days')
    .gte('start_date', startDate)
    .lte('end_date', endDate);

  if (error) throw new Error(`Failed to fetch leave statistics: ${error.message}`);

  const stats = {
    total: data.length,
    pending: data.filter(l => l.status === 'pending').length,
    approved: data.filter(l => l.status === 'approved').length,
    rejected: data.filter(l => l.status === 'rejected').length,
    total_days_approved: data
      .filter(l => l.status === 'approved')
      .reduce((sum, l) => sum + (l.total_days || 0), 0),
  };

  return stats;
}

// ── Delete Leave Request (only if pending) ────────────────────
export async function deleteLeaveRequest(leaveId) {
  const supabase = await getSupabaseClient();

  // Check if leave is still pending
  const { data: leave, error: fetchError } = await supabase
    .from('leaves')
    .select('status')
    .eq('id', leaveId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch leave: ${fetchError.message}`);
  if (leave.status !== 'pending') {
    throw new Error('Can only delete pending leave requests');
  }

  const { error } = await supabase
    .from('leaves')
    .delete()
    .eq('id', leaveId);

  if (error) throw new Error(`Failed to delete leave request: ${error.message}`);
}
