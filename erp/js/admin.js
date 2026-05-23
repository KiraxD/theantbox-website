// ============================================================
// THE ANT BOX ERP — admin.js
// Admin Panel: user management, settings, and audit logs
// ============================================================

import { bootPage } from './modules/authGuard.js';
import {
  initTheme,
  initSidebar,
  initLogout,
  initThemeToggle,
  initDropdowns,
  avatarHTML,
  statusBadge,
  formatDateTime,
  debounce,
  renderSkeletonRows,
  renderEmptyState,
  setLoading
} from './modules/ui.js';
import { openModal, closeModal, setupModalClosers } from './modules/modal.js';
import toast from './modules/toast.js';
import { getEmployees, getEmployee, updateEmployee, getDepartments } from './services/employeeService.js';
import { getActivityLogs, createActivityLog, subscribeActivityLogs } from './services/activityLogService.js';
import { getSystemSettings, updateSystemSettings } from './services/systemSettingsService.js';

let userState = {
  page: 1,
  pageSize: 10,
  search: '',
  role: '',
  status: ''
};

let auditState = {
  page: 1,
  pageSize: 15,
  search: '',
  action: '',
  entityType: ''
};

const COMMON_ACTIONS = [
  'LOGIN', 'LOGOUT', 'UPDATE_PROFILE', 'UPDATE_PASSWORD', 
  'CREATE_EMPLOYEE', 'UPDATE_EMPLOYEE', 'DELETE_EMPLOYEE',
  'UPDATE_SETTINGS', 'CREATE_TASK', 'UPDATE_TASK', 'DELETE_TASK',
  'CREATE_PAYROLL', 'UPDATE_PAYROLL', 'CREATE_INVOICE', 'UPDATE_INVOICE',
  'CHECK_IN', 'CHECK_OUT', 'CREATE_LEAVE', 'UPDATE_LEAVE',
  'CREATE_CLIENT', 'UPDATE_CLIENT', 'CREATE_LEAD', 'UPDATE_LEAD',
  'CREATE_ORDER', 'UPDATE_ORDER'
];

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Administrator',
  hr: 'HR Manager',
  accountant: 'Accountant',
  manager: 'Manager',
  employee: 'Employee',
  intern: 'Intern',
};

function formatRole(role) {
  return ROLE_LABELS[role] || role;
}

// ── Fetch & Render Users ─────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  const countEl = document.getElementById('user-count');
  const paginationEl = document.getElementById('user-pagination');
  if (!tbody) return;

  renderSkeletonRows(tbody, 7, 5);

  try {
    const roleIn = userState.role ? [userState.role] : null;
    const { data, count, pages } = await getEmployees({
      page: userState.page,
      pageSize: userState.pageSize,
      search: userState.search,
      status: userState.status,
      roleIn
    });

    if (countEl) countEl.textContent = `${count} users`;

    if (!data.length) {
      tbody.innerHTML = '';
      renderEmptyState(tbody.closest('.table-container'), {
        title: 'No users found',
        message: 'No system users match the current search or filters.'
      });
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }

    tbody.innerHTML = data.map(usr => `
      <tr data-id="${usr.id}">
        <td>
          <div class="table-name-cell">
            ${avatarHTML(usr, 'sm')}
            <div>
              <div class="name">${usr.full_name || '—'}</div>
              <div class="sub">ID: ${usr.id.slice(0, 8)}…</div>
            </div>
          </div>
        </td>
        <td>${usr.email || '—'}</td>
        <td>${usr.department?.name || '—'}</td>
        <td>${usr.designation || '—'}</td>
        <td><span class="badge badge-purple">${formatRole(usr.role)}</span></td>
        <td>${statusBadge(usr.status || 'active')}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-sm btn-ghost btn-icon-sm" data-action="edit-user" data-id="${usr.id}" title="Edit Access">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-action="edit-user"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        openEditUserModal(id);
      });
    });

    renderUserPagination(count, pages);
  } catch (err) {
    console.error('Failed to load users:', err);
    toast.error('Load Failed', 'Could not retrieve user directory.');
  }
}

function renderUserPagination(count, pages) {
  const el = document.getElementById('user-pagination');
  if (!el) return;

  const from = (userState.page - 1) * userState.pageSize + 1;
  const to = Math.min(userState.page * userState.pageSize, count);

  el.innerHTML = `
    <div class="pagination-info">Showing <strong>${from}-${to}</strong> of <strong>${count}</strong></div>
    <div class="pagination-controls">
      <button class="page-btn" id="usr-prev" ${userState.page <= 1 ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      ${Array.from({ length: Math.min(pages, 5) }, (_, i) => {
        const p = i + 1;
        return `<button class="page-btn ${p === userState.page ? 'active' : ''}" data-page="${p}">${p}</button>`;
      }).join('')}
      <button class="page-btn" id="usr-next" ${userState.page >= pages ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  `;

  el.querySelector('#usr-prev')?.addEventListener('click', () => {
    userState.page -= 1;
    loadUsers();
  });

  el.querySelector('#usr-next')?.addEventListener('click', () => {
    userState.page += 1;
    loadUsers();
  });

  el.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      userState.page = Number(btn.dataset.page);
      loadUsers();
    });
  });
}

// ── Open User Editor ─────────────────────────────────────────
async function openEditUserModal(id) {
  try {
    const emp = await getEmployee(id);
    if (!emp) return;

    document.getElementById('edit-user-id').value = emp.id;
    document.getElementById('edit-user-name').value = emp.full_name || '';
    document.getElementById('edit-user-email').value = emp.email || '';
    document.getElementById('edit-user-role').value = emp.role || 'employee';
    document.getElementById('edit-user-status').value = emp.status || 'active';
    document.getElementById('edit-user-dept').value = emp.department?.id || '';
    document.getElementById('edit-user-designation').value = emp.designation || '';

    openModal('edit-user-modal');
  } catch (err) {
    console.error('Failed to fetch user details:', err);
    toast.error('Load Failed', 'Could not open user editor.');
  }
}

// ── Fetch & Render Audit Logs ─────────────────────────────────
async function loadAuditLogs() {
  const tbody = document.getElementById('audit-tbody');
  const countEl = document.getElementById('audit-count');
  const paginationEl = document.getElementById('audit-pagination');
  if (!tbody) return;

  renderSkeletonRows(tbody, 6, 5);

  try {
    const { data, count, pages } = await getActivityLogs({
      page: auditState.page,
      pageSize: auditState.pageSize,
      search: auditState.search,
      action: auditState.action,
      entityType: auditState.entityType
    });

    if (countEl) countEl.textContent = `${count} logs`;

    if (!data.length) {
      tbody.innerHTML = '';
      renderEmptyState(tbody.closest('.table-container'), {
        title: 'No audit logs found',
        message: 'No logs match the current search or filters.'
      });
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }

    tbody.innerHTML = data.map(log => {
      const email = log.employee?.email || 'System';
      const name = log.employee?.full_name || 'System';
      return `
        <tr>
          <td><span class="text-sm font-mono">${formatDateTime(log.created_at)}</span></td>
          <td>
            <div class="text-sm font-medium">${name}</div>
            <div class="text-xs text-muted">${email}</div>
          </td>
          <td><span class="badge-log-action">${log.action}</span></td>
          <td><span class="badge-log-entity">${log.entity_type || '—'}</span></td>
          <td><span class="text-sm font-mono text-muted">${log.entity_id || '—'}</span></td>
          <td>
            <button class="btn btn-sm btn-ghost btn-icon-sm" data-action="view-metadata" data-index="${log.id}" title="View Metadata">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('[data-action="view-metadata"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const logId = btn.dataset.index;
        const log = data.find(l => String(l.id) === String(logId));
        if (log) {
          openAuditDetailsModal(log);
        }
      });
    });

    renderAuditPagination(count, pages);
  } catch (err) {
    console.error('Failed to load audit logs:', err);
    toast.error('Load Failed', 'Could not retrieve audit logs.');
  }
}

function openAuditDetailsModal(log) {
  const actionEl = document.getElementById('audit-detail-action');
  const jsonEl = document.getElementById('audit-detail-json');

  if (actionEl) actionEl.textContent = log.action;
  if (jsonEl) {
    try {
      const meta = log.metadata || {};
      jsonEl.textContent = JSON.stringify(meta, null, 2);
    } catch {
      jsonEl.textContent = 'Invalid JSON metadata';
    }
  }

  openModal('audit-details-modal');
}

function renderAuditPagination(count, pages) {
  const el = document.getElementById('audit-pagination');
  if (!el) return;

  const from = (auditState.page - 1) * auditState.pageSize + 1;
  const to = Math.min(auditState.page * auditState.pageSize, count);

  el.innerHTML = `
    <div class="pagination-info">Showing <strong>${from}-${to}</strong> of <strong>${count}</strong></div>
    <div class="pagination-controls">
      <button class="page-btn" id="aud-prev" ${auditState.page <= 1 ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      ${Array.from({ length: Math.min(pages, 5) }, (_, i) => {
        const p = i + 1;
        return `<button class="page-btn ${p === auditState.page ? 'active' : ''}" data-page="${p}">${p}</button>`;
      }).join('')}
      <button class="page-btn" id="aud-next" ${auditState.page >= pages ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  `;

  el.querySelector('#aud-prev')?.addEventListener('click', () => {
    auditState.page -= 1;
    loadAuditLogs();
  });

  el.querySelector('#aud-next')?.addEventListener('click', () => {
    auditState.page += 1;
    loadAuditLogs();
  });

  el.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      auditState.page = Number(btn.dataset.page);
      loadAuditLogs();
    });
  });
}

// ── Load & Save System Settings ────────────────────────────────
async function loadSettings() {
  const form = document.getElementById('system-settings-form');
  if (!form) return;

  try {
    const settings = await getSystemSettings();
    Object.entries(settings).forEach(([key, setting]) => {
      const el = document.getElementById(`setting-${key}`);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = setting.value === 'true' || setting.value === true;
      } else {
        el.value = setting.value ?? '';
      }
    });
  } catch (err) {
    console.error('Failed to load system settings:', err);
    toast.error('Load Failed', 'Could not retrieve system settings.');
  }
}

// ── Tab Navigation Setup ─────────────────────────────────────
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = btn.dataset.tab;
      document.getElementById(targetPanel)?.classList.add('active');

      if (targetPanel === 'users-panel') {
        loadUsers();
      } else if (targetPanel === 'audit-panel') {
        loadAuditLogs();
      } else if (targetPanel === 'settings-panel') {
        loadSettings();
      }
    });
  });
}

// ── Form Submissions & Listeners ─────────────────────────────
function setupFormListeners() {
  const userForm = document.getElementById('edit-user-form');
  userForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = userForm.querySelector('[type="submit"]');
    setLoading(btn, true);

    const id = document.getElementById('edit-user-id').value;
    const updates = {
      role: document.getElementById('edit-user-role').value,
      status: document.getElementById('edit-user-status').value,
      department_id: document.getElementById('edit-user-dept').value || null,
      designation: document.getElementById('edit-user-designation').value
    };

    try {
      await updateEmployee(id, updates);

      // Log the activity
      await createActivityLog({
        action: 'UPDATE_EMPLOYEE',
        entityType: 'employee',
        entityId: id,
        metadata: {
          employee_id: id,
          updated_fields: updates
        }
      });

      toast.success('User Updated', 'Access level and profile details saved successfully.');
      closeModal('edit-user-modal');
      loadUsers();
    } catch (err) {
      console.error('Failed to update employee:', err);
      toast.error('Save Failed', err.message || 'Could not save updates.');
    } finally {
      setLoading(btn, false);
    }
  });

  const settingsForm = document.getElementById('system-settings-form');
  settingsForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-settings');
    setLoading(btn, true);

    const fd = new FormData(settingsForm);
    const settingsObject = {};

    const checkboxKeys = [
      'allow_employee_self_checkout',
      'require_leave_approval',
      'enable_mfa'
    ];

    for (const [key, value] of fd.entries()) {
      if (!checkboxKeys.includes(key)) {
        settingsObject[key] = value;
      }
    }

    checkboxKeys.forEach(key => {
      const el = document.getElementById(`setting-${key}`);
      if (el) {
        settingsObject[key] = el.checked ? 'true' : 'false';
      }
    });

    try {
      await updateSystemSettings(settingsObject);

      // Log the activity
      await createActivityLog({
        action: 'UPDATE_SETTINGS',
        entityType: 'settings',
        metadata: {
          updated_settings: settingsObject
        }
      });

      toast.success('Settings Saved', 'Global configurations updated successfully.');
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Save Failed', err.message || 'Could not update configurations.');
    } finally {
      setLoading(btn, false);
    }
  });
}

// ── Search & Filter Listeners ─────────────────────────────────
function setupFilters() {
  // Users filters
  const userSearch = document.getElementById('user-search');
  userSearch?.addEventListener('input', debounce(e => {
    userState.search = e.target.value.trim();
    userState.page = 1;
    loadUsers();
  }, 350));

  const userRoleFilter = document.getElementById('user-role-filter');
  userRoleFilter?.addEventListener('change', e => {
    userState.role = e.target.value;
    userState.page = 1;
    loadUsers();
  });

  const userStatusFilter = document.getElementById('user-status-filter');
  userStatusFilter?.addEventListener('change', e => {
    userState.status = e.target.value;
    userState.page = 1;
    loadUsers();
  });

  // Audit filters
  const auditSearch = document.getElementById('audit-search');
  auditSearch?.addEventListener('input', debounce(e => {
    auditState.search = e.target.value.trim();
    auditState.page = 1;
    loadAuditLogs();
  }, 350));

  const auditActionFilter = document.getElementById('audit-action-filter');
  auditActionFilter?.addEventListener('change', e => {
    auditState.action = e.target.value;
    auditState.page = 1;
    loadAuditLogs();
  });

  const auditEntityFilter = document.getElementById('audit-entity-filter');
  auditEntityFilter?.addEventListener('change', e => {
    auditState.entityType = e.target.value;
    auditState.page = 1;
    loadAuditLogs();
  });
}

// ── Real-time Subscriptions ─────────────────────────────────
async function setupSubscriptions() {
  try {
    const subscription = await subscribeActivityLogs(() => {
      const auditTab = document.getElementById('audit-panel');
      if (auditTab && auditTab.classList.contains('active')) {
        loadAuditLogs();
      }
    });

    window.addEventListener('unload', () => {
      subscription?.unsubscribe();
    });
  } catch (err) {
    console.warn('Real-time subscriptions failed to initialize:', err);
  }
}

function populateActionFilter() {
  const actionFilter = document.getElementById('audit-action-filter');
  if (actionFilter) {
    actionFilter.innerHTML = '<option value="">All Actions</option>' + 
      COMMON_ACTIONS.map(act => `<option value="${act}">${act}</option>`).join('');
  }
}

async function loadDepartmentsDropdown() {
  try {
    const depts = await getDepartments();
    const deptSelect = document.getElementById('edit-user-dept');
    if (deptSelect) {
      deptSelect.innerHTML = '<option value="">No Department</option>' + 
        depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    }
  } catch (err) {
    console.error('Failed to load departments:', err);
  }
}

// ── Bootstrap ───────────────────────────────────────────────
async function init() {
  initTheme();
  
  const ctx = await bootPage({ requiredRoles: ['admin', 'super_admin'] });
  if (!ctx) return;
  
  initSidebar();
  initLogout();
  initThemeToggle();
  initDropdowns();
  setupModalClosers();

  setupTabs();
  setupFilters();
  setupFormListeners();
  
  populateActionFilter();
  await loadDepartmentsDropdown();
  
  // Initial load
  await loadUsers();
  await setupSubscriptions();
}

init();
