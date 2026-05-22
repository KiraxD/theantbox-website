import { bootPage } from './modules/authGuard.js';
import getSupabaseClient from './services/supabaseClient.js';
import { showToast } from './modules/toast.js';
import {
  initTheme,
  initSidebar,
  initLogout,
  initThemeToggle,
  initDropdowns
} from './modules/ui.js';

let currentUser = null;
let supabase = null;

async function init() {
  initTheme();
  
  const ctx = await bootPage();
  if (!ctx) return;
  
  currentUser = ctx.profile;
  supabase = await getSupabaseClient();

  initSidebar();
  initLogout();
  initThemeToggle();
  initDropdowns();

  setupUI();
  await loadProfile();
}

function setupUI() {
  document.getElementById('profile-form').addEventListener('submit', handleUpdateProfile);
  document.getElementById('password-form').addEventListener('submit', handleUpdatePassword);
}

async function loadProfile() {
  document.getElementById('full_name').value = currentUser.full_name || '';
  document.getElementById('email').value = currentUser.email || '';
  document.getElementById('phone').value = currentUser.phone || '';
  
  // Read-only fields
  document.getElementById('role').value = currentUser.role || 'Unknown';
}

async function handleUpdateProfile(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  
  try {
    if (!supabase) {
      showToast('Database connection not initialized', 'error');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const { error } = await supabase.from('employees').update({
      full_name: formData.get('full_name'),
      phone: formData.get('phone')
    }).eq('id', currentUser.id);

    if (error) throw error;
    showToast('Profile updated successfully', 'success');
  } catch (err) {
    console.error('[handleUpdateProfile]', err);
    showToast(err.message || 'Failed to update profile', 'error');
  } finally {
    e.target.querySelector('button[type="submit"]').disabled = false;
  }
}

async function handleUpdatePassword(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const pass = formData.get('password');
  const confirm = formData.get('confirm_password');

  if (pass !== confirm) {
    showToast('Passwords do not match', 'error');
    return;
  }

  if (pass.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }

  try {
    if (!supabase) {
      showToast('Database connection not initialized', 'error');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const { error } = await supabase.auth.updateUser({
      password: pass
    });

    if (error) throw error;
    showToast('Password updated successfully', 'success');
    e.target.reset();
  } catch (err) {
    console.error('[handleUpdatePassword]', err);
    showToast(err.message || 'Failed to update password', 'error');
  } finally {
    e.target.querySelector('button[type="submit"]').disabled = false;
  }
}

init();
