// ============================================================
// THE ANT BOX ERP — invoiceService.js
// Database CRUD operations for invoices and invoice items
// ============================================================

import getSupabaseClient from './supabaseClient.js';

// ── Fetch Invoices ───────────────────────────────────────────
export async function getInvoices({ status = '', search = '' } = {}) {
  const supabase = await getSupabaseClient();
  let query = supabase
    .from('invoices')
    .select(`
      *,
      creator:employees(id, full_name)
    `)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (search) {
    query = query.or(`client_name.ilike.%${search}%,invoice_number.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── Get Single Invoice (with Line Items) ──────────────────────
export async function getInvoice(id) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      creator:employees(id, full_name, email),
      items:invoice_items(*)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// ── Create Invoice with Line Items (Transactional helper) ─────
export async function createInvoice(invoiceData, itemsList) {
  const supabase = await getSupabaseClient();

  // Validate number of items
  if (!itemsList || itemsList.length === 0) {
    throw new Error('An invoice must have at least one line item.');
  }

  // Calculate values
  const subtotal = itemsList.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    return sum + (qty * price);
  }, 0);

  const tax = Number(invoiceData.tax) || 0;
  const discount = Number(invoiceData.discount) || 0;
  const total = subtotal + tax - discount;

  // Generate unique invoice number if not provided
  const invoiceNumber = invoiceData.invoice_number || `INV-${Date.now().toString().slice(-6)}`;

  // 1. Insert Invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      client_name: invoiceData.client_name,
      client_email: invoiceData.client_email || null,
      issued_date: invoiceData.issued_date || new Date().toISOString().split('T')[0],
      due_date: invoiceData.due_date,
      status: invoiceData.status || 'draft',
      subtotal: Number(subtotal.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      total: Number(total.toFixed(2)),
      created_by: invoiceData.created_by,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (invoiceError) throw invoiceError;

  // 2. Map line items with new invoice ID and calculate total for each
  const mappedItems = itemsList.map(item => {
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.unit_price) || 0;
    return {
      invoice_id: invoice.id,
      description: item.description || 'Line Item',
      quantity: qty,
      unit_price: Number(unitPrice.toFixed(2)),
      amount: Number((qty * unitPrice).toFixed(2)),
    };
  });

  // 3. Insert Line Items
  const { error: itemsError } = await supabase
    .from('invoice_items')
    .insert(mappedItems);

  if (itemsError) {
    // Rollback created invoice if line items fail to insert
    await supabase.from('invoices').delete().eq('id', invoice.id);
    throw itemsError;
  }

  return invoice;
}

// ── Update Invoice Status ────────────────────────────────────
export async function updateInvoiceStatus(id, status) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('invoices')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Delete Invoice ───────────────────────────────────────────
export async function deleteInvoice(id) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) throw error;
}

// ── Get Invoice Stats ─────────────────────────────────────────
export async function getInvoiceStats() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('invoices').select('status, total');
  if (error) throw error;

  const totalInvoiced = data.reduce((sum, inv) => sum + Number(inv.total), 0);
  const paidCount = data.filter(inv => inv.status === 'paid').length;
  const paidAmount = data.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + Number(inv.total), 0);
  const pendingCount = data.filter(inv => inv.status === 'sent').length;
  const pendingAmount = data.filter(inv => inv.status === 'sent').reduce((sum, inv) => sum + Number(inv.total), 0);

  return {
    totalCount: data.length,
    totalInvoiced,
    paidCount,
    paidAmount,
    pendingCount,
    pendingAmount,
  };
}

// ── Subscribe to Invoice updates ─────────────────────────────
export async function subscribeInvoices(callback) {
  const supabase = await getSupabaseClient();
  return supabase
    .channel('invoice-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, callback)
    .subscribe();
}
