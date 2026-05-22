import { bootPage } from './modules/authGuard.js';
import getSupabaseClient from './services/supabaseClient.js';
let supabase;
import { showToast } from './modules/toast.js';
import { initTheme, initSidebar, initLogout, initThemeToggle, initDropdowns } from './modules/ui.js';

let currentUser = null;

async function init() {
  initTheme();
  const ctx = await bootPage({ requiredRoles: ['super_admin', 'admin', 'hr', 'accountant', 'manager', 'employee'] });
  if (!ctx) return;
  currentUser = ctx.profile;
  supabase = await getSupabaseClient();

  initSidebar(); initLogout(); initThemeToggle(); initDropdowns();
  setupUI();
  await loadInterns();
}

function setupUI() {
  // basic setup
}

async function loadInterns() {
  const tbody = document.getElementById('interns-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="skeleton" style="height:20px;width:100px;margin:auto;"></div></td></tr>';
  
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*, departments(name)')
      .eq('role', 'intern')
      .order('full_name');

    if (error) throw error;
    
    tbody.innerHTML = '';
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No interns found</td></tr>';
      return;
    }

    data.forEach(intern => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="avatar avatar-sm avatar-purple">${intern.full_name.charAt(0)}</div>
            <div>
              <div class="font-weight-500">${intern.full_name}</div>
              <div class="text-xs text-muted">${intern.email}</div>
            </div>
          </div>
        </td>
        <td>${intern.departments?.name || 'Unassigned'}</td>
        <td>${intern.designation || '-'}</td>
        <td>${intern.joining_date ? new Date(intern.joining_date).toLocaleDateString() : '-'}</td>
        <td>
          <span class="badge ${intern.status === 'active' ? 'badge-success' : intern.status === 'inactive' ? 'badge-danger' : 'badge-warning'}">${intern.status}</span>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch(err) {
    showToast(err.message, 'error');
  }
}

init();
