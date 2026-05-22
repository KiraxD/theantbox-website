// ============================================================
// THE ANT BOX ERP — taskService.js
// Task CRUD, kanban columns, comments, realtime updates
// ============================================================

import getSupabaseClient from './supabaseClient.js';

// ── Get Tasks (kanban) ────────────────────────────────────────
export async function getTasks({ assignedTo = null, status = null, search = '' } = {}) {
  const supabase = await getSupabaseClient();

  let query = supabase
    .from('tasks')
    .select(`
      *,
      assignee:employees!assigned_to(id, full_name, avatar_url),
      creator:employees!created_by(id, full_name),
      comments:task_comments(count)
    `)
    .order('created_at', { ascending: false });

  if (assignedTo) query = query.eq('assigned_to', assignedTo);
  if (status)     query = query.eq('status', status);
  if (search)     query = query.ilike('title', `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── Get Single Task ───────────────────────────────────────────
export async function getTask(id) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      assignee:employees!assigned_to(id, full_name, avatar_url),
      creator:employees!created_by(id, full_name, avatar_url),
      comments:task_comments(*, author:employees(id, full_name, avatar_url))
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// ── Create Task ───────────────────────────────────────────────
export async function createTask(payload) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...payload,
      status: payload.status || 'todo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Update Task ───────────────────────────────────────────────
export async function updateTask(id, updates) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Move Task (status change for kanban) ──────────────────────
export async function moveTask(id, newStatus) {
  return updateTask(id, { status: newStatus });
}

// ── Delete Task ───────────────────────────────────────────────
export async function deleteTask(id) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

// ── Add Comment ───────────────────────────────────────────────
export async function addComment(taskId, authorId, content) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('task_comments')
    .insert({
      task_id: taskId,
      author_id: authorId,
      content,
      created_at: new Date().toISOString(),
    })
    .select(`*, author:employees(id, full_name, avatar_url)`)
    .single();

  if (error) throw error;
  return data;
}

// ── Delete Comment ────────────────────────────────────────────
export async function deleteComment(commentId) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('task_comments').delete().eq('id', commentId);
  if (error) throw error;
}

// ── Get Task Stats ────────────────────────────────────────────
export async function getTaskStats() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('status, priority');

  if (error) throw error;

  return {
    total: data.length,
    todo:       data.filter(t => t.status === 'todo').length,
    in_progress: data.filter(t => t.status === 'in_progress').length,
    in_review:  data.filter(t => t.status === 'in_review').length,
    done:       data.filter(t => t.status === 'done').length,
    high_priority: data.filter(t => t.priority === 'high').length,
    overdue: data.filter(t => {
      if (t.status === 'done') return false;
      return t.deadline && new Date(t.deadline) < new Date();
    }).length,
  };
}

// ── Subscribe to Task Updates ─────────────────────────────────
export async function subscribeTasks(callback) {
  const supabase = await getSupabaseClient();
  return supabase
    .channel('task-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, callback)
    .subscribe();
}
