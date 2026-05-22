// ============================================================
// THE ANT BOX ERP - employees.js
// Employee directory: list, CRUD, search, filters, pagination
// ============================================================

import { bootPage } from './modules/authGuard.js';
import {
  initTheme,
  initSidebar,
  initLogout,
  initThemeToggle,
  initDropdowns,
  statusBadge,
  avatarHTML,
  formatDate,
  debounce,
  renderSkeletonRows,
  renderEmptyState,
  setLoading,
} from './modules/ui.js';
import { openModal, closeModal, populateForm, readForm, confirm, setupModalClosers } from './modules/modal.js';
import toast from './modules/toast.js';
import { validateForm, rules } from './modules/validators.js';
import {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getDepartments,
  createDepartment,
} from './services/employeeService.js';

initTheme();
const ctx = await bootPage({ requiredRoles: ['super_admin', 'admin', 'hr', 'accountant', 'manager', 'employee'] });
if (!ctx) throw new Error('Not authenticated');
initSidebar();
initLogout();
initThemeToggle();
initDropdowns();
setupModalClosers();

let state = {
  page: 1,
  pageSize: 20,
  search: '',
  department: '',
  status: '',
  editingId: null,
  departments: [],
};

const empForm = document.getElementById('emp-form');
const deptFilter = document.getElementById('dept-filter');
const deptSelect = document.getElementById('department_id');
const deptNameInput = document.getElementById('department_name');
const deptToggleBtn = document.getElementById('btn-toggle-dept');
const csvInput = document.getElementById('csv-import-input');

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Administrator',
  hr: 'HR Manager',
  accountant: 'Accountant',
  manager: 'Manager',
  employee: 'Employee',
  intern: 'Intern',
};

const CSV_HEADER_MAP = {
  full_name: 'full_name',
  fullname: 'full_name',
  employee_name: 'full_name',
  name: 'full_name',
  email: 'email',
  email_address: 'email',
  phone: 'phone',
  mobile: 'phone',
  role: 'role',
  department: 'department_name',
  department_name: 'department_name',
  designation: 'designation',
  title: 'designation',
  salary: 'salary',
  base_salary: 'salary',
  joining_date: 'joining_date',
  date_of_joining: 'joining_date',
  joining: 'joining_date',
  status: 'status',
};

function sortDepartments(list = []) {
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function cleanText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeRole(value) {
  const normalized = cleanText(value).toLowerCase();
  if (normalized.includes('super admin') || normalized.includes('super_admin')) return 'super_admin';
  if (normalized.includes('admin')) return 'admin';
  if (normalized.includes('hr')) return 'hr';
  if (normalized.includes('accountant') || normalized.includes('finance')) return 'accountant';
  if (normalized.includes('manager') || normalized.includes('director') || normalized.includes('lead')) return 'manager';
  if (normalized.includes('intern')) return 'intern';
  return 'employee';
}

function normalizeStatus(value) {
  const normalized = cleanText(value).toLowerCase().replace(/\s+/g, '_');
  return ['pending', 'active', 'inactive', 'probation'].includes(normalized)
    ? normalized
    : 'active';
}

function normalizeSalary(value) {
  const normalized = cleanText(value).replace(/[^0-9.-]/g, '');
  return normalized ? normalized : '';
}

function normalizeDateValue(value) {
  const normalized = cleanText(value);
  if (!normalized) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;

  const parts = normalized.split(/[\/-]/).map(part => part.trim());
  if (parts.length !== 3) return normalized;

  if (parts[0].length === 4) {
    const [year, month, day] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const [day, month, year] = parts;
  if (year.length === 4) {
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return normalized;
}

function setDepartmentInputVisible(visible) {
  if (!deptNameInput || !deptToggleBtn) return;
  deptNameInput.classList.toggle('hidden', !visible);
  deptToggleBtn.textContent = visible ? 'Use Existing' : 'New';
  if (!visible) deptNameInput.value = '';
}

function populateDepartmentOptions({ filterValue = state.department, formValue = '' } = {}) {
  if (deptFilter) {
    deptFilter.innerHTML = `<option value="">All Departments</option>${
      state.departments.map(dept => `<option value="${dept.id}">${dept.name}</option>`).join('')
    }`;
    deptFilter.value = filterValue || '';
  }

  if (deptSelect) {
    deptSelect.innerHTML = `<option value="">Select Department</option>${
      state.departments.map(dept => `<option value="${dept.id}">${dept.name}</option>`).join('')
    }`;
    deptSelect.value = formValue || '';
  }
}

async function loadDepartments(options = {}) {
  try {
    state.departments = sortDepartments(await getDepartments());
    populateDepartmentOptions(options);
  } catch (err) {
    toast.error('Department load failed', err.message);
  }
}

async function resolveDepartmentId({ department_id = '', department_name = '' } = {}) {
  const selectedDepartmentId = cleanText(department_id);
  if (selectedDepartmentId) return selectedDepartmentId;

  const newDepartmentName = cleanText(department_name);
  if (!newDepartmentName) return null;

  const existingDepartment = state.departments.find(
    dept => cleanText(dept.name).toLowerCase() === newDepartmentName.toLowerCase()
  );
  if (existingDepartment) return existingDepartment.id;

  const createdDepartment = await createDepartment(newDepartmentName);
  state.departments = sortDepartments([...state.departments, createdDepartment]);
  populateDepartmentOptions({ filterValue: state.department, formValue: createdDepartment.id });
  return createdDepartment.id;
}

async function prepareEmployeePayload(rawData) {
  const payload = {
    ...rawData,
    full_name: cleanText(rawData.full_name),
    email: cleanText(rawData.email),
    phone: cleanText(rawData.phone),
    role: normalizeRole(rawData.role),
    designation: cleanText(rawData.designation),
    salary: normalizeSalary(rawData.salary),
    joining_date: normalizeDateValue(rawData.joining_date),
    status: normalizeStatus(rawData.status),
  };

  payload.department_id = await resolveDepartmentId(rawData);
  delete payload.department_name;

  return payload;
}

async function loadEmployees() {
  const tbody = document.getElementById('employees-tbody');
  const paginationEl = document.getElementById('pagination');
  if (!tbody) return;

  renderSkeletonRows(tbody, 6, 8);

  try {
    let roleIn = null;
    if (ctx.profile.role === 'employee') {
      roleIn = ['intern', 'employee'];
    }

    let { data, count, pages } = await getEmployees({
      page: state.page,
      pageSize: state.pageSize,
      search: state.search,
      department: state.department,
      status: state.status,
      roleIn,
    });

    if (ctx.profile.role === 'employee') {
      data = data.filter(emp => emp.role === 'intern' || emp.id === ctx.profile.id);
    }

    document.getElementById('emp-count').textContent = `${count} employees`;

    if (!data.length) {
      tbody.innerHTML = '';
      renderEmptyState(tbody.closest('.table-container'), {
        title: 'No employees found',
        message: state.search ? `No results for "${state.search}"` : 'Add your first employee to get started.',
        action: `<button class="btn btn-purple" onclick="document.getElementById('btn-add-emp').click()">Add Employee</button>`,
      });
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }

    tbody.innerHTML = data.map(emp => `
      <tr data-id="${emp.id}">
        <td>
          <div class="table-name-cell">
            ${avatarHTML(emp, 'sm')}
            <div>
              <div class="name">${emp.full_name || '-'}</div>
              <div class="sub">${emp.email || ''}</div>
            </div>
          </div>
        </td>
        <td>${emp.department?.name || '-'}</td>
        <td>${emp.designation || '-'}</td>
        <td>${emp.role ? `<span class="badge badge-purple">${formatRole(emp.role)}</span>` : '-'}</td>
        <td>${formatDate(emp.joining_date)}</td>
        <td>${statusBadge(emp.status || 'active')}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-sm btn-ghost btn-icon-sm" data-action="view" data-id="${emp.id}" title="View">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            ${['super_admin', 'admin', 'hr'].includes(ctx.profile.role) ? `
            <button class="btn btn-sm btn-ghost btn-icon-sm" data-action="edit" data-id="${emp.id}" title="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn btn-sm btn-ghost btn-icon-sm" data-action="delete" data-id="${emp.id}" title="Archive">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const { action, id } = btn.dataset;
        if (action === 'edit') openEditModal(id);
        if (action === 'delete') archiveEmployee(id);
        if (action === 'view') window.location.href = `/erp/pages/profile.html?id=${id}`;
      });
    });

    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', e => {
        if (!e.target.closest('[data-action]')) {
          window.location.href = `/erp/pages/profile.html?id=${row.dataset.id}`;
        }
      });
    });

    // ── Intern restriction: only show own row ──────────────────
    if (ctx.profile.role === 'intern') {
      // Hide all filters and actions for interns
      document.querySelector('.table-filters')?.style?.setProperty('display', 'none');
      document.querySelector('[data-min-role="hr"]')?.style?.setProperty('display', 'none');
      document.getElementById('btn-add-emp')?.style?.setProperty('display', 'none');
      document.getElementById('btn-import-csv')?.style?.setProperty('display', 'none');
      document.querySelector('.page-header-actions')?.style?.setProperty('display', 'none');
      document.getElementById('pagination')?.style?.setProperty('display', 'none');
      document.getElementById('emp-count')?.style?.setProperty('display', 'none');
      // Hide all rows except the logged-in user's own row
      tbody.querySelectorAll('tr[data-id]').forEach(row => {
        if (row.dataset.id !== ctx.profile.id) {
          row.style.display = 'none';
        } else {
          // Remove edit/delete actions for own row (read-only view)
          row.querySelectorAll('[data-action="edit"], [data-action="delete"]').forEach(btn => btn.style.display = 'none');
        }
      });
    }

    renderPagination(count, pages, paginationEl);
  } catch (err) {
    console.error('[employees]', err);
    toast.error('Failed to load employees', err.message);
  }
}

function renderPagination(count, pages, el) {
  if (!el) return;
  const from = (state.page - 1) * state.pageSize + 1;
  const to = Math.min(state.page * state.pageSize, count);

  el.innerHTML = `
    <div class="pagination-info">Showing <strong>${from}-${to}</strong> of <strong>${count}</strong></div>
    <div class="pagination-controls">
      <button class="page-btn" id="pg-prev" ${state.page <= 1 ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      ${Array.from({ length: Math.min(pages, 7) }, (_, i) => {
        const page = i + 1;
        return `<button class="page-btn ${page === state.page ? 'active' : ''}" data-page="${page}">${page}</button>`;
      }).join('')}
      <button class="page-btn" id="pg-next" ${state.page >= pages ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  `;

  el.querySelector('#pg-prev')?.addEventListener('click', () => {
    state.page -= 1;
    loadEmployees();
  });

  el.querySelector('#pg-next')?.addEventListener('click', () => {
    state.page += 1;
    loadEmployees();
  });

  el.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.page = Number(btn.dataset.page);
      loadEmployees();
    });
  });
}

async function openEditModal(id = null) {
  state.editingId = id;
  const title = document.getElementById('emp-modal-title');

  if (id) {
    if (title) title.textContent = 'Edit Employee';
    try {
      const emp = await getEmployee(id);
      populateForm('emp-form', {
        full_name: emp.full_name,
        email: emp.email,
        phone: emp.phone,
        designation: emp.designation,
        department_id: emp.department?.id || '',
        department_name: '',
        role: emp.role,
        salary: emp.salary ?? '',
        joining_date: emp.joining_date?.split('T')[0] || '',
        status: emp.status,
      });
      setDepartmentInputVisible(false);
    } catch (err) {
      toast.error('Failed to load employee', err.message);
      return;
    }
  } else {
    if (title) title.textContent = 'Add Employee';
    empForm?.reset();
    if (deptSelect) deptSelect.value = '';
    setDepartmentInputVisible(false);
  }

  openModal('emp-modal');
}

async function archiveEmployee(id) {
  const confirmed = await confirm({
    title: 'Archive Employee?',
    message: 'This will mark the employee as inactive. They will no longer appear in active lists.',
    confirmText: 'Archive',
    type: 'danger',
  });
  if (!confirmed) return;

  try {
    await deleteEmployee(id);
    toast.success('Employee archived', 'Employee has been set to inactive.');
    await loadEmployees();
  } catch (err) {
    toast.error('Archive failed', err.message);
  }
}

function parseCsv(text) {
  const rows = [];
  let currentCell = '';
  let currentRow = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      currentRow.push(currentCell);
      if (currentRow.some(cell => cleanText(cell) !== '')) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some(cell => cleanText(cell) !== '')) rows.push(currentRow);

  return rows;
}

function normalizeCsvHeader(header) {
  return cleanText(header).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function mapCsvRows(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV must include a header row and at least one data row.');

  const headers = rows[0].map(header => CSV_HEADER_MAP[normalizeCsvHeader(header)] || null);
  if (!headers.some(Boolean)) {
    throw new Error('CSV headers are not recognized. Use columns like full_name, email, department, role, salary.');
  }

  return rows.slice(1).map((row, index) => {
    const mapped = { __row: index + 2 };
    headers.forEach((key, colIndex) => {
      if (!key) return;
      mapped[key] = cleanText(row[colIndex] || '');
    });

    mapped.role = normalizeRole(mapped.role);
    mapped.status = normalizeStatus(mapped.status);
    mapped.salary = normalizeSalary(mapped.salary);
    mapped.joining_date = normalizeDateValue(mapped.joining_date);

    return mapped;
  }).filter(row => Object.keys(row).some(key => key !== '__row' && cleanText(row[key]) !== ''));
}

async function importEmployeesFromCsv(file) {
  const text = await file.text();
  const rows = mapCsvRows(text);
  if (!rows.length) throw new Error('No employee rows were found in the CSV file.');

  const approved = await confirm({
    title: 'Import employees from CSV?',
    message: `${rows.length} row(s) will be processed. Existing departments will be reused and new ones will be created automatically.`,
    confirmText: 'Import',
    cancelText: 'Cancel',
    type: 'warning',
  });
  if (!approved) return;

  let successCount = 0;
  const failures = [];

  for (const row of rows) {
    if (!row.full_name || !row.email) {
      failures.push(`Row ${row.__row}: full_name and email are required.`);
      continue;
    }

    try {
      const payload = await prepareEmployeePayload(row);
      await createEmployee(payload);
      successCount += 1;
    } catch (err) {
      failures.push(`Row ${row.__row}: ${err.message}`);
    }
  }

  await loadDepartments({ filterValue: state.department, formValue: deptSelect?.value || '' });
  await loadEmployees();

  if (successCount > 0) {
    toast.success('CSV import finished', `${successCount} employee(s) imported.`);
  }

  if (failures.length > 0) {
    toast.warning(
      'Some rows could not be imported',
      failures.slice(0, 2).join(' ') + (failures.length > 2 ? ` +${failures.length - 2} more.` : '')
    );
  }

}

function formatRole(role) {
  return ROLE_LABELS[role] || role;
}

document.getElementById('btn-add-emp')?.addEventListener('click', () => openEditModal());

deptToggleBtn?.addEventListener('click', () => {
  const shouldShow = deptNameInput?.classList.contains('hidden');
  setDepartmentInputVisible(shouldShow);
  if (shouldShow) {
    deptSelect.value = '';
    deptNameInput?.focus();
  }
});

deptSelect?.addEventListener('change', () => {
  if (deptSelect.value) setDepartmentInputVisible(false);
});

deptNameInput?.addEventListener('input', () => {
  if (cleanText(deptNameInput.value)) deptSelect.value = '';
});

document.getElementById('btn-import-csv')?.addEventListener('click', () => {
  csvInput?.click();
});

csvInput?.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    await importEmployeesFromCsv(file);
  } catch (err) {
    toast.error('CSV import failed', err.message);
  }
});

empForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const valid = validateForm('emp-form', {
    full_name: [rules.required()],
    email: [rules.required(), rules.email()],
    role: [rules.required()],
  });
  if (!valid) return;

  const btn = event.target.querySelector('[type="submit"]');
  setLoading(btn, true);

  try {
    const rawData = readForm('emp-form');
    const payload = await prepareEmployeePayload(rawData);

    if (state.editingId) {
      await updateEmployee(state.editingId, payload);
      toast.success('Employee updated', `${payload.full_name} has been updated.`);
    } else {
      await createEmployee(payload);
      toast.success('Employee added', `${payload.full_name} has been added.`);
    }

    closeModal('emp-modal');
    await loadEmployees();
  } catch (err) {
    toast.error('Save failed', err.message);
  } finally {
    setLoading(btn, false);
  }
});

const searchInput = document.getElementById('emp-search');
if (searchInput) {
  searchInput.addEventListener('input', debounce(event => {
    state.search = event.target.value.trim();
    state.page = 1;
    loadEmployees();
  }, 350));
}

deptFilter?.addEventListener('change', event => {
  state.department = event.target.value;
  state.page = 1;
  loadEmployees();
});

document.getElementById('status-filter')?.addEventListener('change', event => {
  state.status = event.target.value;
  state.page = 1;
  loadEmployees();
});

await loadDepartments();
await loadEmployees();
