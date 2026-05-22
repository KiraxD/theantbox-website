// ============================================================
// THE ANT BOX ERP — ui.js
// DOM utilities, rendering helpers, theme, sidebar, search
// ============================================================

// ── DOM Helpers ───────────────────────────────────────────────
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...children) {
  const elem = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') elem.className = v;
    else if (k === 'html')  elem.innerHTML = v;
    else if (k.startsWith('on')) elem.addEventListener(k.slice(2).toLowerCase(), v);
    else elem.setAttribute(k, v);
  });
  children.forEach(child => {
    if (typeof child === 'string') elem.insertAdjacentHTML('beforeend', child);
    else if (child) elem.appendChild(child);
  });
  return elem;
}

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Theme Toggle ──────────────────────────────────────────────
export function initTheme() {
  const saved = localStorage.getItem('erp_theme') || 'light';
  applyTheme(saved);
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('erp_theme', theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  return next;
}

// ── Sidebar Toggle (mobile) ───────────────────────────────────
export function initSidebar() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (!toggle || !sidebar) return;

  const closeSidebar = () => {
    sidebar.classList.remove('is-open');
    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    overlay?.classList.remove('is-visible');
  };

  const openSidebar = () => {
    sidebar.classList.add('is-open');
    toggle.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    overlay?.classList.add('is-visible');
  };

  const toggleSidebar = () => {
    const isOpen = sidebar.classList.contains('is-open');
    if (isOpen) closeSidebar();
    else openSidebar();
  };

  toggle.addEventListener('click', toggleSidebar);

  overlay?.addEventListener('click', closeSidebar);

  // Close sidebar when nav item is clicked
  $$('.nav-item').forEach(link => {
    link.addEventListener('click', () => {
      // Check if we're on mobile/tablet
      if (window.innerWidth <= 1024) {
        closeSidebar();
      }
    });
  });

  // Keyboard navigation: Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('is-open')) {
      closeSidebar();
      toggle.focus();
    }
  });

  // Mark active nav item
  const currentPath = window.location.pathname;
  $$('.nav-item').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href && currentPath.endsWith(href.split('/').pop())) {
      link.classList.add('active');
    }
  });
}

// ── Logout Button ─────────────────────────────────────────────
export function initLogout() {
  $$('[data-logout]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { handleLogout } = await import('./authGuard.js');
      await handleLogout();
    });
  });
}

// ── Theme Toggle Button ───────────────────────────────────────
export function initThemeToggle() {
  $$('[data-theme-toggle]').forEach(btn => {
    const initialTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const initialSunIcon = btn.querySelector('.theme-icon-sun');
    const initialMoonIcon = btn.querySelector('.theme-icon-moon');
    if (initialSunIcon) initialSunIcon.style.display = initialTheme === 'dark' ? 'none' : 'block';
    if (initialMoonIcon) initialMoonIcon.style.display = initialTheme === 'dark' ? 'block' : 'none';
    btn.addEventListener('click', () => {
      const next = toggleTheme();
      const sunIcon  = btn.querySelector('.theme-icon-sun');
      const moonIcon = btn.querySelector('.theme-icon-moon');
      if (sunIcon)  sunIcon.style.display  = next === 'dark' ? 'none' : 'block';
      if (moonIcon) moonIcon.style.display = next === 'dark' ? 'block' : 'none';
    });
  });
}

// ── Notification dropdown ─────────────────────────────────────
export function initNotifToggle() {
  const btn   = document.getElementById('notif-btn');
  const panel = document.getElementById('notif-panel');
  if (!btn || !panel) return;

  const setOpen = (isOpen) => {
    panel.classList.toggle('is-open', isOpen);
    panel.setAttribute('aria-hidden', String(!isOpen));
    btn.setAttribute('aria-expanded', String(isOpen));
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!panel.classList.contains('is-open'));
  });

  panel.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
}

// ── Dropdown Menus ────────────────────────────────────────────
export function initDropdowns() {
  $$('[data-dropdown-trigger]').forEach(trigger => {
    const menuId = trigger.dataset.dropdownTrigger;
    const menu   = document.getElementById(menuId);
    if (!menu) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', String(isOpen));
    });
  });

  document.addEventListener('click', () => {
    $$('.dropdown-menu.is-open').forEach(m => m.classList.remove('is-open'));
  });
}

// ── Date / Time Formatters ────────────────────────────────────
export function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', ...opts,
  });
}

export function formatTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return `${formatDate(dateStr)} · ${formatTime(dateStr)}`;
}

export function formatRelative(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);

  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return formatDate(dateStr);
}

// ── Initials / Avatar ─────────────────────────────────────────
export function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

export function avatarHTML(profile, size = 'md') {
  if (profile?.avatar_url) {
    return `<img src="${esc(profile.avatar_url)}" alt="${esc(profile.full_name)}" class="avatar avatar-${size}">`;
  }
  const initials = getInitials(profile?.full_name);
  return `<div class="avatar avatar-${size} avatar-purple">${initials}</div>`;
}

// ── Status Badge ──────────────────────────────────────────────
export function statusBadge(status) {
  const map = {
    active:    { cls: 'badge-success', label: 'Active' },
    inactive:  { cls: 'badge-muted',   label: 'Inactive' },
    pending:   { cls: 'badge-warning', label: 'Pending' },
    approved:  { cls: 'badge-success', label: 'Approved' },
    rejected:  { cls: 'badge-danger',  label: 'Rejected' },
    present:   { cls: 'badge-success', label: 'Present' },
    absent:    { cls: 'badge-danger',  label: 'Absent' },
    late:      { cls: 'badge-warning', label: 'Late' },
    paid:      { cls: 'badge-success', label: 'Paid' },
    draft:     { cls: 'badge-muted',   label: 'Draft' },
    todo:      { cls: 'badge-muted',   label: 'To Do' },
    in_progress: { cls: 'badge-info',  label: 'In Progress' },
    in_review: { cls: 'badge-warning', label: 'In Review' },
    done:      { cls: 'badge-success', label: 'Done' },
    cancelled: { cls: 'badge-danger',  label: 'Cancelled' },
    probation: { cls: 'badge-warning', label: 'Probation' },
  };
  const { cls = 'badge-muted', label = status } = map[status] || {};
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── Priority Badge ────────────────────────────────────────────
export function priorityBadge(priority) {
  const map = {
    low:    { cls: 'badge-muted',   label: 'Low' },
    medium: { cls: 'badge-info',    label: 'Medium' },
    high:   { cls: 'badge-warning', label: 'High' },
    urgent: { cls: 'badge-danger',  label: 'Urgent' },
  };
  const { cls = 'badge-muted', label = priority } = map[priority] || {};
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── Loading state helpers ─────────────────────────────────────
export function setLoading(btn, loading = true) {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.classList.add('is-loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('is-loading');
    btn.disabled = false;
    if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
  }
}

// ── Render skeleton rows ──────────────────────────────────────
export function renderSkeletonRows(tbody, cols = 5, rows = 5) {
  tbody.innerHTML = Array(rows).fill(0).map(() => `
    <tr>${Array(cols).fill(0).map(() => `
      <td><div class="skeleton" style="height:14px;width:${60 + Math.random() * 30}%;border-radius:6px;"></div></td>
    `).join('')}</tr>
  `).join('');
}

// ── Empty state ───────────────────────────────────────────────
export function renderEmptyState(container, { icon = '', title = 'No data found', message = '', action = '' } = {}) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">
        ${icon || `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`}
      </div>
      <h3>${esc(title)}</h3>
      ${message ? `<p>${esc(message)}</p>` : ''}
      ${action}
    </div>
  `;
}

// ── Clock ─────────────────────────────────────────────────────
export function startClock(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const update = () => {
    el.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };
  update();
  return setInterval(update, 1000);
}

// ── Number formatter ──────────────────────────────────────────
export function formatNumber(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
}

export function formatRoleLabel(role = '') {
  const map = {
    super_admin: 'Super Admin',
    hr: 'HR Manager',
    manager: 'Manager',
    employee: 'Employee',
    intern: 'Intern',
  };
  return map[role] || role || 'Team Member';
}

// ── Debounce ──────────────────────────────────────────────────
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Truncate text ─────────────────────────────────────────────
export function truncate(str, max = 40) {
  if (!str || str.length <= max) return str || '';
  return str.slice(0, max) + '…';
}
