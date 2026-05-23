// ============================================================
// THE ANT BOX ERP — activityLogService.js
// Activity Logging & Retrieval Service
// ============================================================

import getSupabaseClient from './supabaseClient.js';
import { getCurrentUser } from './authService.js';

// ── Fetch Activity Logs (paginated) ──────────────────────────
export async function getActivityLogs({ page = 1, pageSize = 20, search = '', action = '', entityType = '' } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('activity_logs')
    .select(`
      id,
      action,
      entity_type,
      entity_id,
      metadata,
      created_at,
      employee:employees(id, full_name, email)
    `, { count: 'exact' });

  // Filter by action if provided
  if (action) {
    query = query.eq('action', action);
  }

  // Filter by entityType if provided
  if (entityType) {
    query = query.eq('entity_type', entityType);
  }

  // Handle Search
  if (search) {
    query = query.or(`action.ilike.%${search}%,entity_type.ilike.%${search}%`);
  }

  // Sort by created_at descending (latest first)
  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: data ?? [],
    count: count ?? 0,
    pages: Math.ceil((count ?? 0) / pageSize)
  };
}

// ── Create Activity Log ───────────────────────────────────────
export async function createActivityLog({ action, entityType = null, entityId = null, metadata = {} } = {}) {
  try {
    const supabase = await getSupabaseClient();
    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('activity_logs')
      .insert({
        user_id: user.id,
        action,
        entity_type: entityType,
        entity_id: entityId,
        metadata,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Failed to write activity log:', err);
    return null;
  }
}

// ── Subscribe to Activity Log Updates ─────────────────────────
export async function subscribeActivityLogs(callback) {
  const supabase = await getSupabaseClient();
  return supabase
    .channel('activity-log-updates')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, callback)
    .subscribe();
}
