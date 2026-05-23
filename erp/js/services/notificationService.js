// ============================================================
// THE ANT BOX ERP — notificationService.js
// Notification management, email delivery, preferences
// ============================================================

import getSupabaseClient from './supabaseClient.js';

// ── Create Notification ───────────────────────────────────────
export async function createNotification(payload) {
  const supabase = await getSupabaseClient();

  const {
    recipient_id,
    title,
    message,
    type = 'info',
    category = 'system',
    reference_id = null,
    reference_type = null,
    action_url = null,
  } = payload;

  if (!recipient_id || !title || !message) {
    throw new Error('Missing required fields: recipient_id, title, message');
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      recipient_id,
      title,
      message,
      type,
      category,
      reference_id,
      reference_type,
      action_url,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create notification: ${error.message}`);
  return data;
}

// ── Get Notifications (paginated) ─────────────────────────────
export async function getNotifications({ page = 1, pageSize = 20, isRead = null, category = null } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) throw new Error('Not authenticated');

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('recipient_id', userId)
    .range(from, to)
    .order('created_at', { ascending: false });

  if (isRead !== null) query = query.eq('is_read', isRead);
  if (category) query = query.eq('category', category);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);
  return { data: data ?? [], count: count ?? 0, pages: Math.ceil((count ?? 0) / pageSize) };
}

// ── Get Unread Count ──────────────────────────────────────────
export async function getUnreadCount() {
  const supabase = await getSupabaseClient();

  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) throw new Error('Not authenticated');

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false);

  if (error) throw new Error(`Failed to count unread notifications: ${error.message}`);
  return count ?? 0;
}

// ── Mark Notification as Read ─────────────────────────────────
export async function markNotificationAsRead(notificationId) {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .select()
    .single();

  if (error) throw new Error(`Failed to mark notification as read: ${error.message}`);
  return data;
}

// ── Mark All as Read ──────────────────────────────────────────
export async function markAllAsRead() {
  const supabase = await getSupabaseClient();

  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('recipient_id', userId)
    .eq('is_read', false);

  if (error) throw new Error(`Failed to mark all notifications as read: ${error.message}`);
}

// ── Delete Notification ───────────────────────────────────────
export async function deleteNotification(notificationId) {
  const supabase = await getSupabaseClient();

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);

  if (error) throw new Error(`Failed to delete notification: ${error.message}`);
}

// ── Get User Notification Preferences ─────────────────────────
export async function getNotificationPreferences() {
  const supabase = await getSupabaseClient();

  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('user_preferences')
    .select('notifications_email, notifications_push, notifications_sms, email_digest')
    .eq('user_id', userId)
    .single();

  if (error) throw new Error(`Failed to fetch notification preferences: ${error.message}`);
  return data;
}

// ── Update Notification Preferences ───────────────────────────
export async function updateNotificationPreferences(prefs) {
  const supabase = await getSupabaseClient();

  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('user_preferences')
    .update(prefs)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update notification preferences: ${error.message}`);
  return data;
}

// ── Subscribe to Real-time Notifications ──────────────────────
export async function subscribeToNotifications(callback) {
  const supabase = await getSupabaseClient();

  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) throw new Error('Not authenticated');

  return supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${userId}`,
      },
      callback
    )
    .subscribe();
}

// ── Broadcast Notification to Multiple Users ──────────────────
export async function broadcastNotification(userIds, title, message, category) {
  const supabase = await getSupabaseClient();

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new Error('User IDs must be a non-empty array');
  }

  const notifications = userIds.map(userId => ({
    recipient_id: userId,
    title,
    message,
    category,
    type: 'info',
    created_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('notifications')
    .insert(notifications)
    .select();

  if (error) throw new Error(`Failed to broadcast notification: ${error.message}`);
  return data ?? [];
}
