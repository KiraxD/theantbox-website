// ============================================================
// THE ANT BOX ERP — noticeService.js
// CRUD operations for Notices & Reactions
// ============================================================

import getSupabaseClient from './supabaseClient.js';

// 1. Get All Active Notices
export async function getNotices() {
  const supabase = await getSupabaseClient();
  const nowStr = new Date().toISOString();

  const { data, error } = await supabase
    .from('notices')
    .select(`
      *,
      created_by_emp:employees!created_by(id, full_name, avatar_url, role),
      notice_reactions(employee_id, reaction_type)
    `)
    .or(`expires_at.is.null,expires_at.gt.${nowStr}`)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch notices: ${error.message}`);
  return data ?? [];
}

// 2. Create Notice
export async function createNotice(payload) {
  const supabase = await getSupabaseClient();
  
  const { title, content, is_pinned = false, expires_at = null } = payload;
  
  if (!title || !content) {
    throw new Error('Title and content are required');
  }

  const session = await supabase.auth.getSession();
  const currentUserId = session.data.session?.user.id;
  if (!currentUserId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('notices')
    .insert({
      title,
      content,
      is_pinned,
      expires_at: expires_at || null,
      created_by: currentUserId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create notice: ${error.message}`);
  return data;
}

// 3. Delete Notice
export async function deleteNotice(noticeId) {
  const supabase = await getSupabaseClient();

  const { error } = await supabase
    .from('notices')
    .delete()
    .eq('id', noticeId);

  if (error) throw new Error(`Failed to delete notice: ${error.message}`);
}

// 4. Toggle Reaction
export async function toggleReaction(noticeId, reactionType) {
  const supabase = await getSupabaseClient();
  const session = await supabase.auth.getSession();
  const employeeId = session.data.session?.user.id;
  if (!employeeId) throw new Error('Not authenticated');

  // Check if reaction already exists
  const { data: existing, error: checkError } = await supabase
    .from('notice_reactions')
    .select('id')
    .eq('notice_id', noticeId)
    .eq('employee_id', employeeId)
    .eq('reaction_type', reactionType)
    .maybeSingle();

  if (checkError) throw new Error(checkError.message);

  if (existing) {
    // Delete existing reaction
    const { error: deleteError } = await supabase
      .from('notice_reactions')
      .delete()
      .eq('id', existing.id);
      
    if (deleteError) throw new Error(deleteError.message);
    return { action: 'removed' };
  } else {
    // Insert new reaction
    const { error: insertError } = await supabase
      .from('notice_reactions')
      .insert({
        notice_id: noticeId,
        employee_id: employeeId,
        reaction_type: reactionType
      });
      
    if (insertError) throw new Error(insertError.message);
    return { action: 'added' };
  }
}
