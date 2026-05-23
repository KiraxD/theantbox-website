// ============================================================
// THE ANT BOX ERP — salesService.js
// Quotations, Sales Orders, Purchase Orders, General Ledger
// ============================================================

import getSupabaseClient from './supabaseClient.js';

// ── QUOTATIONS ───────────────────────────────────────────────

export async function getQuotations({ page = 1, pageSize = 20, status = '', search = '' } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('quotations')
    .select(`
      *,
      client:clients(id, name, email),
      creator:employees(id, full_name)
    `, { count: 'exact' })
    .is('deleted_at', null)
    .range(from, to)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (search) query = query.or(`quotation_number.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch quotations: ${error.message}`);
  return { data: data ?? [], count: count ?? 0, pages: Math.ceil((count ?? 0) / pageSize) };
}

export async function getQuotation(id) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('quotations')
    .select(`
      *,
      client:clients(*),
      creator:employees(full_name),
      items:quotation_items(*)
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to fetch quotation: ${error.message}`);
  return data;
}

export async function createQuotation(payload, items = []) {
  const supabase = await getSupabaseClient();
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user.id;

  // Insert quotation
  const { data: quote, error } = await supabase
    .from('quotations')
    .insert({
      quotation_number: payload.quotation_number || `QT-${Date.now().toString().slice(-6)}`,
      client_id: payload.client_id,
      valid_until: payload.valid_until,
      subtotal: payload.subtotal || 0,
      tax_amount: payload.tax_amount || 0,
      total_amount: payload.total_amount || 0,
      status: payload.status || 'draft',
      created_by: userId,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create quotation: ${error.message}`);

  // Insert items
  if (items.length > 0) {
    const itemsPayload = items.map(item => ({
      quotation_id: quote.id,
      item_description: item.item_description,
      quantity: parseInt(item.quantity),
      unit_price: parseFloat(item.unit_price),
      total_price: parseInt(item.quantity) * parseFloat(item.unit_price)
    }));

    const { error: itemsError } = await supabase
      .from('quotation_items')
      .insert(itemsPayload);

    if (itemsError) throw new Error(`Failed to create quotation items: ${itemsError.message}`);
  }

  return quote;
}

export async function updateQuotationStatus(id, status) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('quotations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update quotation: ${error.message}`);
  return data;
}

// ── SALES ORDERS ─────────────────────────────────────────────

export async function getSalesOrders({ page = 1, pageSize = 20, status = '', search = '' } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('sales_orders')
    .select(`
      *,
      client:clients(id, name, email),
      creator:employees(id, full_name)
    `, { count: 'exact' })
    .is('deleted_at', null)
    .range(from, to)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (search) query = query.or(`order_number.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch sales orders: ${error.message}`);
  return { data: data ?? [], count: count ?? 0, pages: Math.ceil((count ?? 0) / pageSize) };
}

export async function getSalesOrder(id) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('sales_orders')
    .select(`
      *,
      client:clients(*),
      creator:employees(full_name),
      items:sales_order_items(*)
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to fetch sales order: ${error.message}`);
  return data;
}

export async function createSalesOrder(payload, items = []) {
  const supabase = await getSupabaseClient();
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user.id;

  const { data: order, error } = await supabase
    .from('sales_orders')
    .insert({
      order_number: payload.order_number || `SO-${Date.now().toString().slice(-6)}`,
      client_id: payload.client_id,
      order_date: payload.order_date || new Date().toISOString().split('T')[0],
      subtotal: payload.subtotal || 0,
      tax_amount: payload.tax_amount || 0,
      total_amount: payload.total_amount || 0,
      status: payload.status || 'pending',
      created_by: userId,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create sales order: ${error.message}`);

  if (items.length > 0) {
    const itemsPayload = items.map(item => ({
      sales_order_id: order.id,
      item_description: item.item_description,
      quantity: parseInt(item.quantity),
      unit_price: parseFloat(item.unit_price),
      total_price: parseInt(item.quantity) * parseFloat(item.unit_price)
    }));

    const { error: itemsError } = await supabase
      .from('sales_order_items')
      .insert(itemsPayload);

    if (itemsError) throw new Error(`Failed to create sales order items: ${itemsError.message}`);
  }

  // Auto ledger log if approved/fulfilled immediately
  if (order.status === 'approved' || order.status === 'fulfilled') {
    await logLedgerEntry({
      entry_type: 'credit',
      account_name: 'Sales Revenue',
      amount: order.total_amount,
      description: `Revenue from Sales Order ${order.order_number}`,
      reference_type: 'sales_orders',
      reference_id: order.id
    });
  }

  return order;
}

export async function updateSalesOrderStatus(id, status) {
  const supabase = await getSupabaseClient();
  
  const { data: order, error } = await supabase
    .from('sales_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update sales order status: ${error.message}`);

  // If newly approved/fulfilled, write to ledger
  if (status === 'approved' || status === 'fulfilled') {
    try {
      // Check if entry already exists to prevent duplicate entries
      const { data: existing } = await supabase
        .from('general_ledger')
        .select('id')
        .eq('reference_id', id)
        .eq('reference_type', 'sales_orders')
        .limit(1);

      if (!existing || existing.length === 0) {
        await logLedgerEntry({
          entry_type: 'credit',
          account_name: 'Sales Revenue',
          amount: order.total_amount,
          description: `Revenue from Sales Order ${order.order_number}`,
          reference_type: 'sales_orders',
          reference_id: order.id
        });
      }
    } catch (e) {
      console.error('Failed to log ledger entry: ', e.message);
    }
  }

  return order;
}

// ── PURCHASE ORDERS ──────────────────────────────────────────

export async function getPurchaseOrders({ page = 1, pageSize = 20, status = '', search = '' } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('purchase_orders')
    .select(`
      *,
      vendor:vendors(id, name, email),
      creator:employees(id, full_name)
    `, { count: 'exact' })
    .is('deleted_at', null)
    .range(from, to)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (search) query = query.or(`po_number.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch purchase orders: ${error.message}`);
  return { data: data ?? [], count: count ?? 0, pages: Math.ceil((count ?? 0) / pageSize) };
}

export async function getPurchaseOrder(id) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      vendor:vendors(*),
      creator:employees(full_name),
      items:purchase_order_items(*)
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to fetch purchase order: ${error.message}`);
  return data;
}

export async function createPurchaseOrder(payload, items = []) {
  const supabase = await getSupabaseClient();
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user.id;

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .insert({
      po_number: payload.po_number || `PO-${Date.now().toString().slice(-6)}`,
      vendor_id: payload.vendor_id,
      order_date: payload.order_date || new Date().toISOString().split('T')[0],
      subtotal: payload.subtotal || 0,
      tax_amount: payload.tax_amount || 0,
      total_amount: payload.total_amount || 0,
      status: payload.status || 'draft',
      created_by: userId,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create purchase order: ${error.message}`);

  if (items.length > 0) {
    const itemsPayload = items.map(item => ({
      purchase_order_id: po.id,
      item_description: item.item_description,
      quantity: parseInt(item.quantity),
      unit_price: parseFloat(item.unit_price),
      total_price: parseInt(item.quantity) * parseFloat(item.unit_price)
    }));

    const { error: itemsError } = await supabase
      .from('purchase_order_items')
      .insert(itemsPayload);

    if (itemsError) throw new Error(`Failed to create purchase order items: ${itemsError.message}`);
  }

  // Auto ledger log if ordered immediately
  if (po.status === 'ordered' || po.status === 'received') {
    await logLedgerEntry({
      entry_type: 'debit',
      account_name: 'Procurement Expense',
      amount: po.total_amount,
      description: `Expense from Purchase Order ${po.po_number}`,
      reference_type: 'purchase_orders',
      reference_id: po.id
    });
  }

  return po;
}

export async function updatePurchaseOrderStatus(id, status) {
  const supabase = await getSupabaseClient();
  
  const { data: po, error } = await supabase
    .from('purchase_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update purchase order status: ${error.message}`);

  if (status === 'ordered' || status === 'received') {
    try {
      const { data: existing } = await supabase
        .from('general_ledger')
        .select('id')
        .eq('reference_id', id)
        .eq('reference_type', 'purchase_orders')
        .limit(1);

      if (!existing || existing.length === 0) {
        await logLedgerEntry({
          entry_type: 'debit',
          account_name: 'Procurement Expense',
          amount: po.total_amount,
          description: `Expense from Purchase Order ${po.po_number}`,
          reference_type: 'purchase_orders',
          reference_id: po.id
        });
      }
    } catch (e) {
      console.error('Failed to log ledger entry: ', e.message);
    }
  }

  return po;
}

// ── GENERAL LEDGER ────────────────────────────────────────────

export async function getLedgerEntries({ page = 1, pageSize = 20, type = '', search = '' } = {}) {
  const supabase = await getSupabaseClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('general_ledger')
    .select(`
      *,
      creator:employees(id, full_name)
    `, { count: 'exact' })
    .range(from, to)
    .order('transaction_date', { ascending: false });

  if (type) query = query.eq('entry_type', type);
  if (search) query = query.or(`account_name.ilike.%${search}%,description.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch ledger: ${error.message}`);
  return { data: data ?? [], count: count ?? 0, pages: Math.ceil((count ?? 0) / pageSize) };
}

export async function logLedgerEntry(payload) {
  const supabase = await getSupabaseClient();
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user.id;

  const { data, error } = await supabase
    .from('general_ledger')
    .insert({
      transaction_date: payload.transaction_date || new Date().toISOString().split('T')[0],
      entry_type: payload.entry_type,
      account_name: payload.account_name,
      amount: parseFloat(payload.amount),
      description: payload.description,
      reference_type: payload.reference_type || null,
      reference_id: payload.reference_id || null,
      created_by: userId,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to log ledger entry: ${error.message}`);
  return data;
}

export async function getFinancialSummary() {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('general_ledger')
    .select('entry_type, amount');

  if (error) throw new Error(`Failed to fetch financial summary: ${error.message}`);

  const totalCredits = data
    .filter(e => e.entry_type === 'credit')
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);

  const totalDebits = data
    .filter(e => e.entry_type === 'debit')
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);

  return {
    revenue: totalCredits,
    expenses: totalDebits,
    net_profit: totalCredits - totalDebits,
  };
}
