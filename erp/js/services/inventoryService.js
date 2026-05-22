// ============================================================
// THE ANT BOX ERP — inventoryService.js
// Database queries & transactions for inventory items and logs
// ============================================================

import getSupabaseClient from './supabaseClient.js';

// ── Fetch Inventory Items ─────────────────────────────────────
export async function getInventoryItems({ search = '' } = {}) {
  const supabase = await getSupabaseClient();
  let query = supabase.from('inventory_items').select('*').order('name', { ascending: true });

  if (search) {
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── Get Single Item ───────────────────────────────────────────
export async function getInventoryItem(id) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// ── Create New Inventory Item ─────────────────────────────────
export async function createInventoryItem(payload) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      sku: payload.sku,
      name: payload.name,
      description: payload.description || '',
      quantity: Number(payload.quantity) || 0,
      price: Number(payload.price) || 0.00,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Update Inventory Item metadata ────────────────────────────
export async function updateInventoryItem(id, updates) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('inventory_items')
    .update({
      sku: updates.sku,
      name: updates.name,
      description: updates.description || '',
      price: Number(updates.price) || 0.00,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Fetch Stock Transactions ──────────────────────────────────
export async function getInventoryTransactions({ itemId = null } = {}) {
  const supabase = await getSupabaseClient();
  let query = supabase
    .from('inventory_transactions')
    .select(`
      *,
      item:inventory_items(sku, name),
      user:employees(id, full_name)
    `)
    .order('created_at', { ascending: false });

  if (itemId) query = query.eq('item_id', itemId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── Create Stock Adjustment Transaction ───────────────────────
export async function createInventoryTransaction({ itemId, transactionType, quantity, performedBy, reason }) {
  const supabase = await getSupabaseClient();

  // 1. Get current stock
  const { data: item, error: itemError } = await supabase
    .from('inventory_items')
    .select('quantity')
    .eq('id', itemId)
    .single();
  if (itemError) throw itemError;

  const currentQty = item.quantity;
  const changeQty = Number(quantity);
  if (isNaN(changeQty) || changeQty <= 0) throw new Error('Transaction quantity must be greater than 0.');

  const change = transactionType === 'stock_in' ? changeQty : -changeQty;
  const newQty = currentQty + change;
  if (newQty < 0) throw new Error('Insufficient stock for this transaction.');

  // 2. Insert transaction log
  const { data: txn, error: txnError } = await supabase
    .from('inventory_transactions')
    .insert({
      item_id: itemId,
      transaction_type: transactionType,
      quantity: changeQty,
      performed_by: performedBy,
      reason: reason || '',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (txnError) throw txnError;

  // 3. Update stock item quantity
  const { data: updatedItem, error: updateError } = await supabase
    .from('inventory_items')
    .update({ quantity: newQty, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .select()
    .single();
  if (updateError) throw updateError;

  return { transaction: txn, item: updatedItem };
}

// ── Get Inventory Stats ────────────────────────────────────────
export async function getInventoryStats() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('inventory_items').select('quantity, price');
  if (error) throw error;

  const totalSKUs = data.length;
  const totalItems = data.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const totalValue = data.reduce((sum, item) => sum + ((item.quantity || 0) * (Number(item.price) || 0)), 0);

  return {
    totalSKUs,
    totalItems,
    totalValue,
  };
}

// ── Subscribe to Inventory Realtime updates ───────────────────
export async function subscribeInventory(callback) {
  const supabase = await getSupabaseClient();
  return supabase
    .channel('inventory-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, callback)
    .subscribe();
}
