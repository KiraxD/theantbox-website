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
  setupExportButtons();
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

    let present = 0, absent = 0, leave = 0;
    attendance.forEach(a => {
      if (a.status === 'present' || a.status === 'half_day') present++;
      else if (a.status === 'absent') absent++;
      else if (a.status === 'leave') leave++;
    });

    const attOptions = {
      series: [present, absent, leave],
      chart: { type: 'donut', height: 300, background: 'transparent' },
      labels: ['Present', 'Absent', 'Leave'],
      colors: ['#10B981', '#EF4444', '#3B82F6'],
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

// ── Export Report Logic ──────────────────────────────────────
async function getDetailedTasksData() {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      description,
      status,
      priority,
      deadline,
      created_at,
      assignee:employees!assigned_to(full_name)
    `)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  
  return (data || []).map(t => ({
    'Task ID': t.id,
    'Title': t.title || '',
    'Description': t.description || '',
    'Status': t.status || '',
    'Priority': t.priority || '',
    'Deadline': t.deadline ? t.deadline.split('T')[0] : '',
    'Assigned To': t.assignee ? t.assignee.full_name : 'Unassigned',
    'Created At': t.created_at ? t.created_at.split('T')[0] : ''
  }));
}

async function getDetailedAttendanceData() {
  const { data, error } = await supabase
    .from('attendance')
    .select(`
      id,
      date,
      status,
      clock_in,
      clock_out,
      note,
      created_at,
      employee:employees!employee_id(full_name)
    `)
    .order('date', { ascending: false });

  if (error) throw error;

  return (data || []).map(r => ({
    'Attendance ID': r.id,
    'Date': r.date || '',
    'Employee Name': r.employee ? r.employee.full_name : 'Unknown',
    'Status': r.status || '',
    'Check In': r.clock_in ? new Date(r.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    'Check Out': r.clock_out ? new Date(r.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    'Note': r.note || '',
    'Created At': r.created_at ? r.created_at.split('T')[0] : ''
  }));
}

async function getDetailedPayrollData() {
  const { data, error } = await supabase
    .from('payroll')
    .select(`
      id,
      month,
      base_salary,
      bonuses,
      deductions,
      net_salary,
      status,
      paid_on,
      created_at,
      employee:employees!employee_id(full_name)
    `)
    .order('month', { ascending: false });

  if (error) throw error;

  return (data || []).map(p => ({
    'Payroll ID': p.id,
    'Month': p.month || '',
    'Employee Name': p.employee ? p.employee.full_name : 'Unknown',
    'Base Salary (₹)': Number(p.base_salary || 0),
    'Bonuses (₹)': Number(p.bonuses || 0),
    'Deductions (₹)': Number(p.deductions || 0),
    'Net Salary (₹)': Number(p.net_salary || 0),
    'Status': p.status || '',
    'Paid Date': p.paid_on ? p.paid_on.split('T')[0] : '',
    'Created At': p.created_at ? p.created_at.split('T')[0] : ''
  }));
}

function downloadExcel(sheets, filename) {
  const wb = XLSX.utils.book_new();
  
  Object.keys(sheets).forEach(sheetName => {
    const data = sheets[sheetName];
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Auto-fit column widths
    if (data.length > 0) {
      const keys = Object.keys(data[0]);
      const colWidths = keys.map(key => {
        let maxLen = key.toString().length;
        data.forEach(row => {
          const val = row[key];
          if (val !== undefined && val !== null) {
            maxLen = Math.max(maxLen, val.toString().length);
          }
        });
        return { wch: maxLen + 3 };
      });
      ws['!cols'] = colWidths;
    }
    
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });
  
  XLSX.writeFile(wb, filename);
}

async function handleExport(btnId, fetchFn, fileName, sheetName) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; margin-right:6px; vertical-align: middle;"></span> Exporting...`;
  
  try {
    const data = await fetchFn();
    if (data.length === 0) {
      showToast('No records found to export', 'info');
      return;
    }
    
    downloadExcel({ [sheetName]: data }, fileName);
    showToast(`${sheetName} report downloaded successfully`, 'success');
  } catch (err) {
    showToast('Failed to export report', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function handleExportAll() {
  const btn = document.getElementById('btn-export-all');
  if (!btn) return;
  
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; margin-right:6px; vertical-align: middle;"></span> Exporting All...`;
  
  try {
    const [tasks, attendance, payroll] = await Promise.all([
      getDetailedTasksData(),
      getDetailedAttendanceData(),
      getDetailedPayrollData()
    ]);
    
    downloadExcel({
      'Tasks': tasks,
      'Attendance': attendance,
      'Payroll': payroll
    }, 'detailed_system_report.xlsx');
    
    showToast('Consolidated system report downloaded successfully', 'success');
  } catch (err) {
    showToast('Failed to export reports', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

function setupExportButtons() {
  // Inject keyframes for loading spinner dynamically if not present
  if (!document.getElementById('reports-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'reports-spinner-style';
    style.innerHTML = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  document.getElementById('btn-export-tasks')?.addEventListener('click', () => {
    handleExport('btn-export-tasks', getDetailedTasksData, 'tasks_report.xlsx', 'Tasks');
  });
  
  document.getElementById('btn-export-attendance')?.addEventListener('click', () => {
    handleExport('btn-export-attendance', getDetailedAttendanceData, 'attendance_report.xlsx', 'Attendance');
  });
  
  document.getElementById('btn-export-payroll')?.addEventListener('click', () => {
    handleExport('btn-export-payroll', getDetailedPayrollData, 'payroll_report.xlsx', 'Payroll');
  });
  
  document.getElementById('btn-export-all')?.addEventListener('click', () => {
    handleExportAll();
  });
}

init();
