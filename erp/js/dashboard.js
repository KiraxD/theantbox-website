// ============================================================
// THE ANT BOX ERP — dashboard.js
// Dashboard KPIs, charts, activity feed, realtime
// ============================================================

import { bootPage } from './modules/authGuard.js';
import { initTheme, initSidebar, initLogout, initThemeToggle, initDropdowns, initNotifToggle, formatRelative, formatRoleLabel } from './modules/ui.js';
import { createAreaChart, createDonutChart, createBarChart, createSparkline } from './modules/charts.js';
import { getEmployeeStats } from './services/employeeService.js';
import { getTodaySummary } from './services/attendanceService.js';
import { getTaskStats } from './services/taskService.js';
import { getPayrollStats } from './services/payrollService.js';
import { formatCurrency } from './services/payrollService.js';
import getSupabaseClient from './services/supabaseClient.js';
import toast from './modules/toast.js';

// ── Boot ──────────────────────────────────────────────────────
initTheme();
const ctx = await bootPage();
if (!ctx) throw new Error('Not authenticated');

initSidebar();
initLogout();
initThemeToggle();
initNotifToggle();
initDropdowns();

// ── Load KPIs ─────────────────────────────────────────────────
const IST = 'Asia/Kolkata';
function toIST(ts) {
  if (!ts) return '--:--';
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
    timeZone: IST, hour12: true
  });
}
function msToHHMM(ms) {
  if (!ms || ms < 0) return '00:00';
  const totalMins = Math.floor(ms / 60000);
  const hh = Math.floor(totalMins / 60).toString().padStart(2, '0');
  const mm = (totalMins % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

let cachedAttendStats = null;

// ── Intern specific helpers & percentage calculations ─────────
function hideInternRestrictedElements() {
  const elementsToHide = [
    'card-kpi-headcount',
    'card-kpi-payroll',
    'card-attendance-trend',
    'card-recent-activity',
    'card-dept-headcount',
    'card-quick-actions',
    'btn-new-task-header'
  ];

  elementsToHide.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const kpiGrid = document.getElementById('kpi-grid');
  if (kpiGrid) {
    kpiGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(260px, 1fr))';
  }

  const tasksCard = document.getElementById('card-kpi-tasks');
  if (tasksCard) {
    const label = tasksCard.querySelector('.stat-card-label');
    if (label) label.textContent = 'My Active Tasks';
  }

  const attendanceCard = document.getElementById('card-kpi-attendance');
  if (attendanceCard) {
    const label = attendanceCard.querySelector('.stat-card-label');
    if (label) label.textContent = 'My Attendance';
  }
}

async function calculateInternAttendancePercentage(employeeId) {
  try {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const todayDom = now.getDate();

    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

    const { data: attRows, error: attErr } = await supabase
      .from('attendance')
      .select('date, status')
      .eq('employee_id', employeeId)
      .gte('date', start)
      .lte('date', end);

    if (attErr) throw attErr;

    const { data: leaveRows, error: leaveErr } = await supabase
      .from('leaves')
      .select('start_date, end_date')
      .eq('employee_id', employeeId)
      .eq('status', 'approved')
      .or(`start_date.lte.${end},end_date.gte.${start}`);

    if (leaveErr) throw leaveErr;

    let workDays = 0;
    let attendedDays = 0;

    for (let day = 1; day <= todayDom; day++) {
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();

      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      workDays++;

      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const hasCheckedIn = (attRows || []).some(
        r => r.date === dateStr && ['present', 'late'].includes(r.status)
      );

      if (hasCheckedIn) {
        attendedDays++;
        continue;
      }

      const hasApprovedLeave = (leaveRows || []).some(l => {
        return l.start_date <= dateStr && l.end_date >= dateStr;
      });

      if (hasApprovedLeave) {
        attendedDays++;
      }
    }

    return workDays > 0 ? Math.round((attendedDays / workDays) * 100) : 100;
  } catch (err) {
    console.error('[calculateInternAttendancePercentage]', err);
    return 0;
  }
}

async function loadKPIs() {
  try {
    const now = new Date();
    const isIntern = ctx.profile.role === 'intern';

    if (isIntern) {
      hideInternRestrictedElements();

      const [taskStats, ownAttendPercent] = await Promise.all([
        getTaskStats(ctx.profile.id),
        calculateInternAttendancePercentage(ctx.profile.id),
      ]);

      setText('kpi-tasks', taskStats.in_progress + taskStats.todo + taskStats.in_review);
      setText('kpi-tasks-sub', `${taskStats.overdue} overdue`);

      setText('kpi-attendance', `${ownAttendPercent}%`);
      setText('kpi-attendance-sub', `Monthly average (weekdays)`);

      const pendingLeaves = await getPendingLeavesCount();
      setText('kpi-pending', pendingLeaves);

      const sparklines = ['spark-emp', 'spark-attend', 'spark-tasks', 'spark-payroll'];
      sparklines.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });

    } else {
      const [empStats, attendStats, taskStats, payStats] = await Promise.all([
        getEmployeeStats(),
        getTodaySummary(),
        getTaskStats(),
        getPayrollStats(now.getMonth() + 1, now.getFullYear()),
      ]);

      cachedAttendStats = attendStats;

      setText('kpi-headcount', empStats.total);
      setText('kpi-active-emp', `${empStats.active} active`);

      // Attendance — weekend holiday logic
      const dayOfWeek = now.getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

      if (isWeekend) {
        setText('kpi-attendance', 'Holiday');
        setText('kpi-attendance-sub', 'Weekend (Office Closed)');
      } else {
        const attendRate = empStats.active > 0
          ? Math.round((attendStats.uniqueCheckIns / empStats.active) * 100)
          : 0;
        setText('kpi-attendance', `${attendRate}%`);
        setText('kpi-attendance-sub', `${attendStats.uniqueCheckIns} checked in · ${attendStats.currentlyInCount} active now`);
      }

      setText('kpi-tasks', taskStats.in_progress);
      setText('kpi-tasks-sub', `${taskStats.overdue} overdue`);

      setText('kpi-payroll', formatCurrency(payStats.total_payroll));
      setText('kpi-payroll-sub', `${payStats.count} employees this month`);

      setText('kpi-interns', empStats.interns);

      const pendingLeaves = await getPendingLeavesCount();
      setText('kpi-pending', pendingLeaves);

      const pendingLabelEl = document.getElementById('kpi-pending')?.previousElementSibling;
      if (pendingLabelEl) {
        const isAdmin = ['hr', 'manager', 'super_admin', 'admin'].includes(ctx.profile.role);
        pendingLabelEl.textContent = isAdmin ? 'Pending Approvals' : 'My Pending Leaves';
      }

      renderSparklines();
      loadLiveAttendance(attendStats);
    }
  } catch (err) {
    console.error('[KPIs]', err);
  }
}

function loadLiveAttendance(attendStats) {
  const panel = document.getElementById('live-attendance-panel');
  if (!panel) return;

  const isAdmin = ['hr', 'manager', 'super_admin', 'admin'].includes(ctx.profile.role);
  if (!isAdmin) {
    panel.style.display = 'none';
    return;
  }

  const { uniqueCheckIns, currentlyInCount, onBreakCount, totalNetHours, allRows } = attendStats;

  // Summary bar
  let html = `
    <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:24px;">
      <div style="flex:1; min-width:120px; background:var(--beige-dark); border-radius:14px; padding:16px 20px; text-align:center;">
        <div style="font-size:28px; font-weight:700; color:var(--purple);">${uniqueCheckIns}</div>
        <div style="font-size:12px; color:var(--muted); margin-top:4px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Unique Check-ins</div>
      </div>
      <div style="flex:1; min-width:120px; background:var(--beige-dark); border-radius:14px; padding:16px 20px; text-align:center;">
        <div style="font-size:28px; font-weight:700; color:#31b46b;">${currentlyInCount}</div>
        <div style="font-size:12px; color:var(--muted); margin-top:4px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Currently In</div>
      </div>
      <div style="flex:1; min-width:120px; background:var(--beige-dark); border-radius:14px; padding:16px 20px; text-align:center;">
        <div style="font-size:28px; font-weight:700; color:var(--warning);">${onBreakCount}</div>
        <div style="font-size:12px; color:var(--muted); margin-top:4px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">On Break</div>
      </div>
      <div style="flex:1; min-width:120px; background:var(--beige-dark); border-radius:14px; padding:16px 20px; text-align:center;">
        <div style="font-size:28px; font-weight:700; color:var(--text);">${totalNetHours}h</div>
        <div style="font-size:12px; color:var(--muted); margin-top:4px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Total Net Hours</div>
      </div>
    </div>
  `;

  // Employee-by-employee cards
  if (allRows.length > 0) {
    // Sort: active first, then on-break, then done
    const sorted = [...allRows].sort((a, b) => {
      const aSegs = Array.isArray(a.segments) ? a.segments : [];
      const bSegs = Array.isArray(b.segments) ? b.segments : [];
      const aActive = aSegs.length > 0 && !aSegs[aSegs.length - 1].out ? 0 : (a.clockOut ? 2 : 1);
      const bActive = bSegs.length > 0 && !bSegs[bSegs.length - 1].out ? 0 : (b.clockOut ? 2 : 1);
      return aActive - bActive;
    });

    html += '<div style="display:flex; flex-direction:column; gap:12px;">';

    sorted.forEach(row => {
      const segs = Array.isArray(row.segments) ? row.segments : [];
      const isActive = segs.length > 0 && !segs[segs.length - 1].out;

      // Compute net ms and break ms
      let netMs = 0, breakMs = 0;
      const closedSegs = segs.filter(s => s.in && s.out);
      closedSegs.forEach(s => { netMs += new Date(s.out) - new Date(s.in); });
      for (let i = 1; i < closedSegs.length; i++) {
        const gap = new Date(closedSegs[i].in) - new Date(closedSegs[i - 1].out);
        if (gap > 0) breakMs += gap;
      }
      if (isActive && segs[segs.length - 1]?.in) {
        netMs += Date.now() - new Date(segs[segs.length - 1].in);
      }
      const breakCount = Math.max(0, closedSegs.length - 1) + (isActive && closedSegs.length > 0 ? 1 : 0);
      // If active and there's a gap from last closed to current open, add that break time
      if (isActive && closedSegs.length > 0 && segs[segs.length - 1]?.in) {
        const lastClosed = closedSegs[closedSegs.length - 1];
        const gapMs = new Date(segs[segs.length - 1].in) - new Date(lastClosed.out);
        if (gapMs > 0) breakMs += gapMs;
      }

      // Status badge + pulse
      let statusHtml = '';
      if (isActive) {
        statusHtml = `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:#31b46b;display:inline-block;animation:pulse-dot 1.5s infinite;"></span><span class="badge badge-success" style="font-size:11px;">Active</span></span>`;
      } else if (segs.length > 0 && segs[segs.length - 1].out && !row.clockOut) {
        statusHtml = `<span class="badge badge-warning" style="font-size:11px;">On Break</span>`;
      } else if (row.clockOut) {
        statusHtml = `<span class="badge badge-secondary" style="font-size:11px;">Done for day</span>`;
      } else {
        statusHtml = `<span class="badge badge-secondary" style="font-size:11px;">—</span>`;
      }

      const firstIn = row.clockIn ? toIST(row.clockIn) : '--:--';
      const lastOut = row.clockOut ? toIST(row.clockOut) : (isActive ? '' : '--:--');

      // Card for this employee
      html += `
        <div style="background:var(--beige-dark); border-radius:14px; padding:18px 22px; border:1px solid var(--line);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div class="avatar avatar-sm avatar-purple" style="width:36px;height:36px;font-size:14px;">${escapeHtml(row.name?.[0]?.toUpperCase() || '?')}</div>
              <div>
                <strong style="font-size:15px;">${escapeHtml(row.name)}</strong>
                <div style="font-size:12px; color:var(--muted); margin-top:2px;">First in: ${firstIn}${lastOut ? ' · Last out: ' + lastOut : ''}</div>
              </div>
            </div>
            <div style="text-align:right;">
              ${statusHtml}
              <div style="font-size:12px; color:var(--muted); margin-top:4px;">Net: <strong style="color:var(--purple);">${msToHHMM(netMs)}</strong></div>
            </div>
          </div>`;

      // Segment timeline — show every in/out pair
      if (segs.length > 0) {
        html += `<div style="padding-left:8px; border-left:3px solid var(--purple-light); margin-left:17px;">`;
        segs.forEach((seg, i) => {
          const segIn = seg.in ? toIST(seg.in) : '--:--';
          const segOut = seg.out ? toIST(seg.out) : '<span style="color:var(--purple);font-weight:600;">(active)</span>';
          const segMs = seg.in && seg.out ? new Date(seg.out) - new Date(seg.in) : (seg.in ? Date.now() - new Date(seg.in) : 0);
          const segDur = msToHHMM(segMs);
          const label = i === 0 ? 'Shift start' : `After break #${i}`;

          html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 12px; font-size:13px;">
              <div>
                <span style="color:var(--muted);font-size:11px;font-weight:600;">${label}</span><br>
                <span>🟢 ${segIn}</span> → <span style="color:var(--purple);font-weight:500;">${segOut}</span>
              </div>
              <span style="font-size:12px; color:var(--muted);">${segDur}</span>
            </div>`;

          // Break gap between this and next segment
          if (i < segs.length - 1 && seg.out && segs[i + 1]?.in) {
            const brkMs = new Date(segs[i + 1].in) - new Date(seg.out);
            if (brkMs > 0) {
              html += `
                <div style="display:flex; justify-content:space-between; padding:3px 12px; opacity:0.7; font-size:12px;">
                  <span style="color:var(--warning);">☕ Break #${i + 1}</span>
                  <span style="color:var(--warning); font-weight:600;">${msToHHMM(brkMs)}</span>
                </div>`;
            }
          }
        });

        html += '</div>';

        // Break total summary
        if (breakCount > 0 && breakMs > 0) {
          html += `
            <div style="display:flex; justify-content:space-between; margin-top:10px; padding-top:8px; border-top:1px solid var(--line); font-size:12px;">
              <span style="color:var(--muted);">${breakCount} break${breakCount > 1 ? 's' : ''} total</span>
              <span style="color:var(--warning); font-weight:600;">${msToHHMM(breakMs)}</span>
            </div>`;
        }
      }

      html += '</div>';
    });

    html += '</div>';
  } else {
    html += '<p class="text-muted text-center" style="padding:20px;">No employees have checked in today.</p>';
  }

  // Inject pulse animation
  if (!document.getElementById('pulse-dot-style')) {
    const style = document.createElement('style');
    style.id = 'pulse-dot-style';
    style.textContent = `@keyframes pulse-dot { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(0.7); } }`;
    document.head.appendChild(style);
  }

  panel.innerHTML = html;
}

async function getPendingLeavesCount() {
  const supabase = await getSupabaseClient();
  const isAdmin = ['hr', 'manager', 'super_admin', 'admin'].includes(ctx.profile.role);
  let query = supabase
    .from('leaves')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (!isAdmin) {
    query = query.eq('employee_id', ctx.profile.id);
  }

  const { count } = await query;
  return count || 0;
}

async function renderSparklines() {
  try {
    const supabase = await getSupabaseClient();

    // Build last 7 calendar dates
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    const { data: attRows } = await supabase
      .from('attendance')
      .select('date, status')
      .gte('date', dates[0])
      .lte('date', dates[6]);

    const presentByDay = {};
    dates.forEach(d => { presentByDay[d] = 0; });
    (attRows || []).forEach(r => {
      if (['present', 'half_day'].includes(r.status) && presentByDay[r.date] !== undefined) {
        presentByDay[r.date]++;
      }
    });

    if (document.getElementById('spark-emp'))     createSparkline('spark-emp',     { data: dates.map(d => presentByDay[d] > 0 ? presentByDay[d] : 0), color: '#8e43ac' });
    if (document.getElementById('spark-attend'))  createSparkline('spark-attend',  { data: dates.map(d => presentByDay[d]), color: '#31b46b' });
    if (document.getElementById('spark-tasks'))   createSparkline('spark-tasks',   { data: [0,0,0,0,0,0,0].map(() => Math.floor(Math.random() * 5 + 5)), color: '#3b82f6' });
    if (document.getElementById('spark-payroll')) createSparkline('spark-payroll', { data: [0,0,0,0,0,0,0].map(() => Math.floor(Math.random() * 20000 + 80000)), color: '#f59e0b' });
  } catch (err) {
    console.warn('[sparklines]', err);
  }
}

// ── Load Charts ───────────────────────────────────────────────
async function loadCharts() {
  const supabase = await getSupabaseClient();
  const isIntern = ctx.profile.role === 'intern';

  // ── Attendance trend — last 7 days (real data) ──────────────
  if (!isIntern) {
    try {
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
      });
      const dayLabels = dates.map(d =>
        new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
      );

      const { data: attRows } = await supabase
        .from('attendance')
        .select('date, status')
        .gte('date', dates[0])
        .lte('date', dates[6]);

      const presentByDay = {};
      const leaveByDay   = {};
      dates.forEach(d => { presentByDay[d] = 0; leaveByDay[d] = 0; });

      (attRows || []).forEach(r => {
        if ((r.status === 'present' || r.status === 'half_day') && presentByDay[r.date] !== undefined) presentByDay[r.date]++;
        if (r.status === 'leave'    && leaveByDay[r.date]   !== undefined) leaveByDay[r.date]++;
      });

      if (document.getElementById('chart-attendance')) {
        createAreaChart('chart-attendance', {
          series: [
            { name: 'Present',  data: dates.map(d => presentByDay[d]) },
            { name: 'On Leave', data: dates.map(d => leaveByDay[d]) },
          ],
          categories: dayLabels,
        });
      }
    } catch (err) {
      console.warn('[chart-attendance]', err);
    }
  }

  // ── Task status donut (real data) ───────────────────────────
  try {
    const taskStats = isIntern ? await getTaskStats(ctx.profile.id) : await getTaskStats();
    if (document.getElementById('chart-tasks')) {
      createDonutChart('chart-tasks', {
        series: [taskStats.todo, taskStats.in_progress, taskStats.in_review, taskStats.done],
        labels: ['To Do', 'In Progress', 'In Review', 'Done'],
        colors: ['#94a3b8', '#3b82f6', '#f59e0b', '#31b46b'],
      });
    }
  } catch (err) {
    console.warn('[chart-tasks]', err);
  }

  // ── Role / Dept headcount bar (real data) ───────────────────
  if (!isIntern) {
    try {
      const { data: empRows } = await supabase
        .from('employees')
        .select('role');

      const roleLabelMap = {
        super_admin: 'Super Admin', admin: 'Admin', hr: 'HR',
        manager: 'Manager', accountant: 'Accountant',
        employee: 'Employee', intern: 'Intern',
      };
      const roleOrder = ['super_admin', 'admin', 'hr', 'manager', 'accountant', 'employee', 'intern'];
      const roleCount = {};
      (empRows || []).forEach(e => { roleCount[e.role] = (roleCount[e.role] || 0) + 1; });

      const filteredRoles = roleOrder.filter(r => roleCount[r] > 0);
      const counts = filteredRoles.map(r => roleCount[r]);
      const labels = filteredRoles.map(r => roleLabelMap[r] || r);

      if (document.getElementById('chart-dept') && filteredRoles.length > 0) {
        createBarChart('chart-dept', {
          series: [{ name: 'Headcount', data: counts }],
          categories: labels,
          colors: ['#8e43ac'],
        });
      }
    } catch (err) {
      console.warn('[chart-dept]', err);
    }
  }
}

// ── Recent Activity ───────────────────────────────────────────
async function loadActivity() {
  const list = document.getElementById('activity-list');
  if (!list) return;

  const isIntern = ctx.profile.role === 'intern';
  if (isIntern) return;

  try {
    const supabase = await getSupabaseClient();

    // Recent clock-ins
    const { data: attRows } = await supabase
      .from('attendance')
      .select('clock_in, clock_out, status, date, employees!employee_id(full_name)')
      .not('clock_in', 'is', null)
      .order('clock_in', { ascending: false })
      .limit(5);

    // Recent task activity
    const { data: taskRows } = await supabase
      .from('tasks')
      .select('title, status, updated_at, assignee:employees!tasks_assigned_to_fkey(full_name)')
      .order('updated_at', { ascending: false })
      .limit(4);

    const activities = [
      ...(attRows || []).map(a => ({
        name: a.employees?.full_name || 'Someone',
        action: a.clock_out
          ? `completed shift (${toIST(a.clock_in)} – ${toIST(a.clock_out)})`
          : `clocked in at ${toIST(a.clock_in)}`,
        icon: '🕐',
        time: a.clock_in,
      })),
      ...(taskRows || []).map(t => ({
        name: t.assignee?.full_name || 'Someone',
        action: `updated task "${t.title}" → ${(t.status || '').replace(/_/g, ' ')}`,
        icon: '✅',
        time: t.updated_at,
      })),
    ]
      .filter(a => a.time)
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 8);

    if (!activities.length) {
      list.innerHTML = `<li class="activity-item" style="justify-content:center;"><span class="text-muted text-sm">No recent activity yet.</span></li>`;
      return;
    }

    list.innerHTML = activities.map(item => `
      <li class="activity-item">
        <div class="activity-avatar avatar avatar-sm avatar-purple">
          ${item.name?.[0]?.toUpperCase() || '?'}
        </div>
        <div class="activity-content">
          <span class="activity-name">${item.name}</span>
          <span class="activity-action">${item.action}</span>
        </div>
        <span class="activity-time">${formatRelative(item.time)}</span>
      </li>
    `).join('');
  } catch (err) {
    console.warn('[activity]', err);
    list.innerHTML = `<li class="activity-item" style="justify-content:center;"><span class="text-muted text-sm">Could not load activity.</span></li>`;
  }
}

// ── Pending Approvals ─────────────────────────────────────────
async function loadPendingApprovals() {
  try {
    const supabase = await getSupabaseClient();
    const isAdmin = ['hr', 'manager', 'super_admin', 'admin'].includes(ctx.profile.role);
    
    const titleEl = document.getElementById('leaves-card-title');
    const list = document.getElementById('approvals-list');
    if (!list) return;

    if (isAdmin) {
      if (titleEl) titleEl.textContent = 'Leave Approvals';
      
      const { data } = await supabase
        .from('leaves')
        .select(`
          *,
          employee:employees!employee_id(full_name, avatar_url),
          leave_type:leave_types(name)
        `)
        .or(`employee_id.eq.${ctx.profile.id},status.eq.pending`)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!data?.length) {
        list.innerHTML = `<li class="approval-empty">No pending approvals 🎉</li>`;
        return;
      }

      list.innerHTML = data.map(req => {
        const isOwnRequest = req.employee_id === ctx.profile.id;
        const leaveTypeName = req.leave_type?.name || 'Leave';
        if (isOwnRequest) {
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
          return `
            <li class="approval-item" style="justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div class="approval-avatar avatar avatar-sm avatar-purple">
                  ${req.employee?.full_name?.[0] || '?'}
                </div>
                <div class="approval-info">
                  <strong>You (My Request)</strong>
                  <span>${leaveTypeName} · ${formatDate(req.start_date)} – ${formatDate(req.end_date)}</span>
                </div>
              </div>
              <div>
                <span class="badge ${badgeClass}">${statusText}</span>
              </div>
            </li>
          `;
        } else {
          return `
            <li class="approval-item">
              <div class="approval-avatar avatar avatar-sm avatar-purple">
                ${req.employee?.full_name?.[0] || '?'}
              </div>
              <div class="approval-info">
                <strong>${req.employee?.full_name || 'Unknown'}</strong>
                <span>${leaveTypeName} · ${formatDate(req.start_date)} – ${formatDate(req.end_date)}</span>
              </div>
              <div class="approval-actions">
                <button class="btn btn-sm btn-success" data-approve="${req.id}">Approve</button>
                <button class="btn btn-sm btn-danger"  data-reject="${req.id}">Reject</button>
              </div>
            </li>
          `;
        }
      }).join('');

      // Quick approve/reject
      list.querySelectorAll('[data-approve]').forEach(btn => {
        btn.addEventListener('click', () => quickLeaveAction(btn.dataset.approve, 'approved', btn));
      });
      list.querySelectorAll('[data-reject]').forEach(btn => {
        btn.addEventListener('click', () => quickLeaveAction(btn.dataset.reject, 'rejected', btn));
      });
    } else {
      if (titleEl) titleEl.textContent = 'My Leave Requests';
      
      const { data } = await supabase
        .from('leaves')
        .select(`
          *,
          employee:employees!employee_id(full_name, avatar_url),
          leave_type:leave_types(name)
        `)
        .eq('employee_id', ctx.profile.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!data?.length) {
        list.innerHTML = `<li class="approval-empty">No leave requests found.</li>`;
        return;
      }

      list.innerHTML = data.map(req => {
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

        const leaveTypeName = req.leave_type?.name || 'Leave';

        return `
          <li class="approval-item" style="justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="approval-avatar avatar avatar-sm avatar-purple">
                ${req.employee?.full_name?.[0] || '?'}
              </div>
              <div class="approval-info">
                <strong>${leaveTypeName}</strong>
                <span>${formatDate(req.start_date)} – ${formatDate(req.end_date)}</span>
              </div>
            </div>
            <div>
              <span class="badge ${badgeClass}">${statusText}</span>
            </div>
          </li>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('[PendingApprovals]', err);
  }
}

async function quickLeaveAction(id, status, btn) {
  const { updateLeaveStatus } = await import('./services/attendanceService.js');
  try {
    btn.disabled = true;
    await updateLeaveStatus(id, status, ctx.profile.id);
    toast.success(`Leave ${status}`, 'Status updated successfully');
    await loadPendingApprovals();
    await loadKPIs();
  } catch (err) {
    toast.error('Update failed', err.message);
    btn.disabled = false;
  }
}

// ── Realtime notification badge ───────────────────────────────
let notificationsReady = true;

async function loadNotifications() {
  const body = document.getElementById('notif-panel-body');
  const markReadBtn = document.getElementById('notif-mark-read');
  if (!body) return;

  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, message, read_status, created_at')
      .eq('user_id', ctx.profile.id)
      .order('created_at', { ascending: false })
      .limit(6);

    if (error) throw error;

    notificationsReady = true;
    const unreadCount = data?.filter((item) => !item.read_status).length || 0;
    updateNotifDot(unreadCount);

    if (markReadBtn) markReadBtn.disabled = unreadCount === 0;

    if (!data?.length) {
      body.innerHTML = `<p class="text-muted text-center text-sm p-4">No new notifications</p>`;
      return;
    }

    body.innerHTML = `
      <div class="notif-list">
        ${data.map((item) => `
          <article class="notif-item ${item.read_status ? '' : 'is-unread'}" data-notif-id="${item.id}">
            <span class="notif-dot"></span>
            <div class="notif-text">
              <strong>${escapeHtml(item.title || 'Notification')}</strong>
              <div>${escapeHtml(item.message || 'You have a new update in ERP.')}</div>
            </div>
            <time class="notif-time">${formatRelative(item.created_at)}</time>
          </article>
        `).join('')}
      </div>
    `;
  } catch (err) {
    notificationsReady = false;
    updateNotifDot(0);
    if (markReadBtn) markReadBtn.disabled = true;
    body.innerHTML = `<p class="text-muted text-center text-sm p-4">Notifications will appear here once the table is ready.</p>`;
    console.warn('[notifications]', err);
  }
}

function bindNotificationActions() {
  const markReadBtn = document.getElementById('notif-mark-read');
  if (!markReadBtn) return;

  markReadBtn.addEventListener('click', async () => {
    if (!notificationsReady) return;

    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase
        .from('notifications')
        .update({ read_status: true })
        .eq('user_id', ctx.profile.id)
        .eq('read_status', false);

      if (error) throw error;

      updateNotifDot(0);
      await loadNotifications();
      toast.success('Notifications cleared', 'All notifications are marked as read.');
    } catch (err) {
      toast.error('Notification update failed', err.message);
    }
  });
}

function updateNotifDot(count) {
  const dot = document.getElementById('notif-dot');
  if (dot) dot.style.display = count > 0 ? 'block' : 'none';
}

async function subscribeNotifications() {
  await loadNotifications();
  if (!notificationsReady) return;

  const supabase = await getSupabaseClient();
  supabase
    .channel('notif-' + ctx.profile.id)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${ctx.profile.id}`,
    }, () => { void loadNotifications(); })
    .subscribe();
}

// ── Date helper ───────────────────────────────────────────────
function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '—';
}

// ── Welcome message ───────────────────────────────────────────
function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const welcomeEl = document.getElementById('dashboard-welcome');
if (welcomeEl && ctx.profile) {
  const hour = new Date().getHours();
  let greet = 'Good day';
  let emoji = '👋';

  if (hour >= 5 && hour < 12) {
    greet = 'Good morning';
    emoji = '🌅';
  } else if (hour >= 12 && hour < 17) {
    greet = 'Good afternoon';
    emoji = '☀️';
  } else if (hour >= 17 && hour < 22) {
    greet = 'Good evening';
    emoji = '🌇';
  } else {
    // 10 PM to 5 AM is Good night / working late
    greet = hour >= 22 || hour < 4 ? 'Good night' : 'Good early morning';
    emoji = '🌙';
  }

  welcomeEl.textContent = `${greet}, ${ctx.profile.full_name?.split(' ')[0] || 'there'} ${emoji}`;
}

// ── Today's date display ──────────────────────────────────────
const roleEl = document.getElementById('dashboard-role');
if (roleEl && ctx.profile) {
  roleEl.textContent = formatRoleLabel(ctx.profile.role);
}

const dateEl = document.getElementById('today-date');
if (dateEl) {
  dateEl.textContent = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

async function subscribeLeaveRequests() {
  try {
    const supabase = await getSupabaseClient();
    supabase
      .channel('leave-requests-channel')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'leaves'
      }, async () => {
        await loadPendingApprovals();
        await loadKPIs();
      })
      .subscribe();
  } catch (err) {
    console.warn('[subscribeLeaveRequests]', err);
  }
}

async function subscribeAttendanceLive() {
  try {
    const supabase = await getSupabaseClient();
    supabase
      .channel('dashboard-attendance-live')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'attendance'
      }, async () => {
        // Re-fetch and re-render KPIs + live panel + activity
        await loadKPIs();
        await loadActivity();
      })
      .subscribe();
  } catch (err) {
    console.warn('[subscribeAttendanceLive]', err);
  }
}

// ── Init all ──────────────────────────────────────────────────
bindNotificationActions();

await Promise.all([
  loadKPIs(),
  loadCharts(),
  loadActivity(),
  loadPendingApprovals(),
  subscribeNotifications(),
  subscribeLeaveRequests(),
  subscribeAttendanceLive(),
]);

// Recalculate and update active clock durations every 30 seconds
setInterval(() => {
  if (cachedAttendStats) {
    loadLiveAttendance(cachedAttendStats);
  }
}, 30000);

