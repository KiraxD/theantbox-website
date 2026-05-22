// ============================================================
// THE ANT BOX ERP — attendanceService.js
// Attendance clock in/out, leave requests, monthly stats
// ============================================================

import getSupabaseClient from './supabaseClient.js';

// ── Today's Attendance for Current User ───────────────────────
export async function getTodayAttendance(userId) {
  const supabase = await getSupabaseClient();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', userId)
    .eq('date', today)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ── Clock In ──────────────────────────────────────────────────
// First clock-in of the day: creates a new attendance row.
// Subsequent clock-ins (after a break): appends a new segment to existing row.
export async function clockIn(userId, note = '') {
  const supabase = await getSupabaseClient();
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Check if there's already a row for today
  const { data: existing } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (!existing) {
    // First check-in of the day — create row with first segment
    const { data, error } = await supabase
      .from('attendance')
      .insert({
        employee_id: userId,
        date: today,
        clock_in: now.toISOString(),
        status: 'present',
        note,
        segments: [{ in: now.toISOString(), out: null }],
        created_at: now.toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    // Returning after a break — append a new open segment
    const segments = Array.isArray(existing.segments) ? existing.segments : [];
    segments.push({ in: now.toISOString(), out: null });
    const { data, error } = await supabase
      .from('attendance')
      .update({
        clock_out: null,        // re-open the record
        segments,
        updated_at: now.toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

// ── Clock Out ─────────────────────────────────────────────────
// Closes the latest open segment and recalculates net work hours
// (total worked time minus all break durations between segments).
export async function clockOut(attendanceId) {
  const supabase = await getSupabaseClient();
  const now = new Date();
  const clockOutTime = now.toISOString();

  // Fetch the full record
  const { data: existing, error: fetchErr } = await supabase
    .from('attendance')
    .select('*')
    .eq('id', attendanceId)
    .single();
  if (fetchErr) throw fetchErr;

  // Close the last open segment
  const segments = Array.isArray(existing.segments) ? [...existing.segments] : [];
  const lastIdx = segments.length - 1;
  if (lastIdx >= 0 && !segments[lastIdx].out) {
    segments[lastIdx] = { ...segments[lastIdx], out: clockOutTime };
  } else {
    // Fallback: if no open segment, add a synthetic one
    segments.push({ in: existing.clock_in || clockOutTime, out: clockOutTime });
  }

  // Recalculate net work time (sum of all segment durations, excluding breaks)
  let netMs = 0;
  for (const seg of segments) {
    if (seg.in && seg.out) {
      netMs += new Date(seg.out) - new Date(seg.in);
    }
  }
  const total_hours = Math.round((netMs / 3600000) * 100) / 100;

  const { data, error } = await supabase
    .from('attendance')
    .update({
      clock_out: clockOutTime,
      total_hours,
      segments,
      updated_at: clockOutTime,
    })
    .eq('id', attendanceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Get Attendance List (paginated) ──────────────────────────
export async function getAttendanceList({
  page = 1, pageSize = 20, employeeId = null,
  startDate = null, endDate = null, status = ''
} = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('attendance')
    .select(`
      *,
      employee:employees(id, full_name, avatar_url, department:departments(name))
    `, { count: 'exact' })
    .range(from, to)
    .order('date', { ascending: false });

  if (employeeId)  query = query.eq('employee_id', employeeId);
  if (startDate)   query = query.gte('date', startDate);
  if (endDate)     query = query.lte('date', endDate);
  if (status)      query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count, pages: Math.ceil(count / pageSize) };
}

// ── Today's Summary (all employees, for dashboard KPI) ──────────────────────────
export async function getTodaySummary() {
  const supabase = await getSupabaseClient();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('attendance')
    .select('employee_id, status, clock_in, clock_out, segments, total_hours, employees(full_name)')
    .eq('date', today);

  if (error) throw error;

  const rows = data || [];

  // Unique employees who checked in today
  const uniqueIds = new Set(rows.map(r => r.employee_id));
  const uniqueCheckIns = uniqueIds.size;

  // Currently clocked in (last segment has no out)
  const currentlyIn = rows.filter(r => {
    const segs = Array.isArray(r.segments) ? r.segments : [];
    if (segs.length > 0) return !segs[segs.length - 1].out;
    return r.clock_in && !r.clock_out;
  });

  // On break = clocked out but has prior segments (could clock in again)
  const onBreak = rows.filter(r => {
    const segs = Array.isArray(r.segments) ? r.segments : [];
    return segs.length > 0 && !!segs[segs.length - 1].out && !r.clock_out;
  });

  // Net hours across all employees today
  let totalNetMs = 0;
  rows.forEach(r => {
    const segs = Array.isArray(r.segments) ? r.segments : [];
    segs.forEach(s => {
      if (s.in && s.out) totalNetMs += new Date(s.out) - new Date(s.in);
    });
    // For active segments, add live time
    if (segs.length > 0 && !segs[segs.length - 1].out && segs[segs.length - 1].in) {
      totalNetMs += Date.now() - new Date(segs[segs.length - 1].in);
    }
  });

  return {
    present:           rows.filter(r => r.status === 'present').length,
    late:              rows.filter(r => r.status === 'late').length,
    absent:            rows.filter(r => r.status === 'absent').length,
    missing_checkout:  currentlyIn.length,
    uniqueCheckIns,
    currentlyInCount:  currentlyIn.length,
    onBreakCount:      onBreak.length,
    totalNetHours:     Math.round((totalNetMs / 3600000) * 10) / 10,
    currentlyInList:   currentlyIn.map(r => ({
      name: r.employees?.full_name || 'Unknown',
      clockIn: r.clock_in,
      segments: r.segments,
    })),
    allRows: rows.map(r => ({
      name: r.employees?.full_name || 'Unknown',
      status: r.status,
      clockIn: r.clock_in,
      clockOut: r.clock_out,
      segments: r.segments,
      totalHours: r.total_hours,
    })),
  };
}

// ── Get Monthly Stats for an Employee ────────────────────────
export async function getMonthlyStats(employeeId, year, month) {
  const supabase = await getSupabaseClient();
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const end = new Date(year, month, 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', start)
    .lte('date', end);

  if (error) throw error;

  let totalHours = 0;
  data.forEach(rec => {
    if (rec.total_hours) {
      totalHours += Number(rec.total_hours);
    } else if (rec.clock_in && rec.clock_out) {
      totalHours += (new Date(rec.clock_out) - new Date(rec.clock_in)) / 3600000;
    }
  });

  return {
    days_present: data.filter(r => r.status === 'present').length,
    days_late:    data.filter(r => r.status === 'late').length,
    days_absent:  data.filter(r => r.status === 'absent').length,
    total_hours:  Math.round(totalHours * 10) / 10,
    records: data,
  };
}

// ── Leave Requests ────────────────────────────────────────────
export async function getLeaveRequests({ page = 1, pageSize = 20, status = '', employeeId = null } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('leave_requests')
    .select(`
      *,
      employee:employees!leave_requests_employee_id_fkey(id, full_name, avatar_url, department:departments(name))
    `, { count: 'exact' })
    .range(from, to)
    .order('created_at', { ascending: false });

  if (status)     query = query.eq('status', status);
  if (employeeId) query = query.eq('employee_id', employeeId);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count, pages: Math.ceil(count / pageSize) };
}

// ── Create Leave Request ──────────────────────────────────────
export async function createLeaveRequest(payload) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('leave_requests')
    .insert({ ...payload, status: 'pending', created_at: new Date().toISOString() })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Approve / Reject Leave ────────────────────────────────────
export async function updateLeaveStatus(leaveId, status, reviewedBy) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('leave_requests')
    .update({ status, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('id', leaveId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Subscribe to Realtime Attendance Updates ──────────────────
export async function subscribeAttendance(callback) {
  const supabase = await getSupabaseClient();
  return supabase
    .channel('attendance-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, callback)
    .subscribe();
}
