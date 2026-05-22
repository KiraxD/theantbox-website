import { bootPage } from './modules/authGuard.js';
import getSupabaseClient from './services/supabaseClient.js';
let supabase;
import { showToast } from './modules/toast.js';
import { initTheme, initSidebar, initLogout, initThemeToggle, initDropdowns } from './modules/ui.js';

let currentUser = null;

async function init() {
  initTheme();
  const ctx = await bootPage({ requiredRoles: ['super_admin', 'admin', 'hr', 'accountant', 'manager'] });
  if (!ctx) return;
  currentUser = ctx.profile;
  supabase = await getSupabaseClient();

  initSidebar(); initLogout(); initThemeToggle(); initDropdowns();
  await loadReportData();
}

async function loadReportData() {
  try {
    // 1. Task Completion Stats
    const { data: tasks, error: tErr } = await supabase.from('tasks').select('status');
    if (tErr) throw tErr;

    let todo = 0, in_progress = 0, in_review = 0, done = 0;
    tasks.forEach(t => {
      if (t.status === 'todo') todo++;
      else if (t.status === 'in_progress') in_progress++;
      else if (t.status === 'in_review') in_review++;
      else if (t.status === 'done') done++;
    });

    const taskOptions = {
      series: [todo, in_progress, in_review, done],
      chart: { type: 'pie', height: 300, background: 'transparent' },
      labels: ['To Do', 'In Progress', 'In Review', 'Done'],
      colors: ['#AFAFAF', '#000000', '#BFA6FF', '#7C3AED'],
      theme: { mode: localStorage.getItem('erp_theme') === 'dark' ? 'dark' : 'light' }
    };
    new ApexCharts(document.querySelector("#chart-tasks"), taskOptions).render();

    // 2. Attendance Stats (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

    const { data: attendance, error: aErr } = await supabase
      .from('attendance')
      .select('status')
      .gte('date', dateStr);
    
    if (aErr) throw aErr;

    let present = 0, absent = 0, leave = 0, half_day = 0;
    attendance.forEach(a => {
      if (a.status === 'present') present++;
      else if (a.status === 'absent') absent++;
      else if (a.status === 'leave') leave++;
      else if (a.status === 'half_day') half_day++;
    });

    const attOptions = {
      series: [present, absent, leave, half_day],
      chart: { type: 'donut', height: 300, background: 'transparent' },
      labels: ['Present', 'Absent', 'Leave', 'Half Day'],
      colors: ['#10B981', '#EF4444', '#3B82F6', '#F59E0B'],
      theme: { mode: localStorage.getItem('erp_theme') === 'dark' ? 'dark' : 'light' }
    };
    new ApexCharts(document.querySelector("#chart-attendance"), attOptions).render();

    // 3. Payroll (last 6 months trend)
    // Grouping by month
    const { data: payroll, error: pErr } = await supabase
      .from('payroll')
      .select('month, net_salary');
    if (pErr) throw pErr;

    const monthlyTotals = {};
    payroll.forEach(p => {
      if (!monthlyTotals[p.month]) monthlyTotals[p.month] = 0;
      monthlyTotals[p.month] += Number(p.net_salary || 0);
    });

    // Sort months chronologically
    const sortedMonths = Object.keys(monthlyTotals).sort();
    const totals = sortedMonths.map(m => monthlyTotals[m]);

    const payOptions = {
      series: [{ name: 'Payroll Expense', data: totals }],
      chart: { type: 'area', height: 300, toolbar: { show: false }, background: 'transparent' },
      xaxis: { categories: sortedMonths },
      colors: ['#7C3AED'],
      stroke: { curve: 'smooth', width: 2 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.0, stops: [0, 100] } },
      dataLabels: { enabled: false },
      theme: { mode: localStorage.getItem('erp_theme') === 'dark' ? 'dark' : 'light' }
    };
    new ApexCharts(document.querySelector("#chart-payroll"), payOptions).render();

  } catch(err) {
    showToast('Failed to load reports', 'error');
    console.error(err);
  }
}

init();
