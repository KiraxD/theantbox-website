import { bootPage } from './modules/authGuard.js';
import getSupabaseClient from './services/supabaseClient.js';
let supabase;
import * as attendanceService from './services/attendanceService.js';
import { openModal, closeModal, setupModalClosers } from './modules/modal.js';
import { showToast } from './modules/toast.js';
import { initTheme, initSidebar, initLogout, initThemeToggle, initDropdowns } from './modules/ui.js';

const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzzqBKutxOKCLKd2Z2D1ti59mEk_4JvBx6kjw6q6zl0q91MRp8OlCs5LZjU7yvIqxzp/exec';

let currentUser = null;
let todayRecord = null;
let currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
let allRecords = [];
let leaveRequests = [];
let currentReviewLeaveId = null;

async function init() {
  initTheme();
  const ctx = await bootPage();
  if (!ctx) return;
  currentUser = ctx.profile;
  supabase = await getSupabaseClient();

  initSidebar(); initLogout(); initThemeToggle(); initDropdowns();
  setupModalClosers();
  setupUI();
  
  await loadTodayRecord();
  await loadMonthlyRecords();
  await loadLeaveRequests();
  
  if (['hr', 'manager', 'super_admin', 'admin'].includes(currentUser.role)) {
    document.getElementById('admin-actions').style.display = 'flex';
  }
}

function setupUI() {
  const clockToggleBtn = document.getElementById('btn-clock-toggle');
  const monthInput = document.getElementById('month-filter');

  monthInput.value = currentMonth;

  clockToggleBtn?.addEventListener('click', handleClockToggle);

  monthInput.addEventListener('change', (e) => {
    currentMonth = e.target.value;
    loadMonthlyRecords();
  });

  document.getElementById('manual-form')?.addEventListener('submit', handleManualLog);
  document.getElementById('apply-leave-form')?.addEventListener('submit', handleApplyLeave);
  
  const searchInput = document.getElementById('global-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', handleGlobalSearch);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrap')) {
        document.getElementById('search-results-dropdown').style.display = 'none';
      }
    });
  }
  
  document.getElementById('btn-approve-leave')?.addEventListener('click', () => handleReviewLeave('approved'));
  document.getElementById('btn-reject-leave')?.addEventListener('click', () => handleReviewLeave('rejected'));

  document.getElementById('btn-sync-sheets')?.addEventListener('click', () => {
    if (['hr', 'super_admin', 'admin'].includes(currentUser.role)) {
      syncFromSheets();
    } else {
      showToast('error', 'You do not have permission to sync sheets.');
    }
  });
}

const IST = 'Asia/Kolkata';

// Format ms → HH:MM
function msToHHMM(ms) {
  if (!ms || ms < 0) return '00:00';
  const totalMins = Math.floor(ms / 60000);
  const hh = Math.floor(totalMins / 60).toString().padStart(2, '0');
  const mm = (totalMins % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

// Format a Date/ISO string as IST time string (HH:MM AM/PM)
function toIST(ts) {
  if (!ts) return '--:--';
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
    timeZone: IST, hour12: true
  });
}

// Returns true if today's record has an open (no clock_out) last segment
function isCurrentlyIn(record) {
  if (!record) return false;
  const segs = Array.isArray(record.segments) ? record.segments : [];
  if (segs.length > 0) return !segs[segs.length - 1].out;
  return !record.clock_out; // fallback for legacy rows
}

// Compute net worked ms and break ms from segments array
function computeTimes(segments) {
  let netMs = 0, breakMs = 0;
  const closed = (segments || []).filter(s => s.in && s.out);
  closed.forEach(s => { netMs += new Date(s.out) - new Date(s.in); });
  // Breaks = gaps between consecutive closed segments
  for (let i = 1; i < closed.length; i++) {
    const gap = new Date(closed[i].in) - new Date(closed[i - 1].out);
    if (gap > 0) breakMs += gap;
  }
  return { netMs, breakMs, breakCount: Math.max(0, closed.length - 1) };
}

function updateClockStatus() {
  const statusEl   = document.getElementById('current-status-large');
  const btn        = document.getElementById('btn-clock-toggle');
  const todayNote  = document.getElementById('today-activity-note');
  const breaksEl   = document.getElementById('today-breaks-detail');
  if (!btn) return;

  if (!todayRecord) {
    statusEl.textContent = 'Out';
    btn.disabled = false;
    btn.textContent = 'In';
    btn.style.background = 'var(--black)';
    todayNote.innerHTML  = '<span style="color:var(--muted)">No activity recorded yet for today.</span>';
    if (breaksEl) breaksEl.innerHTML = '';
    return;
  }

  const segs = Array.isArray(todayRecord.segments) ? todayRecord.segments : [];
  const currentlyIn = isCurrentlyIn(todayRecord);
  const { netMs, breakMs, breakCount } = computeTimes(segs);

  // ── Active shift ──
  if (currentlyIn) {
    const lastSeg = segs[segs.length - 1];
    const inTime  = toIST(lastSeg?.in || todayRecord.clock_in);
    statusEl.textContent = 'In';
    btn.disabled  = false;
    btn.textContent = 'Out';
    btn.style.background = 'var(--purple)';
    todayNote.innerHTML  = `In: <strong style="color:var(--purple)">${inTime}</strong>`;

    // Show running net time
    const liveNetMs = netMs + (Date.now() - new Date(lastSeg?.in || todayRecord.clock_in));
    if (breaksEl) {
      breaksEl.innerHTML = renderBreakSummary(segs, liveNetMs, breakMs, breakCount, true);
    }
    return;
  }

  // ── Clocked out (day complete or on break) ──
  const hasClockedOutFully = !!todayRecord.clock_out;
  const lastSeg = segs[segs.length - 1];

  statusEl.textContent = 'Out';
  btn.textContent = 'In';
  btn.style.background = 'var(--black)';
  // Allow another In only if last clock-out was today (they can take a break)
  btn.disabled = hasClockedOutFully && segs.length > 0 && !!lastSeg?.out
    ? false   // Always allow re-clock-in for break
    : false;

  const firstIn  = toIST(todayRecord.clock_in);
  const lastOut  = toIST(todayRecord.clock_out);
  todayNote.innerHTML = `In: <strong>${firstIn}</strong> | Out: <strong style="color:var(--purple)">${lastOut}</strong> | Net: <strong>${msToHHMM(netMs)}</strong>`;

  if (breaksEl) {
    breaksEl.innerHTML = renderBreakSummary(segs, netMs, breakMs, breakCount, false);
  }
}

function renderBreakSummary(segs, netMs, breakMs, breakCount, isLive) {
  if (!segs || segs.length === 0) return '';

  let html = `<div class="break-summary" style="margin-top:14px; padding:14px 18px; background:var(--beige-dark); border-radius:12px; font-size:13.5px; line-height:1.7;">`;

  // Each segment
  segs.forEach((seg, i) => {
    const inT  = toIST(seg.in);
    const outT = seg.out ? toIST(seg.out) : (isLive && i === segs.length - 1 ? '(active)' : '--:--');
    const segMs = seg.in && seg.out ? new Date(seg.out) - new Date(seg.in) : 0;
    const segDur = seg.out ? msToHHMM(segMs) : '';
    const label  = i === 0 ? 'Shift start' : `After break ${i}`;
    html += `<div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="color:var(--muted); font-size:12px;">${label}</span>
      <span><strong>${inT}</strong> → <strong style="color:var(--purple)">${outT}</strong>${segDur ? ` <span style="color:var(--muted);font-size:11px;">(${segDur})</span>` : ''}</span>
    </div>`;

    // Break gap between segments
    if (i < segs.length - 1 && seg.out && segs[i + 1]?.in) {
      const brkMs = new Date(segs[i + 1].in) - new Date(seg.out);
      if (brkMs > 0) {
        html += `<div style="display:flex; justify-content:space-between; padding:2px 0; opacity:0.6;">
          <span style="font-size:11px; color:var(--muted);">☕ Break ${i + 1}</span>
          <span style="font-size:11px; color:var(--warning); font-weight:600;">${msToHHMM(brkMs)}</span>
        </div>`;
      }
    }
  });

  // Totals
  html += `<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--line); display:flex; justify-content:space-between;">
    <span style="font-weight:600;">Net worked</span>
    <span style="font-weight:700; color:var(--purple);">${msToHHMM(netMs)}</span>
  </div>`;
  if (breakCount > 0) {
    html += `<div style="display:flex; justify-content:space-between;">
      <span style="color:var(--muted); font-size:12px;">${breakCount} break${breakCount > 1 ? 's' : ''} total</span>
      <span style="color:var(--warning); font-size:12px; font-weight:600;">${msToHHMM(breakMs)}</span>
    </div>`;
  }
  html += '</div>';
  return html;
}

async function handleClockToggle() {
  if (!todayRecord || !isCurrentlyIn(todayRecord)) {
    await handleClockIn();
  } else {
    await handleClockOut();
  }
}

async function handleClockIn() {
  const btn = document.getElementById('btn-clock-toggle');
  try {
    btn.disabled = true;
    todayRecord = await attendanceService.clockIn(currentUser.id);
    const segs = todayRecord.segments || [];
    const msg = segs.length > 1 ? `Back from break #${segs.length - 1}` : 'Clocked in — good morning! ☀️';
    showToast('success', msg);
    updateClockStatus();
    loadMonthlyRecords();
  } catch (err) {
    showToast('error', err.message);
    btn.disabled = false;
  }
}

async function handleClockOut() {
  if (!todayRecord) return;
  const btn = document.getElementById('btn-clock-toggle');
  try {
    btn.disabled = true;
    todayRecord = await attendanceService.clockOut(todayRecord.id);
    const segs = (todayRecord.segments || []).filter(s => s.in && s.out);
    const msg = segs.length > 1
      ? `Clocked out — break started ☕ (${segs.length - 1} break${segs.length > 2 ? 's' : ''} today)`
      : 'Clocked out — see you!';
    showToast('success', msg);
    updateClockStatus();
    loadMonthlyRecords();
  } catch (err) {
    showToast('error', err.message);
    btn.disabled = false;
  }
}


async function loadMonthlyRecords() {
  const tbody = document.getElementById('attendance-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><div class="skeleton" style="height:20px;width:100px;margin:auto;"></div></td></tr>';

  try {
    let query = supabase
      .from('attendance')
      .select('*, employees(full_name)')
      .gte('date', `${currentMonth}-01`)
      .lte('date', `${currentMonth}-31`)
      .order('date', { ascending: false });

    // Regular users only see their own
    if (!['hr', 'manager', 'super_admin', 'admin'].includes(currentUser.role)) {
      query = query.eq('employee_id', currentUser.id);
      document.querySelector('.col-emp-name').style.display = 'none'; // hide column
    } else {
      document.querySelector('.col-emp-name').style.display = 'table-cell';
    }

    const { data, error } = await query;
    if (error) throw error;

    allRecords = data;
    renderRecords();
  } catch (err) {
    showToast('Failed to load records', 'error');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading data</td></tr>';
  }
}

function renderRecords() {
  const tbody = document.getElementById('attendance-tbody');
  tbody.innerHTML = '';

  if (allRecords.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No records for this month</td></tr>`;
    return;
  }

  const isAdmin = ['hr', 'manager', 'super_admin', 'admin'].includes(currentUser.role);

  allRecords.forEach(record => {
    const segs = Array.isArray(record.segments) ? record.segments : [];
    const { netMs, breakMs, breakCount } = computeTimes(segs);
    const isActive = isCurrentlyIn(record);

    // Date formatted in IST
    const dateStr = new Date(record.date + 'T00:00:00+05:30').toLocaleDateString('en-IN', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: IST
    });

    // First In / Last Out in IST
    const inStr  = record.clock_in  ? toIST(record.clock_in)  : '--:--';
    const outStr = record.clock_out ? toIST(record.clock_out) : (isActive ? '(active)' : '--:--');

    // Net hours in HH:MM — live calc for active
    let hoursStr = '--:--';
    if (isActive) {
      const lastSeg = segs[segs.length - 1];
      const liveMs  = netMs + (lastSeg?.in ? Date.now() - new Date(lastSeg.in) : 0);
      hoursStr = `<span style="color:var(--purple);font-weight:600">${msToHHMM(liveMs)}</span> <span class="badge badge-purple" style="font-size:10px;padding:2px 7px;">Active</span>`;
    } else if (netMs > 0) {
      hoursStr = `<strong>${msToHHMM(netMs)}</strong>`;
    } else if (record.total_hours) {
      // Fallback for legacy rows without segments
      const legMs = record.total_hours * 3600000;
      hoursStr = `<strong>${msToHHMM(legMs)}</strong>`;
    }

    // Breaks cell
    let breaksStr = '<span style="color:var(--muted-light)">—</span>';
    if (breakCount > 0) {
      breaksStr = `<span style="color:var(--warning);font-weight:600">${breakCount}×</span> <span style="color:var(--muted);font-size:12px">${msToHHMM(breakMs)}</span>`;
    } else if (isActive && segs.length > 0) {
      breaksStr = '<span style="color:var(--muted-light);font-size:12px">none yet</span>';
    }

    let statusBadge = '';
    if (record.status === 'present')  statusBadge = `<span class="badge badge-success">Present</span>`;
    else if (record.status === 'absent')   statusBadge = `<span class="badge badge-danger">Absent</span>`;
    else if (record.status === 'half_day') statusBadge = `<span class="badge badge-warning">Half Day</span>`;
    else if (record.status === 'leave')    statusBadge = `<span class="badge badge-info">Leave</span>`;
    else statusBadge = `<span class="badge badge-secondary">${record.status}</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      ${isAdmin ? `<td>${record.employees?.full_name || 'Unknown'}</td>` : ''}
      <td>${dateStr}</td>
      <td>${inStr}</td>
      <td>${outStr}</td>
      <td>${hoursStr}</td>
      <td>${breaksStr}</td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function handleManualLog(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  
  const empId = formData.get('employee_id') || currentUser.id;
  const date = formData.get('date');
  const clockIn = formData.get('clock_in');
  const clockOut = formData.get('clock_out');
  const status = formData.get('status');

  try {
    let clock_in_full = null;
    let clock_out_full = null;
    let total_hours = 0;

    if (clockIn) clock_in_full = `${date}T${clockIn}:00Z`;
    if (clockOut) clock_out_full = `${date}T${clockOut}:00Z`;

    if (clockIn && clockOut) {
      const inTime = new Date(`${date}T${clockIn}:00`);
      const outTime = new Date(`${date}T${clockOut}:00`);
      total_hours = (outTime - inTime) / (1000 * 60 * 60);
      if (total_hours < 0) total_hours = 0;
    }

    const { error } = await supabase.from('attendance').upsert({
      employee_id: empId,
      date: date,
      clock_in: clock_in_full,
      clock_out: clock_out_full,
      status: status,
      total_hours: total_hours
    });

    if (error) throw error;

    showToast('success', 'Record saved successfully');
    closeModal('manual-modal');
    e.target.reset();
    
    if (date === new Date().toISOString().split('T')[0] && empId === currentUser.id) {
      loadTodayRecord();
    }
    loadMonthlyRecords();

  } catch(err) {
    showToast(err.message, 'error');
  }
}

// Load users for admin manual log
document.getElementById('btn-manual-log')?.addEventListener('click', async () => {
  if (['hr', 'manager', 'super_admin', 'admin'].includes(currentUser.role)) {
    const { data } = await supabase.from('employees').select('id, full_name').order('full_name');
    const select = document.getElementById('employee_id');
    if (select && data) {
      select.innerHTML = '<option value="">Select Employee</option>' + data.map(e => `<option value="${e.id}">${e.full_name}</option>`).join('');
      select.parentElement.style.display = 'block';
    }
  } else {
    const select = document.getElementById('employee_id');
    if (select) select.parentElement.style.display = 'none';
  }
  document.getElementById('manual-date').value = new Date().toISOString().split('T')[0];
});

// -- Leave Requests Logic ----------------------------------------------------

async function loadLeaveRequests() {
  const listEl = document.getElementById('leave-requests-list');
  const badgeEl = document.getElementById('leave-waiting-badge');
  if (!listEl) return;

  try {
    const isAdmin = ['hr', 'manager', 'super_admin', 'admin'].includes(currentUser.role);
    let query = supabase
      .from('leave_requests')
      .select('*, employee:employees!leave_requests_employee_id_fkey(full_name)')
      .order('created_at', { ascending: false });

    if (isAdmin) {
      query = query.or(`employee_id.eq.${currentUser.id},status.eq.pending`);
    } else {
      query = query.eq('employee_id', currentUser.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    leaveRequests = data || [];
    renderLeaveRequests();
  } catch (err) {
    console.error('Error loading leave requests:', err);
    listEl.innerHTML = `<li class="text-danger text-sm py-2" style="list-style: none;">Error loading leave requests: ${err.message}</li>`;
    if (badgeEl) badgeEl.style.display = 'none';
  }
}

function renderLeaveRequests() {
  const listEl = document.getElementById('leave-requests-list');
  const badgeEl = document.getElementById('leave-waiting-badge');
  
  if (!listEl) return;
  listEl.innerHTML = '';
  
  const isAdmin = ['hr', 'manager', 'super_admin', 'admin'].includes(currentUser.role);

  if (leaveRequests.length === 0) {
    listEl.innerHTML = isAdmin 
      ? '<li class="text-muted text-sm py-2">No pending leave requests.</li>'
      : '<li class="text-muted text-sm py-2">No leave requests found.</li>';
    badgeEl.style.display = 'none';
    return;
  }

  // Update badge count
  const pendingCount = leaveRequests.filter(r => r.status === 'pending').length;
  if (isAdmin) {
    const pendingOthersCount = leaveRequests.filter(r => r.status === 'pending' && r.employee_id !== currentUser.id).length;
    if (pendingOthersCount > 0) {
      badgeEl.textContent = `${pendingOthersCount} waiting`;
      badgeEl.style.display = 'inline-flex';
    } else {
      badgeEl.style.display = 'none';
    }
  } else {
    if (pendingCount === 0) {
      badgeEl.style.display = 'none';
    } else {
      badgeEl.textContent = `${pendingCount} pending`;
      badgeEl.style.display = 'inline-flex';
    }
  }

  leaveRequests.forEach(req => {
    const li = document.createElement('li');
    li.className = 'activity-item';
    li.style = 'background: var(--beige-dark); border-radius: 12px; padding: 16px; margin-bottom: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--line); transition: all 0.2s ease;';
    
    // Hover effect
    li.addEventListener('mouseenter', () => li.style.transform = 'translateY(-2px)');
    li.addEventListener('mouseleave', () => li.style.transform = 'none');
    
    let empName = req.employee?.full_name || 'Unknown';
    if (req.employee_id === currentUser.id) {
      empName = 'You';
    }

    const start = new Date(req.start_date).toLocaleDateString([], {day: 'numeric', month: 'short'});
    const end = new Date(req.end_date).toLocaleDateString([], {day: 'numeric', month: 'short'});
    const dateRange = start === end ? start : `${start} to ${end}`;

    // Color badges for employee leaves list
    let badgeHtml = '';
    let badgeClass = 'badge-secondary';
    let statusText = 'Pending';
    if (req.status === 'approved') {
      badgeClass = 'badge-success';
      statusText = 'Approved';
    } else if (req.status === 'rejected') {
      badgeClass = 'badge-danger';
      statusText = 'Rejected';
    } else if (req.status === 'pending') {
      badgeClass = 'badge-warning';
      statusText = 'Pending';
    }
    badgeHtml = `<span class="badge ${badgeClass}" style="margin-left: 8px; font-size: 11px; padding: 4px 10px; border-radius: 99px;">${statusText}</span>`;

    li.innerHTML = `
      <div style="display:flex; flex-direction: column;">
        <span class="text-black fw-600" style="font-size: 15px;">${empName}</span>
        <span class="text-muted text-sm" style="margin-top: 2px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
          ${req.leave_type} | ${dateRange} ${badgeHtml}
        </span>
      </div>
      <div style="color: var(--muted-light);">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `;

    li.addEventListener('click', () => openReviewModal(req));
    listEl.appendChild(li);
  });
}

function openReviewModal(req) {
  const isAdmin = ['hr', 'manager', 'super_admin', 'admin'].includes(currentUser.role);
  const detailsEl = document.getElementById('review-leave-details');
  const actionsEl = document.getElementById('review-leave-actions');
  
  if (!detailsEl) return;
  
  currentReviewLeaveId = req.id;
  
  const empName = req.employee_id === currentUser.id ? 'You' : (req.employee?.full_name || 'Unknown');
  const start = new Date(req.start_date).toLocaleDateString();
  const end = new Date(req.end_date).toLocaleDateString();
  
  let statusHtml = '';
  let badgeClass = 'badge-secondary';
  let statusText = 'Pending';
  if (req.status === 'approved') {
    badgeClass = 'badge-success';
    statusText = 'Approved';
  } else if (req.status === 'rejected') {
    badgeClass = 'badge-danger';
    statusText = 'Rejected';
  } else if (req.status === 'pending') {
    badgeClass = 'badge-warning';
    statusText = 'Pending';
  }
  statusHtml = `<p style="margin-bottom: 8px;"><strong>Status:</strong> <span class="badge ${badgeClass}" style="float:right;">${statusText}</span></p>`;

  detailsEl.innerHTML = `
    <div style="background: var(--beige-dark); padding: 16px; border-radius: 12px; margin-bottom: 16px;">
      <p style="margin-bottom: 8px;"><strong>Employee:</strong> <span style="float:right;">${empName}</span></p>
      <p style="margin-bottom: 8px;"><strong>Leave Type:</strong> <span style="float:right;">${req.leave_type}</span></p>
      <p style="margin-bottom: 8px;"><strong>Start Date:</strong> <span style="float:right;">${start}</span></p>
      <p style="margin-bottom: 8px;"><strong>End Date:</strong> <span style="float:right;">${end}</span></p>
      ${statusHtml}
    </div>
    <div style="background: var(--beige-dark); padding: 16px; border-radius: 12px;">
      <p style="margin-bottom: 4px;"><strong>Reason:</strong></p>
      <p class="text-muted" style="white-space: pre-wrap;">${req.reason || 'None provided'}</p>
    </div>
  `;

  if (isAdmin && req.status === 'pending' && req.employee_id !== currentUser.id) {
    actionsEl.style.display = 'flex';
  } else {
    actionsEl.style.display = 'none'; // Users, own requests, or already reviewed leaves can just view details
  }

  openModal('review-leave-modal');
}

async function handleApplyLeave(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  
  const leave_type = formData.get('leave_type');
  const start_date = formData.get('leave_start');
  const end_date = formData.get('leave_end');
  const reason = formData.get('leave_reason');

  try {
    const { error } = await supabase.from('leave_requests').insert({
      employee_id: currentUser.id,
      leave_type,
      start_date,
      end_date,
      reason,
      status: 'pending'
    });

    if (error) throw error;

    showToast('success', 'Leave request submitted successfully');
    closeModal('apply-leave-modal');
    e.target.reset();
    loadLeaveRequests();
  } catch (err) {
    showToast('error', err.message);
  }
}

async function handleReviewLeave(status) {
  if (!currentReviewLeaveId) return;
  
  try {
    const { error } = await supabase.from('leave_requests')
      .update({ 
        status: status,
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', currentReviewLeaveId);

    if (error) throw error;

    showToast('success', `Leave request ${status}`);
    closeModal('review-leave-modal');
    loadLeaveRequests();
  } catch (err) {
    showToast('error', err.message);
  }
}

// -- Global Search Logic -----------------------------------------------------

let searchTimeout;
async function handleGlobalSearch(e) {
  const query = e.target.value.trim().toLowerCase();
  const dropdown = document.getElementById('search-results-dropdown');
  
  if (query.length < 2) {
    dropdown.style.display = 'none';
    return;
  }
  
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, role')
        .ilike('full_name', `%${query}%`)
        .limit(5);

      if (error) throw error;

      dropdown.innerHTML = '';
      if (data && data.length > 0) {
        data.forEach(emp => {
          const item = document.createElement('a');
          item.href = `/erp/pages/employees.html?id=${emp.id}`;
          item.style = 'display: block; padding: 12px 16px; border-bottom: 1px solid var(--line); color: var(--text); text-decoration: none;';
          item.innerHTML = `<strong>${emp.full_name}</strong> <span class="text-xs text-muted">(${emp.role})</span>`;
          item.addEventListener('mouseenter', () => { item.style.background = 'var(--beige-mid)'; });
          item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
          dropdown.appendChild(item);
        });
      } else {
        dropdown.innerHTML = '<div style="padding: 12px 16px; color: var(--muted);">No results found</div>';
      }

      dropdown.style.display = 'block';
    } catch(err) {
      console.error(err);
    }
  }, 300);
}

// Ensure loadTodayRecord is restored since we removed it in the earlier chunk replace by accident
async function loadTodayRecord() {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', currentUser.id)
    .eq('date', today)
    .single();

  if (data) {
    todayRecord = data;
  }
  updateClockStatus();
}

// -- Google Sheets Sync -------------------------------------------------------

async function fetchGAS(action) {
  const response = await fetch(GAS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action })
  });
  if (!response.ok) throw new Error(`GAS HTTP error: ${response.status}`);
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'GAS request failed');
  return data;
}

// Convert a UTC timestamp string to YYYY-MM-DD in the browser's local timezone
function toLocalDateStr(utcTimestamp) {
  const d = new Date(utcTimestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function syncFromSheets() {
  const btn = document.getElementById('btn-sync-sheets');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      Syncing…`;
  }

  try {
    // 1. Fetch GAS users and logs in parallel
    showToast('info', 'Fetching data from Google Sheets…');
    const [gasUsersRes, gasLogsRes] = await Promise.all([
      fetchGAS('getUsers'),
      fetchGAS('getLogs')
    ]);

    const gasUsers = gasUsersRes.users || [];
    const gasLogs  = gasLogsRes.logs  || [];

    if (gasLogs.length === 0) {
      showToast('info', 'No logs found in Google Sheets.');
      return;
    }

    // 2. Build GAS UserID → email/name map
    const gasUserIdToInfo = {};
    gasUsers.forEach(u => {
      if (u.UserID) {
        const name = u.Name ? u.Name.trim() : '';
        let email = u.Email ? u.Email.toLowerCase().trim() : '';
        if (!email && name) {
          email = name.toLowerCase().split(/\s+/).join('.') + '@temp-antbox.com';
        }
        gasUserIdToInfo[u.UserID] = {
          email,
          name
        };
      }
    });

    // Extract logs-only users
    gasLogs.forEach(l => {
      const uid = l.UserID;
      const name = l.Name ? l.Name.trim() : '';
      if (uid && !gasUserIdToInfo[uid] && name) {
        const fallbackEmail = name.toLowerCase().split(/\s+/).join('.') + '@temp-antbox.com';
        gasUserIdToInfo[uid] = {
          email: fallbackEmail,
          name: name
        };
      }
    });

    // 3. Fetch Supabase employees and build email/name maps
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, email, full_name');
    if (empError) throw empError;

    const emailToEmp = {};
    const nameToEmp = {};
    employees.forEach(emp => {
      if (emp.email) emailToEmp[emp.email.toLowerCase().trim()] = emp;
      if (emp.full_name) nameToEmp[emp.full_name.toLowerCase().trim()] = emp;
    });

    // 4. Match GAS UserIDs to Supabase employee_ids
    const gasUserIdToEmpId = {};
    const missingGASUsers = [];

    Object.entries(gasUserIdToInfo).forEach(([userId, info]) => {
      const emailKey = info.email;
      const nameKey = info.name.toLowerCase();

      if (emailKey && emailToEmp[emailKey]) {
        gasUserIdToEmpId[userId] = emailToEmp[emailKey].id;
      } else if (nameKey && nameToEmp[nameKey]) {
        gasUserIdToEmpId[userId] = nameToEmp[nameKey].id;
      } else {
        missingGASUsers.push({ userId, ...info });
      }
    });

    // 5. Auto-create missing employees in Supabase
    if (missingGASUsers.length > 0) {
      showToast('info', `Provisioning ${missingGASUsers.length} new employees from sheets...`);
      const newEmpRecords = missingGASUsers.map(u => ({
        full_name: u.name || 'Unknown Employee',
        email: u.email || `unknown_${u.userId.toLowerCase()}@temp-antbox.com`,
        role: 'employee',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { data: createdEmps, error: insertError } = await supabase
        .from('employees')
        .insert(newEmpRecords)
        .select();

      if (insertError) {
        console.error('Error auto-creating employees:', insertError);
      } else if (createdEmps) {
        createdEmps.forEach(emp => {
          const matchingGAS = missingGASUsers.find(u => 
            (u.email && u.email === emp.email) ||
            (u.name.toLowerCase() === emp.full_name.toLowerCase())
          );
          if (matchingGAS) {
            gasUserIdToEmpId[matchingGAS.userId] = emp.id;
          }
        });
      }
    }

    // 6. Group logs by (employee_id, localDate)
    const grouped = {}; // key: `${empId}__${date}`

    gasLogs.forEach(log => {
      const empId = gasUserIdToEmpId[log.UserID];
      if (!empId) return; // skip logs with no matching employee (should be none now)

      const localDate = toLocalDateStr(log.Timestamp);
      const key = `${empId}__${localDate}`;

      if (!grouped[key]) {
        grouped[key] = { empId, date: localDate, ins: [], outs: [] };
      }

      const ts = log.Timestamp;
      if (log.Status === 'IN') {
        grouped[key].ins.push(ts);
      } else if (log.Status === 'OUT') {
        grouped[key].outs.push(ts);
      }
    });

    const groupedValues = Object.values(grouped);
    if (groupedValues.length === 0) {
      showToast('info', 'No matching employees found in sheets logs.');
      return;
    }

    // 7. Build upsert records (reconstructing segments)
    const records = groupedValues.map(group => {
      // Reconstruct chronological segments
      const allEvents = [];
      group.ins.forEach(t => allEvents.push({ type: 'IN', time: new Date(t) }));
      group.outs.forEach(t => allEvents.push({ type: 'OUT', time: new Date(t) }));
      allEvents.sort((a, b) => a.time - b.time);

      const segments = [];
      let activeSegment = null;

      allEvents.forEach(evt => {
        if (evt.type === 'IN') {
          if (activeSegment) {
            activeSegment.out = evt.time.toISOString();
            segments.push(activeSegment);
          }
          activeSegment = { in: evt.time.toISOString(), out: null };
        } else if (evt.type === 'OUT') {
          if (activeSegment) {
            activeSegment.out = evt.time.toISOString();
            segments.push(activeSegment);
            activeSegment = null;
          } else {
            segments.push({ in: evt.time.toISOString(), out: evt.time.toISOString() });
          }
        }
      });
      if (activeSegment) {
        segments.push(activeSegment);
      }

      const clock_in = segments.length > 0 ? segments[0].in : null;
      const clock_out = (segments.length > 0 && !activeSegment) ? segments[segments.length - 1].out : null;

      let netMs = 0;
      segments.forEach(s => {
        if (s.in && s.out) netMs += new Date(s.out) - new Date(s.in);
      });
      const total_hours = netMs / 3600000;

      const status = clock_in
        ? (total_hours < 4 ? 'half_day' : 'present')
        : 'absent';

      return {
        employee_id: group.empId,
        date:        group.date,
        clock_in,
        clock_out,
        segments,
        total_hours: parseFloat(total_hours.toFixed(2)),
        status
      };
    });

    // 8. Upsert — conflict on composite key (employee_id, date)
    const { error: upsertError } = await supabase
      .from('attendance')
      .upsert(records, { onConflict: 'employee_id,date' });

    if (upsertError) throw upsertError;

    showToast('success', `✓ Synced ${records.length} record${records.length !== 1 ? 's' : ''} from Google Sheets`);
    await loadMonthlyRecords();
    await loadTodayRecord();

  } catch (err) {
    console.error('Sheets sync error:', err);
    showToast('error', 'Sync failed: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        Sync Sheets`;
    }
  }
}

init();
