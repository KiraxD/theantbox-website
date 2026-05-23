// ============================================================
// THE ANT BOX ERP — authGuard.js
// Route protection, role-based access, session management
// ============================================================

import { getSession, getUserProfile, signOut } from '../services/authService.js';
import { showToast } from './toast.js';

const PUBLIC_PAGES = ['/erp/index.html', '/erp/', '/erp/pages/reset-password.html'];

// ── Guard: require auth, redirect to login if not ────────────
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    redirectToLogin();
    return null;
  }

  // Session expiry check
  const expiresAt = session.expires_at * 1000;
  if (Date.now() > expiresAt) {
    await signOut();
    redirectToLogin('Session expired. Please log in again.');
    return null;
  }

  return session;
}

// ── Guard: require specific role(s) ──────────────────────────
export async function requireRole(allowedRoles) {
  const session = await requireAuth();
  if (!session) return null;

  const profile = await getUserProfile(session.user.id);
  if (!profile) {
    try { await signOut(); } catch (e) { console.error('[requireRole signOut]', e); }
    redirectToLogin('Profile not found. Contact your administrator.');
    return null;
  }

  if (profile.status === 'pending' && !window.location.pathname.includes('pending.html')) {
    window.location.href = '/erp/pages/pending.html';
    return null;
  }

  if (!allowedRoles.includes(profile.role)) {
    showToast('error', 'Access Denied', 'You do not have permission to view this page.');
    setTimeout(() => { window.location.href = '/erp/dashboard.html'; }, 1500);
    return null;
  }

  return profile;
}

// ── Guard: redirect logged-in users away from login page ─────
export async function redirectIfAuthenticated() {
  const session = await getSession();
  if (session) {
    window.location.href = '/erp/dashboard.html';
    return true;
  }
  return false;
}

// ── Full page boot: auth + profile + UI injection ────────────
export async function bootPage({ requiredRoles = null } = {}) {
  try {
    const session = await getSession();
    if (!session) {
      redirectToLogin();
      return null;
    }

    const profile = await getUserProfile(session.user.id);
    if (!profile) {
      try { await signOut(); } catch (e) { console.error('[bootPage signOut]', e); }
      redirectToLogin('Profile setup incomplete.');
      return null;
    }

    const isPendingPage = window.location.pathname.includes('pending.html');

    if (profile.status === 'pending' && !isPendingPage) {
      window.location.href = '/erp/pages/pending.html';
      return null;
    }

    if (profile.status !== 'pending' && isPendingPage) {
      window.location.href = '/erp/dashboard.html';
      return null;
    }

    if (requiredRoles && !requiredRoles.includes(profile.role)) {
      window.location.href = '/erp/dashboard.html';
      return null;
    }

    // Inject user info into navbar
    injectUserUI(profile);

    // Store in sessionStorage for quick access
    sessionStorage.setItem('erp_profile', JSON.stringify(profile));

    return { session, profile };
  } catch (err) {
    console.error('[bootPage]', err);
    try { await signOut(); } catch (e) { console.error('[bootPage catch signOut]', e); }
    redirectToLogin('Authentication error. Please log in again.');
    return null;
  }
}

// ── Get cached profile ────────────────────────────────────────
export function getCachedProfile() {
  try {
    const raw = sessionStorage.getItem('erp_profile');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Inject user info into topbar UI ──────────────────────────
function injectUserUI(profile) {
  // Topbar name
  const nameEl = document.getElementById('topbar-user-name');
  if (nameEl) nameEl.textContent = profile.full_name?.split(' ')[0] || 'User';

  const topbarRole = document.getElementById('topbar-user-role');
  if (topbarRole) topbarRole.textContent = formatRoleLabel(profile.role);

  // Topbar avatar
  const avatarEl = document.getElementById('topbar-avatar');
  if (avatarEl) {
    if (profile.avatar_url) {
      avatarEl.innerHTML = `<img src="${profile.avatar_url}" alt="${profile.full_name}">`;
    } else {
      avatarEl.textContent = getInitials(profile.full_name);
    }
  }

  // Sidebar user info
  const sidebarName = document.getElementById('sidebar-user-name');
  const sidebarRole = document.getElementById('sidebar-user-role');
  const sidebarAvatar = document.getElementById('sidebar-avatar');

  if (sidebarName) sidebarName.textContent = profile.full_name || 'User';
  if (sidebarRole) sidebarRole.textContent = formatRoleLabel(profile.role);
  if (sidebarAvatar) {
    if (profile.avatar_url) {
      sidebarAvatar.innerHTML = `<img src="${profile.avatar_url}" alt="">`;
    } else {
      sidebarAvatar.textContent = getInitials(profile.full_name);
    }
  }

  // Hide role-restricted nav items
  applyRoleVisibility(profile.role);
}

// ── Apply role-based nav visibility ──────────────────────────
function applyRoleVisibility(role) {
  const ROLE_POWER = { intern: 0, employee: 1, manager: 2, accountant: 3, hr: 3, admin: 4, super_admin: 5 };
  const userPower = ROLE_POWER[role] ?? 0;

  document.querySelectorAll('[data-min-role]').forEach(el => {
    const minRole = el.dataset.minRole;
    const minPower = ROLE_POWER[minRole] ?? 99;
    if (userPower < minPower) el.style.display = 'none';
  });
}

// ── Handle logout click ───────────────────────────────────────
export async function handleLogout() {
  try {
    await signOut();
    sessionStorage.removeItem('erp_profile');
    redirectToLogin();
  } catch (err) {
    showToast('error', 'Logout failed', err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────
function redirectToLogin(message = '') {
  localStorage.removeItem('erp_session');
  sessionStorage.removeItem('erp_profile');
  const url = new URL('/erp/index.html', window.location.origin);
  if (message) url.searchParams.set('msg', message);
  window.location.href = url.toString();
}

function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function formatRoleLabel(role = '') {
  const map = {
    super_admin: 'Super Admin',
    admin: 'Administrator',
    hr: 'HR Manager',
    accountant: 'Accountant',
    manager: 'Manager',
    employee: 'Employee',
    intern: 'Intern',
  };
  return map[role] || role || 'Team Member';
}
