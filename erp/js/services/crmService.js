// ============================================================
// THE ANT BOX ERP — crmService.js
// Leads, clients, interactions, sales pipeline
// ============================================================

import getSupabaseClient from './supabaseClient.js';

// ── LEADS ─────────────────────────────────────────────────────

// Get All Leads
export async function getLeads({ page = 1, pageSize = 20, status = '', search = '', assignedTo = null } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('leads')
    .select(`
      *,
      assigned_emp:employees!assigned_to(id, full_name, avatar_url)
    `, { count: 'exact' })
    .is('deleted_at', null)
    .range(from, to)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (assignedTo) query = query.eq('assigned_to', assignedTo);
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to fetch leads: ${error.message}`);
  return { data: data ?? [], count: count ?? 0, pages: Math.ceil((count ?? 0) / pageSize) };
}

// Get Single Lead
export async function getLead(leadId) {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('leads')
    .select(`
      *,
      assigned_emp:employees!assigned_to(id, full_name, email),
      interactions:crm_interactions(*)
    `)
    .eq('id', leadId)
    .single();

  if (error) throw new Error(`Failed to fetch lead: ${error.message}`);
  return data;
}

// Create Lead
export async function createLead(payload) {
  const supabase = await getSupabaseClient();

  const {
    name,
    email,
    phone,
    company,
    designation,
    industry,
    source,
    assigned_to = null,
  } = payload;

  if (!name || !email) throw new Error('Missing required fields: name, email');

  const session = await supabase.auth.getSession();
  const currentUserId = session.data.session?.user.id;

  const { data, error } = await supabase
    .from('leads')
    .insert({
      name,
      email,
      phone,
      company,
      designation,
      industry,
      source,
      assigned_to,
      status: 'new',
      created_by: currentUserId,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create lead: ${error.message}`);
  return data;
}

// Update Lead
export async function updateLead(leadId, updates) {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('leads')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update lead: ${error.message}`);
  return data;
}

// Update Lead Status
export async function updateLeadStatus(leadId, status) {
  const validStatuses = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  return updateLead(leadId, { status });
}

// Delete Lead (soft delete)
export async function deleteLead(leadId) {
  const supabase = await getSupabaseClient();

  const { error } = await supabase
    .from('leads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', leadId);

  if (error) throw new Error(`Failed to delete lead: ${error.message}`);
}

// ── CLIENTS ───────────────────────────────────────────────────

// Get All Clients
export async function getClients({ page = 1, pageSize = 20, status = '', search = '' } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('clients')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .range(from, to)
    .order('name');

  if (status) query = query.eq('status', status);
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to fetch clients: ${error.message}`);
  return { data: data ?? [], count: count ?? 0, pages: Math.ceil((count ?? 0) / pageSize) };
}

// Get Single Client
export async function getClient(clientId) {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('clients')
    .select(`
      *,
      created_by_emp:employees(full_name)
    `)
    .eq('id', clientId)
    .single();

  if (error) throw new Error(`Failed to fetch client: ${error.message}`);
  return data;
}

// Create Client
export async function createClient(payload) {
  const supabase = await getSupabaseClient();

  const { name, email, phone, address, city, state, postal_code, country } = payload;

  if (!name) throw new Error('Client name is required');

  const session = await supabase.auth.getSession();
  const currentUserId = session.data.session?.user.id;

  const { data, error } = await supabase
    .from('clients')
    .insert({
      name,
      email,
      phone,
      address,
      city,
      state,
      postal_code,
      country,
      status: 'active',
      created_by: currentUserId,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create client: ${error.message}`);
  return data;
}

// Update Client
export async function updateClient(clientId, updates) {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('clients')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update client: ${error.message}`);
  return data;
}

// ── CRM INTERACTIONS ──────────────────────────────────────────

// Get Interactions for Lead or Client
export async function getInteractions({ leadId = null, clientId = null } = {}) {
  const supabase = await getSupabaseClient();

  let query = supabase
    .from('crm_interactions')
    .select(`
      *,
      created_by_emp:employees!created_by(id, full_name, avatar_url)
    `)
    .order('interaction_date', { ascending: false });

  if (leadId) query = query.eq('lead_id', leadId);
  if (clientId) query = query.eq('client_id', clientId);

  if (!leadId && !clientId) {
    throw new Error('Must provide either leadId or clientId');
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to fetch interactions: ${error.message}`);
  return data ?? [];
}

// Add Interaction
export async function addInteraction(payload) {
  const supabase = await getSupabaseClient();

  const {
    lead_id = null,
    client_id = null,
    interaction_type,
    subject,
    notes,
    outcome = null,
    next_steps = null,
  } = payload;

  if (!interaction_type || !subject) {
    throw new Error('Missing required fields: interaction_type, subject');
  }

  if (!lead_id && !client_id) {
    throw new Error('Must provide either lead_id or client_id');
  }

  const session = await supabase.auth.getSession();
  const currentUserId = session.data.session?.user.id;

  const { data, error } = await supabase
    .from('crm_interactions')
    .insert({
      lead_id,
      client_id,
      interaction_type,
      interaction_date: new Date().toISOString(),
      subject,
      notes,
      outcome,
      next_steps,
      created_by: currentUserId,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add interaction: ${error.message}`);
  return data;
}

// ── SALES PIPELINE ────────────────────────────────────────────

// Get Pipeline Stages
export async function getSalesPipelineStages() {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('sales_pipeline_stages')
    .select('*')
    .order('sequence');

  if (error) throw new Error(`Failed to fetch pipeline stages: ${error.message}`);
  return data ?? [];
}

// Get Pipeline Summary
export async function getPipelineSummary() {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('leads')
    .select('status, id')
    .is('deleted_at', null);

  if (error) throw new Error(`Failed to fetch pipeline summary: ${error.message}`);

  const summary = {
    total: data.length,
    new: data.filter(l => l.status === 'new').length,
    contacted: data.filter(l => l.status === 'contacted').length,
    qualified: data.filter(l => l.status === 'qualified').length,
    proposal_sent: data.filter(l => l.status === 'proposal_sent').length,
    negotiation: data.filter(l => l.status === 'negotiation').length,
    won: data.filter(l => l.status === 'won').length,
    lost: data.filter(l => l.status === 'lost').length,
  };

  return summary;
}

// ── CRM STATISTICS ────────────────────────────────────────────

export async function getCRMStats() {
  const supabase = await getSupabaseClient();

  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id, status')
    .is('deleted_at', null);

  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('id')
    .eq('status', 'active')
    .is('deleted_at', null);

  if (leadsError) throw new Error(`Failed to fetch leads: ${leadsError.message}`);
  if (clientsError) throw new Error(`Failed to fetch clients: ${clientsError.message}`);

  return {
    total_leads: leads.length,
    active_leads: leads.filter(l => !['won', 'lost'].includes(l.status)).length,
    total_clients: clients.length,
    won_deals: leads.filter(l => l.status === 'won').length,
  };
}
