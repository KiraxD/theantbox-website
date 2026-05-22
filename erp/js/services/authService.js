// ============================================================
// THE ANT BOX ERP — authService.js
// Auth: login, logout, session, password reset, profile fetch
// ============================================================

import getSupabaseClient from './supabaseClient.js';

// ── Sign In ─────────────────────────────────────────────────
export async function signIn(email, password) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// ── Sign Up ─────────────────────────────────────────────────
export async function signUp(email, password, fullName) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ 
    email, 
    password,
    options: {
      data: {
        full_name: fullName
      }
    }
  });
  if (error) throw error;
  return data;
}

// ── Sign Out ─────────────────────────────────────────────────
export async function signOut() {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ── Get Current Session ──────────────────────────────────────
export async function getSession() {
  const supabase = await getSupabaseClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

// ── Get Current User ─────────────────────────────────────────
export async function getCurrentUser() {
  const supabase = await getSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

// ── Get User Profile (with role) ─────────────────────────────
export async function getUserProfile(userId = null) {
  const supabase = await getSupabaseClient();
  let uid = userId;

  if (!uid) {
    const user = await getCurrentUser();
    uid = user?.id;
  }

  if (!uid) return null;

  const { data, error } = await supabase
    .from('employees')
    .select(`
      *,
      department:departments(id, name)
    `)
    .eq('id', uid)
    .single();

  if (error) throw error;
  return data;
}

// ── Send Password Reset Email ─────────────────────────────────
export async function sendPasswordReset(email) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/erp/pages/reset-password.html`,
  });
  if (error) throw error;
}

// ── Update Password ───────────────────────────────────────────
export async function updatePassword(newPassword) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ── Update Profile ────────────────────────────────────────────
export async function updateProfile(updates) {
  const supabase = await getSupabaseClient();
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('employees')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Listen to Auth State Changes ─────────────────────────────
export async function onAuthStateChange(callback) {
  const supabase = await getSupabaseClient();
  return supabase.auth.onAuthStateChange(callback);
}

// ── Check if user has required role ──────────────────────────
export function hasRole(profile, allowedRoles) {
  if (!profile || !profile.role) return false;
  return allowedRoles.includes(profile.role);
}

// Role hierarchy (higher index = more access)
export const ROLES = {
  intern:      0,
  employee:    1,
  manager:     2,
  accountant:  3,
  hr:          3,
  admin:       4,
  super_admin: 5,
};

export function hasMinRole(profile, minRole) {
  if (!profile?.role) return false;
  return (ROLES[profile.role] ?? -1) >= (ROLES[minRole] ?? 99);
}

// ── Log Activity ──────────────────────────────────────────────
export async function logActivity(action, metadata = {}) {
  try {
    const supabase = await getSupabaseClient();
    const user = await getCurrentUser();
    if (!user) return;

    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action,
      metadata,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Silent fail — logging should never break the app
  }
}
