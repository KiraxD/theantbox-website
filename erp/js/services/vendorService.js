// ============================================================
// THE ANT BOX ERP — vendorService.js
// Vendor/supplier management, contacts, payment terms
// ============================================================

import getSupabaseClient from './supabaseClient.js';

// ── Get All Vendors ───────────────────────────────────────────
export async function getVendors({ page = 1, pageSize = 20, status = '', search = '' } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('vendors')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .range(from, to)
    .order('name');

  if (status) query = query.eq('status', status);
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to fetch vendors: ${error.message}`);
  return { data: data ?? [], count: count ?? 0, pages: Math.ceil((count ?? 0) / pageSize) };
}

// ── Get Single Vendor ─────────────────────────────────────────
export async function getVendor(vendorId) {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('vendors')
    .select(`
      *,
      contacts:vendor_contacts(*)
    `)
    .eq('id', vendorId)
    .single();

  if (error) throw new Error(`Failed to fetch vendor: ${error.message}`);
  return data;
}

// ── Create Vendor ─────────────────────────────────────────────
export async function createVendor(payload) {
  const supabase = await getSupabaseClient();

  const {
    name,
    email,
    phone,
    address,
    city,
    state,
    postal_code,
    country,
    gstin,
    pan_number,
    contact_person_name,
    contact_person_phone,
    website,
    payment_terms,
    credit_rating,
  } = payload;

  if (!name) throw new Error('Vendor name is required');

  const session = await supabase.auth.getSession();
  const currentUserId = session.data.session?.user.id;

  const { data, error } = await supabase
    .from('vendors')
    .insert({
      name,
      email,
      phone,
      address,
      city,
      state,
      postal_code,
      country,
      gstin,
      pan_number,
      contact_person_name,
      contact_person_phone,
      website,
      payment_terms,
      credit_rating,
      status: 'active',
      created_by: currentUserId,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create vendor: ${error.message}`);
  return data;
}

// ── Update Vendor ─────────────────────────────────────────────
export async function updateVendor(vendorId, updates) {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('vendors')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', vendorId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update vendor: ${error.message}`);
  return data;
}

// ── Deactivate/Delete Vendor (soft delete) ────────────────────
export async function deleteVendor(vendorId) {
  const supabase = await getSupabaseClient();

  const { error } = await supabase
    .from('vendors')
    .update({
      status: 'inactive',
      deleted_at: new Date().toISOString(),
    })
    .eq('id', vendorId);

  if (error) throw new Error(`Failed to delete vendor: ${error.message}`);
}

// ── Get Vendor Contacts ───────────────────────────────────────
export async function getVendorContacts(vendorId) {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('vendor_contacts')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at');

  if (error) throw new Error(`Failed to fetch vendor contacts: ${error.message}`);
  return data ?? [];
}

// ── Add Vendor Contact ────────────────────────────────────────
export async function addVendorContact(vendorId, payload) {
  const supabase = await getSupabaseClient();

  const { name, email, phone, designation, is_primary = false } = payload;

  if (!name) throw new Error('Contact name is required');

  // If marking as primary, unmark others
  if (is_primary) {
    await supabase
      .from('vendor_contacts')
      .update({ is_primary: false })
      .eq('vendor_id', vendorId);
  }

  const { data, error } = await supabase
    .from('vendor_contacts')
    .insert({
      vendor_id: vendorId,
      name,
      email,
      phone,
      designation,
      is_primary,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add vendor contact: ${error.message}`);
  return data;
}

// ── Update Vendor Contact ─────────────────────────────────────
export async function updateVendorContact(contactId, updates) {
  const supabase = await getSupabaseClient();

  // If marking as primary, get vendor_id first
  if (updates.is_primary) {
    const { data: contact } = await supabase
      .from('vendor_contacts')
      .select('vendor_id')
      .eq('id', contactId)
      .single();

    if (contact) {
      await supabase
        .from('vendor_contacts')
        .update({ is_primary: false })
        .eq('vendor_id', contact.vendor_id);
    }
  }

  const { data, error } = await supabase
    .from('vendor_contacts')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update vendor contact: ${error.message}`);
  return data;
}

// ── Delete Vendor Contact ─────────────────────────────────────
export async function deleteVendorContact(contactId) {
  const supabase = await getSupabaseClient();

  const { error } = await supabase
    .from('vendor_contacts')
    .delete()
    .eq('id', contactId);

  if (error) throw new Error(`Failed to delete vendor contact: ${error.message}`);
}

// ── Get Vendor Statistics ─────────────────────────────────────
export async function getVendorStats() {
  const supabase = await getSupabaseClient();

  const { data: vendors, error: vendorsError } = await supabase
    .from('vendors')
    .select('status');

  if (vendorsError) throw new Error(`Failed to fetch vendors: ${vendorsError.message}`);

  const total = vendors.length;
  const active = vendors.filter(v => v.status === 'active').length;
  const inactive = vendors.filter(v => v.status === 'inactive').length;
  const blocked = vendors.filter(v => v.status === 'blocked').length;

  return { total, active, inactive, blocked };
}
