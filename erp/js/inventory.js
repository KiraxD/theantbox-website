// ============================================================
// THE ANT BOX ERP — inventory.js
// State management, live search, stock logs, adjustment modals
// ============================================================

import { bootPage } from './modules/authGuard.js';
import { initTheme, initSidebar, initLogout, initThemeToggle, initDropdowns, renderSkeletonRows, renderEmptyState, setLoading } from './modules/ui.js';
import { openModal, closeModal, populateForm, readForm, setupModalClosers } from './modules/modal.js';
import toast from './modules/toast.js';
import { validateForm, rules } from './modules/validators.js';
import { getInventoryItems, createInventoryItem, updateInventoryItem, getInventoryTransactions, createInventoryTransaction, getInventoryStats, subscribeInventory } from './services/inventoryService.js';

initTheme();
const ctx = await bootPage();
if (!ctx) throw new Error('Not authenticated');
initSidebar(); initLogout(); initThemeToggle(); initDropdowns(); setupModalClosers();

let allItems = [];
let editingItemId = null;
let searchQuery = '';

const isManager = ['super_admin', 'admin', 'hr', 'manager'].includes(ctx.profile.role);

// ── Role Restrictions ─────────────────────────────────────────
if (!isManager) {
  // Hide addition and modification entry points for interns/employees
  document.getElementById('btn-add-item')?.style?.setProperty('display', 'none');
}

// ── Load Data & Render ────────────────────────────────────────
async function loadInventory() {
  const tbody = document.getElementById('inventory-tbody');
  if (!tbody) return;

  renderSkeletonRows(tbody, 5, 7);

  try {
    // 1. Fetch stats
    const stats = await getInventoryStats();
    document.getElementById('stat-skus').textContent = stats.totalSKUs;
    document.getElementById('stat-quantity').textContent = stats.totalItems;
    document.getElementById('stat-value').textContent = `$${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // 2. Fetch inventory list
    allItems = await getInventoryItems({ search: searchQuery });

    if (!allItems.length) {
      tbody.innerHTML = '';
      renderEmptyState(tbody.closest('.table-container'), {
        title: 'No inventory items found',
        message: searchQuery ? `No matches for "${searchQuery}"` : 'Your stock list is currently empty.',
        action: isManager ? `<button class="btn btn-purple" onclick="document.getElementById('btn-add-item').click()">Add First Item</button>` : '',
      });
      return;
    }

    tbody.innerHTML = allItems.map(item => `
      <tr data-id="${item.id}">
        <td><code style="background:var(--line); padding:3px 6px; border-radius:4px; font-size:12px;">${item.sku}</code></td>
        <td style="font-weight: 500; color: var(--black);">${item.name}</td>
        <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.description || ''}">${item.description || '-'}</td>
        <td>
          <span style="font-weight: 600; color: ${item.quantity <= 3 ? 'var(--danger)' : 'inherit'}">
            ${item.quantity}
          </span>
          ${item.quantity <= 3 ? `<span class="badge badge-danger" style="margin-left:8px; font-size:10px;">Low Stock</span>` : ''}
        </td>
        <td>$${Number(item.price).toFixed(2)}</td>
        <td>$${(item.quantity * Number(item.price)).toFixed(2)}</td>
        <td style="text-align: right;">
          <div class="table-actions" style="justify-content: flex-end;">
            <button class="btn btn-sm btn-ghost btn-icon-sm" data-action="logs" data-id="${item.id}" title="Stock Log">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </button>
            ${isManager ? `
              <button class="btn btn-sm btn-ghost btn-icon-sm" data-action="adjust" data-id="${item.id}" title="Adjust Stock" style="color:var(--purple)">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              </button>
              <button class="btn btn-sm btn-ghost btn-icon-sm" data-action="edit" data-id="${item.id}" title="Edit Detail">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const { action, id } = btn.dataset;
        if (action === 'logs') openLogsModal(id);
        if (action === 'adjust') openAdjustModal(id);
        if (action === 'edit') openEditModal(id);
      });
    });

  } catch (err) {
    console.error('[Inventory Load Error]', err);
    toast.error('Failed to load inventory', err.message);
  }
}

// ── Modals Trigger ───────────────────────────────────────────
function openEditModal(id = null) {
  editingItemId = id;
  const title = document.getElementById('item-modal-title');
  const qtyField = document.getElementById('group-initial-qty');

  if (id) {
    const item = allItems.find(i => i.id === id);
    if (!item) return;

    if (title) title.textContent = 'Edit Item Detail';
    if (qtyField) qtyField.style.display = 'none'; // Hide initial quantity on edit

    populateForm('item-form', {
      sku: item.sku,
      name: item.name,
      description: item.description || '',
      price: item.price,
    });
  } else {
    if (title) title.textContent = 'Add Inventory Item';
    if (qtyField) qtyField.style.display = 'block';
    document.getElementById('item-form')?.reset();
  }

  openModal('item-modal');
}

function openAdjustModal(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  document.getElementById('adjust-item-id').value = id;
  document.getElementById('adjust-item-name').textContent = `${item.name} (${item.sku}) — Current Stock: ${item.quantity}`;
  document.getElementById('adjust-form').reset();
  openModal('adjust-modal');
}

async function openLogsModal(itemId = null) {
  const tbody = document.getElementById('logs-tbody');
  const title = document.getElementById('logs-modal-title');

  if (itemId) {
    const item = allItems.find(i => i.id === itemId);
    title.textContent = `Stock Log — ${item?.name || 'Item'}`;
  } else {
    title.textContent = 'Global Stock logs';
  }

  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Loading logs...</td></tr>`;
  openModal('logs-modal');

  try {
    const logs = await getInventoryTransactions({ itemId });
    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--muted);">No transactions recorded.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(log => {
      const typeBadge = log.transaction_type === 'stock_in' 
        ? `<span class="status active">Stock In</span>` 
        : `<span class="status review">Stock Out</span>`;

      return `
        <tr>
          <td style="font-size:12px; color:var(--muted);">${new Date(log.created_at).toLocaleString()}</td>
          <td><strong>${log.item?.name || '-'}</strong><br><small style="color:var(--muted);">${log.item?.sku || ''}</small></td>
          <td>${typeBadge}</td>
          <td style="font-weight:600;">${log.quantity}</td>
          <td>${log.user?.full_name || 'System'}</td>
          <td style="white-space:normal; font-size:13px;">${log.reason || '-'}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--danger);">Error loading logs: ${err.message}</td></tr>`;
  }
}

// ── Form Submits ──────────────────────────────────────────────
document.getElementById('item-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const valid = validateForm('item-form', {
    sku: [rules.required()],
    name: [rules.required()],
    price: [rules.required()]
  });
  if (!valid) return;

  const btn = e.target.querySelector('[type="submit"]');
  setLoading(btn, true);
  const data = readForm('item-form');

  try {
    if (editingItemId) {
      await updateInventoryItem(editingItemId, data);
      toast.success('Item updated successfully');
    } else {
      await createInventoryItem(data);
      toast.success('Item created successfully');
    }
    closeModal('item-modal');
    await loadInventory();
  } catch (err) {
    toast.error('Operation failed', err.message);
  } finally {
    setLoading(btn, false);
  }
});

document.getElementById('adjust-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const valid = validateForm('adjust-form', {
    quantity: [rules.required()],
    reason: [rules.required()]
  });
  if (!valid) return;

  const btn = e.target.querySelector('[type="submit"]');
  setLoading(btn, true);
  const data = readForm('adjust-form');

  try {
    await createInventoryTransaction({
      itemId: data.item_id,
      transactionType: data.transaction_type,
      quantity: Number(data.quantity),
      performedBy: ctx.profile.id,
      reason: data.reason
    });
    toast.success('Stock adjustment applied');
    closeModal('adjust-modal');
    await loadInventory();
  } catch (err) {
    toast.error('Adjustment failed', err.message);
  } finally {
    setLoading(btn, false);
  }
});

// ── Search & Filter ───────────────────────────────────────────
document.getElementById('item-search')?.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  loadInventory();
});

document.getElementById('btn-view-logs')?.addEventListener('click', () => openLogsModal(null));
document.getElementById('btn-add-item')?.addEventListener('click', () => openEditModal(null));

// ── Realtime Sync ─────────────────────────────────────────────
await subscribeInventory(() => loadInventory());

// ── Init ──────────────────────────────────────────────────────
await loadInventory();
