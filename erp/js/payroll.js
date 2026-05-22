import { bootPage } from './modules/authGuard.js';
import getSupabaseClient from './services/supabaseClient.js';
let supabase;
import * as payrollService from './services/payrollService.js';
import { openModal, closeModal, setupModalClosers } from './modules/modal.js';
import { showToast } from './modules/toast.js';
import { initTheme, initSidebar, initLogout, initThemeToggle, initDropdowns } from './modules/ui.js';

let currentUser = null;
let currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
let allRecords = [];

async function init() {
  initTheme();
  const ctx = await bootPage({ requiredRoles: ['super_admin', 'admin', 'hr', 'accountant', 'manager'] });
  if (!ctx) return;
  currentUser = ctx.profile;
  supabase = await getSupabaseClient();

  initSidebar(); initLogout(); initThemeToggle(); initDropdowns();
  setupModalClosers();
  setupUI();
  
  await loadEmployees();
  await loadPayroll();
}

function setupUI() {
  const monthInput = document.getElementById('month-filter');
  monthInput.value = currentMonth;

  monthInput.addEventListener('change', (e) => {
    currentMonth = e.target.value;
    loadPayroll();
  });

  document.getElementById('payroll-form').addEventListener('submit', handleSavePayroll);
  document.getElementById('btn-run-payroll').addEventListener('click', handleRunPayroll);
}

async function loadEmployees() {
  const { data } = await supabase.from('employees').select('id, full_name, salary').eq('status', 'active').order('full_name');
  const select = document.getElementById('employee_id');
  if (select && data) {
    select.innerHTML = '<option value="">Select Employee</option>' + data.map(e => `<option value="${e.id}" data-salary="${e.salary || 0}">${e.full_name}</option>`).join('');
  }
}

async function loadPayroll() {
  const tbody = document.getElementById('payroll-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><div class="skeleton" style="height:20px;width:100px;margin:auto;"></div></td></tr>';

  try {
    const { data, count } = await payrollService.getPayrollRecords({ month: currentMonth });
    allRecords = data || [];
    renderRecords();
  } catch(err) {
    console.error('[loadPayroll]', err);
    showToast('error', 'Failed to load payroll');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading data</td></tr>';
  }
}

function renderRecords() {
  const tbody = document.getElementById('payroll-tbody');
  tbody.innerHTML = '';

  if (allRecords.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No payroll records found for this month</td></tr>`;
    return;
  }

  let totalNet = 0;

  allRecords.forEach(record => {
    const tr = document.createElement('tr');
    const net = parseFloat(record.net_salary || 0);
    totalNet += net;

    let statusBadge = '';
    if (record.status === 'draft') statusBadge = '<span class="badge badge-secondary">Draft</span>';
    else if (record.status === 'approved') statusBadge = '<span class="badge badge-info">Approved</span>';
    else if (record.status === 'paid') statusBadge = '<span class="badge badge-success">Paid</span>';

    tr.innerHTML = `
      <td>${record.employee?.full_name || record.employees?.full_name || 'Unknown'}</td>
      <td>₹${(record.base_salary || 0).toLocaleString()}</td>
      <td class="text-success">+₹${(record.bonuses || 0).toLocaleString()}</td>
      <td class="text-danger">-₹${(record.deductions || 0).toLocaleString()}</td>
      <td class="font-weight-600">₹${net.toLocaleString()}</td>
      <td>${statusBadge}</td>
      <td>
        <button class="btn btn-ghost btn-sm btn-edit" data-id="${record.id}">Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('total-payroll').textContent = '₹' + totalNet.toLocaleString();

  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      const record = allRecords.find(r => r.id === id);
      if (record) openEditModal(record);
    });
  });
}

function openEditModal(record) {
  document.getElementById('payroll_id').value = record.id;
  document.getElementById('employee_id').value = record.employee_id;
  document.getElementById('month').value = record.month;
  document.getElementById('base_salary').value = record.base_salary;
  document.getElementById('bonuses').value = record.bonuses || 0;
  document.getElementById('deductions').value = record.deductions || 0;
  document.getElementById('status').value = record.status;
  
  openModal('payroll-modal');
}

async function handleSavePayroll(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  
  const id = formData.get('payroll_id');
  const base = parseFloat(formData.get('base_salary') || 0);
  const bonuses = parseFloat(formData.get('bonuses') || 0);
  const deductions = parseFloat(formData.get('deductions') || 0);
  const net = base + bonuses - deductions;

  const payload = {
    employee_id: formData.get('employee_id'),
    month: formData.get('month'),
    base_salary: base,
    bonuses: bonuses,
    deductions: deductions,
    net_salary: net,
    status: formData.get('status')
  };

  try {
    let error;
    if (id) {
      const { error: err } = await supabase.from('payroll').update(payload).eq('id', id);
      error = err;
    } else {
      const { error: err } = await supabase.from('payroll').insert(payload);
      error = err;
    }

    if (error) throw error;
    showToast('success', 'Payroll record saved');
    closeModal('payroll-modal');
    e.target.reset();
    loadPayroll();
  } catch(err) {
    showToast('error', err.message);
  }
}

async function handleRunPayroll() {
  if (!confirm(`Generate draft payroll for all active employees for ${currentMonth}?`)) return;
  
  try {
    document.getElementById('btn-run-payroll').disabled = true;
    const [yr, mo] = currentMonth.split('-');
    await payrollService.bulkGeneratePayroll(parseInt(mo), parseInt(yr));
    showToast('success', 'Payroll generated successfully');
    loadPayroll();
  } catch (err) {
    showToast('error', err.message);
  } finally {
    document.getElementById('btn-run-payroll').disabled = false;
  }
}

init();

// Auto-fill salary when employee selected
document.getElementById('employee_id')?.addEventListener('change', (e) => {
  const opt = e.target.options[e.target.selectedIndex];
  if (opt && opt.dataset.salary) {
    document.getElementById('base_salary').value = opt.dataset.salary;
  }
});
