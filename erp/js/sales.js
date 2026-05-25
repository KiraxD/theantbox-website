// ============================================================
// THE ANT BOX ERP — sales.js
// Quotations, Sales Orders, Purchase Orders, Vendors, General Ledger
// ============================================================

import { bootPage } from './modules/authGuard.js';
import {
  initTheme,
  initSidebar,
  initLogout,
  initThemeToggle,
  initDropdowns,
  statusBadge,
  formatDate,
  debounce,
  renderSkeletonRows,
  renderEmptyState,
} from './modules/ui.js';
import { openModal, closeModal, setupModalClosers, confirm } from './modules/modal.js';
import toast from './modules/toast.js';

import * as salesService from './services/salesService.js';
import * as vendorService from './services/vendorService.js';
import * as crmService from './services/crmService.js';

initTheme();
const ctx = await bootPage({ requiredRoles: ['super_admin', 'admin', 'manager', 'accountant', 'employee', 'intern'] });
if (!ctx) throw new Error('Not authenticated');
initSidebar();
initLogout();
initThemeToggle();
initDropdowns();
setupModalClosers();

// ── State ────────────────────────────────────────────────────
let state = {
  activeTab: 'quotations-panel',
  quotes: { page: 1, search: '', status: '', data: [] },
  salesOrders: { page: 1, search: '', status: '', data: [] },
  purchaseOrders: { page: 1, search: '', status: '', data: [] },
  vendors: { page: 1, search: '', status: '', data: [] },
  ledger: { page: 1, search: '', type: '', data: [] },
  clientsCache: [],
  vendorsCache: [],
};

// ── DOM References ───────────────────────────────────────────
const actionContainer = document.getElementById('page-action-container');

// Forms & Tables
const quoteForm = document.getElementById('quote-form');
const soForm = document.getElementById('so-form');
const poForm = document.getElementById('po-form');
const vendorForm = document.getElementById('vendor-form');
const ledgerForm = document.getElementById('ledger-form');

const quoteItemsTable = document.getElementById('quote-items-table').querySelector('tbody');
const soItemsTable = document.getElementById('so-items-table').querySelector('tbody');
const poItemsTable = document.getElementById('po-items-table').querySelector('tbody');

// ── Tab Management ───────────────────────────────────────────
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.tab;
      state.activeTab = target;

      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === target);
      });

      renderActionButtons();
      loadTabSpecificData(target);
    });
  });
}

function renderActionButtons() {
  actionContainer.innerHTML = '';
  
  if (state.activeTab === 'quotations-panel') {
    actionContainer.innerHTML = `
      <button class="btn btn-purple" id="btn-create-quote">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Quotation
      </button>
    `;
    document.getElementById('btn-create-quote').addEventListener('click', () => openQuotationModal());
  } else if (state.activeTab === 'salesorders-panel') {
    actionContainer.innerHTML = `
      <button class="btn btn-purple" id="btn-create-so">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Sales Order
      </button>
    `;
    document.getElementById('btn-create-so').addEventListener('click', () => openSalesOrderModal());
  } else if (state.activeTab === 'purchaseorders-panel') {
    actionContainer.innerHTML = `
      <button class="btn btn-purple" id="btn-create-po">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Purchase Order
      </button>
    `;
    document.getElementById('btn-create-po').addEventListener('click', () => openPurchaseOrderModal());
  } else if (state.activeTab === 'vendors-panel') {
    actionContainer.innerHTML = `
      <button class="btn btn-purple" id="btn-add-vendor">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Vendor
      </button>
    `;
    document.getElementById('btn-add-vendor').addEventListener('click', () => openVendorModal());
  } else if (state.activeTab === 'ledger-panel') {
    const isAccountantOrAdmin = ['super_admin', 'admin', 'accountant'].includes(ctx.profile.role);
    if (isAccountantOrAdmin) {
      actionContainer.innerHTML = `
        <button class="btn btn-purple" id="btn-add-ledger">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Log Ledger Entry
        </button>
      `;
      document.getElementById('btn-add-ledger').addEventListener('click', () => openLedgerModal());
    }
  }
}

async function loadTabSpecificData(tabId) {
  if (tabId === 'quotations-panel') loadQuotations();
  else if (tabId === 'salesorders-panel') loadSalesOrders();
  else if (tabId === 'purchaseorders-panel') loadPurchaseOrders();
  else if (tabId === 'vendors-panel') loadVendors();
  else if (tabId === 'ledger-panel') loadLedgerData();
}

// ── Cache Loading ────────────────────────────────────────────
async function ensureClientsCache() {
  if (state.clientsCache.length === 0) {
    try {
      const res = await crmService.getClients({ page: 1, pageSize: 1000 });
      state.clientsCache = res.data;
    } catch (err) {
      console.error(err);
    }
  }
}

async function ensureVendorsCache() {
  if (state.vendorsCache.length === 0) {
    try {
      const res = await vendorService.getVendors({ page: 1, pageSize: 1000 });
      state.vendorsCache = res.data;
    } catch (err) {
      console.error(err);
    }
  }
}

// ── QUOTATIONS ───────────────────────────────────────────────
async function loadQuotations() {
  const tbody = document.getElementById('quotes-tbody');
  const pagEl = document.getElementById('quotes-pagination');
  renderSkeletonRows(tbody, 5, 7);

  try {
    const res = await salesService.getQuotations({
      page: state.quotes.page,
      search: state.quotes.search,
      status: state.quotes.status,
    });
    tbody.innerHTML = '';
    document.getElementById('quotes-count').textContent = `${res.count} Quotations`;

    if (res.data.length === 0) {
      renderEmptyState(tbody.closest('.table-container'), {
        title: 'No quotations found',
        message: 'Create a new quotation for a client.',
        action: `<button class="btn btn-purple" id="btn-empty-quote">Create Quotation</button>`,
      });
      document.getElementById('btn-empty-quote')?.addEventListener('click', () => openQuotationModal());
      pagEl.innerHTML = '';
      return;
    }

    res.data.forEach(q => {
      const tr = document.createElement('tr');
      const formattedTotal = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(q.total_amount);
      const isAccepted = q.status === 'accepted';
      const isDeclinedOrExpired = ['declined', 'expired'].includes(q.status);

      tr.innerHTML = `
        <td><strong class="text-purple">${q.quotation_number}</strong></td>
        <td>${q.client ? q.client.name : 'Unknown Client'}</td>
        <td>${formatDate(q.valid_until)}</td>
        <td><strong>${formattedTotal}</strong></td>
        <td>${statusBadge(q.status)}</td>
        <td>${q.creator ? q.creator.full_name : 'System'}</td>
        <td style="text-align: right;">
          <button class="btn btn-ghost btn-sm btn-view-quote" data-id="${q.id}">Details</button>
          ${!isAccepted && !isDeclinedOrExpired ? `
            <select class="select select-sm status-update-select" data-id="${q.id}" data-type="quote" style="width: 100px; display:inline-block; margin-left: 8px;">
              <option value="draft" ${q.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="sent" ${q.status === 'sent' ? 'selected' : ''}>Sent</option>
              <option value="accepted" ${q.status === 'accepted' ? 'selected' : ''}>Accepted</option>
              <option value="declined" ${q.status === 'declined' ? 'selected' : ''}>Declined</option>
            </select>
          ` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });

    setupPagination(pagEl, res.pages, state.quotes.page, p => {
      state.quotes.page = p;
      loadQuotations();
    });

    tbody.querySelectorAll('.btn-view-quote').forEach(btn => {
      btn.addEventListener('click', () => viewTransactionDetails('quote', btn.dataset.id));
    });

    tbody.querySelectorAll('.status-update-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const id = sel.dataset.id;
        const newStatus = e.target.value;
        try {
          await salesService.updateQuotationStatus(id, newStatus);
          toast.success('Status updated successfully');
          loadQuotations();
        } catch (err) {
          toast.error('Failed to update status', err.message);
        }
      });
    });

  } catch (err) {
    toast.error('Quotation load failed', err.message);
  }
}

async function openQuotationModal() {
  await ensureClientsCache();
  const select = document.getElementById('quote_client');
  select.innerHTML = '<option value="">Select a client</option>' + 
    state.clientsCache.map(c => `<option value="${c.id}">${c.name} (${c.email || 'No Email'})</option>`).join('');

  quoteForm.reset();
  quoteItemsTable.innerHTML = '';
  document.getElementById('quote-calc-subtotal').textContent = '₹0.00';
  document.getElementById('quote-calc-tax').textContent = '₹0.00';
  document.getElementById('quote-calc-total').textContent = '₹0.00';
  
  // Set default date to today + 30 days
  const validDate = new Date();
  validDate.setDate(validDate.getDate() + 30);
  document.getElementById('quote_valid_until').value = validDate.toISOString().split('T')[0];

  addQuoteItemRow(); // start with one line
  openModal('quote-modal');
}

function addQuoteItemRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="input item-desc" placeholder="Item description/service name" required></td>
    <td><input type="number" class="input item-qty" min="1" value="1" required style="width: 80px;"></td>
    <td><input type="number" class="input item-price" min="0" step="0.01" value="0.00" required style="width: 120px;"></td>
    <td><strong class="item-line-total">₹0.00</strong></td>
    <td style="text-align: center;"><button type="button" class="btn btn-ghost btn-icon btn-remove-row" style="color:var(--danger);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>
  `;

  const qtyInput = tr.querySelector('.item-qty');
  const priceInput = tr.querySelector('.item-price');
  
  const updateRowTotal = () => {
    const qty = parseInt(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    tr.querySelector('.item-line-total').textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(qty * price);
    calculateQuoteTotals();
  };

  qtyInput.addEventListener('input', updateRowTotal);
  priceInput.addEventListener('input', updateRowTotal);
  tr.querySelector('.btn-remove-row').addEventListener('click', () => {
    tr.remove();
    calculateQuoteTotals();
  });

  quoteItemsTable.appendChild(tr);
  calculateQuoteTotals();
}

function calculateQuoteTotals() {
  let subtotal = 0;
  quoteItemsTable.querySelectorAll('tr').forEach(tr => {
    const qty = parseInt(tr.querySelector('.item-qty').value) || 0;
    const price = parseFloat(tr.querySelector('.item-price').value) || 0;
    subtotal += qty * price;
  });

  const tax = subtotal * 0.18; // 18% GST
  const total = subtotal + tax;

  const f = val => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
  document.getElementById('quote-calc-subtotal').textContent = f(subtotal);
  document.getElementById('quote-calc-tax').textContent = f(tax);
  document.getElementById('quote-calc-total').textContent = f(total);
}

// ── SALES ORDERS ─────────────────────────────────────────────
async function loadSalesOrders() {
  const tbody = document.getElementById('so-tbody');
  const pagEl = document.getElementById('so-pagination');
  renderSkeletonRows(tbody, 5, 7);

  try {
    const res = await salesService.getSalesOrders({
      page: state.salesOrders.page,
      search: state.salesOrders.search,
      status: state.salesOrders.status,
    });
    tbody.innerHTML = '';
    document.getElementById('so-count').textContent = `${res.count} Orders`;

    if (res.data.length === 0) {
      renderEmptyState(tbody.closest('.table-container'), {
        title: 'No sales orders found',
        message: 'Create a new sales order.',
        action: `<button class="btn btn-purple" id="btn-empty-so">Create Sales Order</button>`,
      });
      document.getElementById('btn-empty-so')?.addEventListener('click', () => openSalesOrderModal());
      pagEl.innerHTML = '';
      return;
    }

    res.data.forEach(order => {
      const tr = document.createElement('tr');
      const formattedTotal = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.total_amount);
      const isLocked = ['fulfilled', 'cancelled'].includes(order.status);

      tr.innerHTML = `
        <td><strong class="text-purple">${order.order_number}</strong></td>
        <td>${order.client ? order.client.name : 'Unknown Client'}</td>
        <td>${formatDate(order.order_date)}</td>
        <td><strong>${formattedTotal}</strong></td>
        <td>${statusBadge(order.status)}</td>
        <td>${order.creator ? order.creator.full_name : 'System'}</td>
        <td style="text-align: right;">
          <button class="btn btn-ghost btn-sm btn-view-so" data-id="${order.id}">Details</button>
          ${!isLocked ? `
            <select class="select select-sm status-update-select" data-id="${order.id}" data-type="so" style="width: 100px; display:inline-block; margin-left: 8px;">
              <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="approved" ${order.status === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="fulfilled" ${order.status === 'fulfilled' ? 'selected' : ''}>Fulfilled</option>
              <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          ` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });

    setupPagination(pagEl, res.pages, state.salesOrders.page, p => {
      state.salesOrders.page = p;
      loadSalesOrders();
    });

    tbody.querySelectorAll('.btn-view-so').forEach(btn => {
      btn.addEventListener('click', () => viewTransactionDetails('so', btn.dataset.id));
    });

    tbody.querySelectorAll('.status-update-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const id = sel.dataset.id;
        const newStatus = e.target.value;
        try {
          await salesService.updateSalesOrderStatus(id, newStatus);
          toast.success('Status updated successfully');
          loadSalesOrders();
        } catch (err) {
          toast.error('Failed to update status', err.message);
        }
      });
    });

  } catch (err) {
    toast.error('Sales order load failed', err.message);
  }
}

async function openSalesOrderModal() {
  await ensureClientsCache();
  const select = document.getElementById('so_client');
  select.innerHTML = '<option value="">Select a client</option>' + 
    state.clientsCache.map(c => `<option value="${c.id}">${c.name} (${c.email || 'No Email'})</option>`).join('');

  soForm.reset();
  soItemsTable.innerHTML = '';
  document.getElementById('so-calc-subtotal').textContent = '₹0.00';
  document.getElementById('so-calc-tax').textContent = '₹0.00';
  document.getElementById('so-calc-total').textContent = '₹0.00';

  document.getElementById('so_date').value = new Date().toISOString().split('T')[0];

  addSalesOrderItemRow();
  openModal('so-modal');
}

function addSalesOrderItemRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="input item-desc" placeholder="Item description" required></td>
    <td><input type="number" class="input item-qty" min="1" value="1" required style="width: 80px;"></td>
    <td><input type="number" class="input item-price" min="0" step="0.01" value="0.00" required style="width: 120px;"></td>
    <td><strong class="item-line-total">₹0.00</strong></td>
    <td style="text-align: center;"><button type="button" class="btn btn-ghost btn-icon btn-remove-row" style="color:var(--danger);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>
  `;

  const qtyInput = tr.querySelector('.item-qty');
  const priceInput = tr.querySelector('.item-price');
  
  const updateRowTotal = () => {
    const qty = parseInt(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    tr.querySelector('.item-line-total').textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(qty * price);
    calculateSalesOrderTotals();
  };

  qtyInput.addEventListener('input', updateRowTotal);
  priceInput.addEventListener('input', updateRowTotal);
  tr.querySelector('.btn-remove-row').addEventListener('click', () => {
    tr.remove();
    calculateSalesOrderTotals();
  });

  soItemsTable.appendChild(tr);
  calculateSalesOrderTotals();
}

function calculateSalesOrderTotals() {
  let subtotal = 0;
  soItemsTable.querySelectorAll('tr').forEach(tr => {
    const qty = parseInt(tr.querySelector('.item-qty').value) || 0;
    const price = parseFloat(tr.querySelector('.item-price').value) || 0;
    subtotal += qty * price;
  });

  const tax = subtotal * 0.18; // 18% GST
  const total = subtotal + tax;

  const f = val => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
  document.getElementById('so-calc-subtotal').textContent = f(subtotal);
  document.getElementById('so-calc-tax').textContent = f(tax);
  document.getElementById('so-calc-total').textContent = f(total);
}

// ── PURCHASE ORDERS ──────────────────────────────────────────
async function loadPurchaseOrders() {
  const tbody = document.getElementById('po-tbody');
  const pagEl = document.getElementById('po-pagination');
  renderSkeletonRows(tbody, 5, 7);

  try {
    const res = await salesService.getPurchaseOrders({
      page: state.purchaseOrders.page,
      search: state.purchaseOrders.search,
      status: state.purchaseOrders.status,
    });
    tbody.innerHTML = '';
    document.getElementById('po-count').textContent = `${res.count} POs`;

    if (res.data.length === 0) {
      renderEmptyState(tbody.closest('.table-container'), {
        title: 'No purchase orders found',
        message: 'Create a new purchase order.',
        action: `<button class="btn btn-purple" id="btn-empty-po">Create Purchase Order</button>`,
      });
      document.getElementById('btn-empty-po')?.addEventListener('click', () => openPurchaseOrderModal());
      pagEl.innerHTML = '';
      return;
    }

    res.data.forEach(po => {
      const tr = document.createElement('tr');
      const formattedTotal = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(po.total_amount);
      const isLocked = ['received', 'cancelled'].includes(po.status);

      tr.innerHTML = `
        <td><strong class="text-purple">${po.po_number}</strong></td>
        <td>${po.vendor ? po.vendor.name : 'Unknown Vendor'}</td>
        <td>${formatDate(po.order_date)}</td>
        <td><strong>${formattedTotal}</strong></td>
        <td>${statusBadge(po.status)}</td>
        <td>${po.creator ? po.creator.full_name : 'System'}</td>
        <td style="text-align: right;">
          <button class="btn btn-ghost btn-sm btn-view-po" data-id="${po.id}">Details</button>
          ${!isLocked ? `
            <select class="select select-sm status-update-select" data-id="${po.id}" data-type="po" style="width: 100px; display:inline-block; margin-left: 8px;">
              <option value="draft" ${po.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="ordered" ${po.status === 'ordered' ? 'selected' : ''}>Ordered</option>
              <option value="received" ${po.status === 'received' ? 'selected' : ''}>Received</option>
              <option value="cancelled" ${po.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          ` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });

    setupPagination(pagEl, res.pages, state.purchaseOrders.page, p => {
      state.purchaseOrders.page = p;
      loadPurchaseOrders();
    });

    tbody.querySelectorAll('.btn-view-po').forEach(btn => {
      btn.addEventListener('click', () => viewTransactionDetails('po', btn.dataset.id));
    });

    tbody.querySelectorAll('.status-update-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const id = sel.dataset.id;
        const newStatus = e.target.value;
        try {
          await salesService.updatePurchaseOrderStatus(id, newStatus);
          toast.success('Status updated successfully');
          loadPurchaseOrders();
        } catch (err) {
          toast.error('Failed to update status', err.message);
        }
      });
    });

  } catch (err) {
    toast.error('Purchase order load failed', err.message);
  }
}

async function openPurchaseOrderModal() {
  await ensureVendorsCache();
  const select = document.getElementById('po_vendor');
  select.innerHTML = '<option value="">Select a vendor</option>' + 
    state.vendorsCache.map(v => `<option value="${v.id}">${v.name} (${v.contact_person_name || 'No Contact'})</option>`).join('');

  poForm.reset();
  poItemsTable.innerHTML = '';
  document.getElementById('po-calc-subtotal').textContent = '₹0.00';
  document.getElementById('po-calc-tax').textContent = '₹0.00';
  document.getElementById('po-calc-total').textContent = '₹0.00';

  document.getElementById('po_date').value = new Date().toISOString().split('T')[0];

  addPurchaseOrderItemRow();
  openModal('po-modal');
}

function addPurchaseOrderItemRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="input item-desc" placeholder="Item description" required></td>
    <td><input type="number" class="input item-qty" min="1" value="1" required style="width: 80px;"></td>
    <td><input type="number" class="input item-price" min="0" step="0.01" value="0.00" required style="width: 120px;"></td>
    <td><strong class="item-line-total">₹0.00</strong></td>
    <td style="text-align: center;"><button type="button" class="btn btn-ghost btn-icon btn-remove-row" style="color:var(--danger);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>
  `;

  const qtyInput = tr.querySelector('.item-qty');
  const priceInput = tr.querySelector('.item-price');
  
  const updateRowTotal = () => {
    const qty = parseInt(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    tr.querySelector('.item-line-total').textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(qty * price);
    calculatePurchaseOrderTotals();
  };

  qtyInput.addEventListener('input', updateRowTotal);
  priceInput.addEventListener('input', updateRowTotal);
  tr.querySelector('.btn-remove-row').addEventListener('click', () => {
    tr.remove();
    calculatePurchaseOrderTotals();
  });

  poItemsTable.appendChild(tr);
  calculatePurchaseOrderTotals();
}

function calculatePurchaseOrderTotals() {
  let subtotal = 0;
  poItemsTable.querySelectorAll('tr').forEach(tr => {
    const qty = parseInt(tr.querySelector('.item-qty').value) || 0;
    const price = parseFloat(tr.querySelector('.item-price').value) || 0;
    subtotal += qty * price;
  });

  const tax = subtotal * 0.18; // 18% GST
  const total = subtotal + tax;

  const f = val => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
  document.getElementById('po-calc-subtotal').textContent = f(subtotal);
  document.getElementById('po-calc-tax').textContent = f(tax);
  document.getElementById('po-calc-total').textContent = f(total);
}

// ── VENDORS ──────────────────────────────────────────────────
async function loadVendors() {
  const tbody = document.getElementById('vendors-tbody');
  const pagEl = document.getElementById('vendors-pagination');
  renderSkeletonRows(tbody, 5, 7);

  try {
    const res = await vendorService.getVendors({
      page: state.vendors.page,
      search: state.vendors.search,
      status: state.vendors.status,
    });
    tbody.innerHTML = '';
    document.getElementById('vendor-count').textContent = `${res.count} Vendors`;

    if (res.data.length === 0) {
      renderEmptyState(tbody.closest('.table-container'), {
        title: 'No vendors found',
        message: 'Add a vendor to manage purchase orders.',
        action: `<button class="btn btn-purple" id="btn-empty-vendor">Add Vendor</button>`,
      });
      document.getElementById('btn-empty-vendor')?.addEventListener('click', () => openVendorModal());
      pagEl.innerHTML = '';
      return;
    }

    res.data.forEach(v => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${v.name}</strong></td>
        <td>${v.email || 'N/A'}</td>
        <td>${v.phone || 'N/A'}</td>
        <td>${v.contact_person_name || 'N/A'}</td>
        <td><code>${v.gstin || 'N/A'}</code></td>
        <td>${statusBadge(v.status)}</td>
        <td style="text-align: right;">
          <button class="btn btn-ghost btn-sm btn-edit-vendor" data-id="${v.id}">Edit</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    setupPagination(pagEl, res.pages, state.vendors.page, p => {
      state.vendors.page = p;
      loadVendors();
    });

    tbody.querySelectorAll('.btn-edit-vendor').forEach(btn => {
      btn.addEventListener('click', () => editVendor(btn.dataset.id));
    });

  } catch (err) {
    toast.error('Vendors load failed', err.message);
  }
}

function openVendorModal() {
  vendorForm.reset();
  vendorForm.removeAttribute('data-editing-id');
  document.getElementById('vendor-modal-title').textContent = 'Add Vendor';
  openModal('vendor-modal');
}

async function editVendor(id) {
  try {
    const vendor = await vendorService.getVendor(id);
    document.getElementById('vendor-modal-title').textContent = 'Edit Vendor';
    
    // Fill inputs
    document.getElementById('v_name').value = vendor.name || '';
    document.getElementById('v_email').value = vendor.email || '';
    document.getElementById('v_phone').value = vendor.phone || '';
    document.getElementById('v_address').value = vendor.address || '';
    document.getElementById('v_city').value = vendor.city || '';
    document.getElementById('v_state').value = vendor.state || '';
    document.getElementById('v_postal').value = vendor.postal_code || '';
    document.getElementById('v_country').value = vendor.country || '';
    document.getElementById('v_gstin').value = vendor.gstin || '';
    document.getElementById('v_pan').value = vendor.pan_number || '';
    document.getElementById('v_contact_name').value = vendor.contact_person_name || '';
    document.getElementById('v_contact_phone').value = vendor.contact_person_phone || '';
    document.getElementById('v_website').value = vendor.website || '';
    document.getElementById('v_payment_terms').value = vendor.payment_terms || 'Net 30';
    document.getElementById('v_credit_rating').value = vendor.credit_rating || 'Good';
    document.getElementById('v_status').value = vendor.status || 'active';

    vendorForm.setAttribute('data-editing-id', id);
    openModal('vendor-modal');
  } catch (err) {
    toast.error('Failed to load vendor details', err.message);
  }
}

// ── GENERAL LEDGER & FINANCE SUMMARY ──────────────────────────
async function loadLedgerData() {
  const tbody = document.getElementById('ledger-tbody');
  const pagEl = document.getElementById('ledger-pagination');
  renderSkeletonRows(tbody, 5, 7);

  try {
    // 1. Finance Summaries
    const summary = await salesService.getFinancialSummary();
    const f = val => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
    document.getElementById('ledger-revenue').textContent = f(summary.revenue);
    document.getElementById('ledger-expenses').textContent = f(summary.expenses);
    document.getElementById('ledger-profit').textContent = f(summary.net_profit);

    // 2. Entries List
    const res = await salesService.getLedgerEntries({
      page: state.ledger.page,
      search: state.ledger.search,
      type: state.ledger.type,
    });
    tbody.innerHTML = '';
    document.getElementById('ledger-count').textContent = `${res.count} Entries`;

    if (res.data.length === 0) {
      renderEmptyState(tbody.closest('.table-container'), {
        title: 'No ledger records found',
        message: 'Create a ledger transaction or approve sales/purchase orders.',
      });
      pagEl.innerHTML = '';
      return;
    }

    res.data.forEach(entry => {
      const tr = document.createElement('tr');
      const formattedAmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(entry.amount);
      const isCredit = entry.entry_type === 'credit';
      const badgeStyle = isCredit ? 'success' : 'danger';
      const indicator = isCredit ? '+' : '-';

      tr.innerHTML = `
        <td>${formatDate(entry.transaction_date)}</td>
        <td><strong>${entry.account_name}</strong></td>
        <td><span class="badge badge-${badgeStyle}">${entry.entry_type.toUpperCase()}</span></td>
        <td><strong class="text-${badgeStyle}">${indicator} ${formattedAmt}</strong></td>
        <td>${entry.description || 'N/A'}</td>
        <td><code>${entry.reference_type ? `${entry.reference_type} (${entry.reference_id.slice(-6)})` : 'Manual'}</code></td>
        <td>${entry.creator ? entry.creator.full_name : 'System'}</td>
      `;
      tbody.appendChild(tr);
    });

    setupPagination(pagEl, res.pages, state.ledger.page, p => {
      state.ledger.page = p;
      loadLedgerData();
    });

  } catch (err) {
    toast.error('Ledger load failed', err.message);
  }
}

function openLedgerModal() {
  ledgerForm.reset();
  document.getElementById('l_date').value = new Date().toISOString().split('T')[0];
  openModal('ledger-modal');
}

// ── View Details Modal Generator ──────────────────────────────
async function viewTransactionDetails(type, id) {
  const body = document.getElementById('tx-details-body');
  body.innerHTML = '<p class="text-muted">Loading details...</p>';
  openModal('tx-details-modal');

  try {
    let data;
    const f = val => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);

    if (type === 'quote') {
      data = await salesService.getQuotation(id);
      document.getElementById('tx-details-title').textContent = `Quotation ${data.quotation_number}`;
      body.innerHTML = `
        <div class="form-grid" style="margin-bottom: 24px;">
          <div><strong>Client:</strong><br>${data.client ? data.client.name : 'N/A'}</div>
          <div><strong>Valid Until:</strong><br>${formatDate(data.valid_until)}</div>
          <div><strong>Status:</strong><br>${statusBadge(data.status)}</div>
          <div><strong>Created By:</strong><br>${data.creator ? data.creator.full_name : 'System'}</div>
        </div>
        <h4 style="font-family: var(--serif); font-size:16px; margin-bottom:12px;">Line Items</h4>
        <table class="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(it => `
              <tr>
                <td>${it.item_description}</td>
                <td>${it.quantity}</td>
                <td>${f(it.unit_price)}</td>
                <td style="text-align: right;"><strong>${f(it.total_price)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="totals-summary">
          <div class="totals-row"><span>Subtotal:</span><span>${f(data.subtotal)}</span></div>
          <div class="totals-row"><span>Tax (18%):</span><span>${f(data.tax_amount)}</span></div>
          <div class="totals-row grand-total"><span>Grand Total:</span><span>${f(data.total_amount)}</span></div>
        </div>
      `;
    } else if (type === 'so') {
      data = await salesService.getSalesOrder(id);
      document.getElementById('tx-details-title').textContent = `Sales Order ${data.order_number}`;
      body.innerHTML = `
        <div class="form-grid" style="margin-bottom: 24px;">
          <div><strong>Client:</strong><br>${data.client ? data.client.name : 'N/A'}</div>
          <div><strong>Order Date:</strong><br>${formatDate(data.order_date)}</div>
          <div><strong>Status:</strong><br>${statusBadge(data.status)}</div>
          <div><strong>Created By:</strong><br>${data.creator ? data.creator.full_name : 'System'}</div>
        </div>
        <h4 style="font-family: var(--serif); font-size:16px; margin-bottom:12px;">Line Items</h4>
        <table class="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(it => `
              <tr>
                <td>${it.item_description}</td>
                <td>${it.quantity}</td>
                <td>${f(it.unit_price)}</td>
                <td style="text-align: right;"><strong>${f(it.total_price)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="totals-summary">
          <div class="totals-row"><span>Subtotal:</span><span>${f(data.subtotal)}</span></div>
          <div class="totals-row"><span>Tax (18%):</span><span>${f(data.tax_amount)}</span></div>
          <div class="totals-row grand-total"><span>Grand Total:</span><span>${f(data.total_amount)}</span></div>
        </div>
      `;
    } else if (type === 'po') {
      data = await salesService.getPurchaseOrder(id);
      document.getElementById('tx-details-title').textContent = `Purchase Order ${data.po_number}`;
      body.innerHTML = `
        <div class="form-grid" style="margin-bottom: 24px;">
          <div><strong>Vendor:</strong><br>${data.vendor ? data.vendor.name : 'N/A'}</div>
          <div><strong>Order Date:</strong><br>${formatDate(data.order_date)}</div>
          <div><strong>Status:</strong><br>${statusBadge(data.status)}</div>
          <div><strong>Created By:</strong><br>${data.creator ? data.creator.full_name : 'System'}</div>
        </div>
        <h4 style="font-family: var(--serif); font-size:16px; margin-bottom:12px;">Line Items</h4>
        <table class="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(it => `
              <tr>
                <td>${it.item_description}</td>
                <td>${it.quantity}</td>
                <td>${f(it.unit_price)}</td>
                <td style="text-align: right;"><strong>${f(it.total_price)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="totals-summary">
          <div class="totals-row"><span>Subtotal:</span><span>${f(data.subtotal)}</span></div>
          <div class="totals-row"><span>Tax (18%):</span><span>${f(data.tax_amount)}</span></div>
          <div class="totals-row grand-total"><span>Grand Total:</span><span>${f(data.total_amount)}</span></div>
        </div>
      `;
    }

  } catch (err) {
    body.innerHTML = `<p class="text-danger">Failed to load details: ${err.message}</p>`;
  }
}

// ── Submit Handlers ──────────────────────────────────────────
quoteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const client_id = document.getElementById('quote_client').value;
  const valid_until = document.getElementById('quote_valid_until').value;
  const quotation_number = document.getElementById('quote_number').value;
  const status = document.getElementById('quote_status').value;

  const items = [];
  quoteItemsTable.querySelectorAll('tr').forEach(tr => {
    const desc = tr.querySelector('.item-desc').value;
    const qty = parseInt(tr.querySelector('.item-qty').value);
    const price = parseFloat(tr.querySelector('.item-price').value);
    items.push({ item_description: desc, quantity: qty, unit_price: price });
  });

  if (items.length === 0) {
    toast.error('Add at least one line item');
    return;
  }

  // totals
  let subtotal = 0;
  items.forEach(it => subtotal += it.quantity * it.unit_price);
  const tax = subtotal * 0.18;
  const total = subtotal + tax;

  try {
    await salesService.createQuotation({
      client_id,
      valid_until,
      quotation_number: quotation_number || null,
      status,
      subtotal,
      tax_amount: tax,
      total_amount: total,
    }, items);

    toast.success('Quotation created successfully');
    closeModal('quote-modal');
    loadQuotations();
  } catch (err) {
    toast.error('Failed to create quotation', err.message);
  }
});

soForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const client_id = document.getElementById('so_client').value;
  const order_date = document.getElementById('so_date').value;
  const order_number = document.getElementById('so_number').value;
  const status = document.getElementById('so_status').value;

  const items = [];
  soItemsTable.querySelectorAll('tr').forEach(tr => {
    const desc = tr.querySelector('.item-desc').value;
    const qty = parseInt(tr.querySelector('.item-qty').value);
    const price = parseFloat(tr.querySelector('.item-price').value);
    items.push({ item_description: desc, quantity: qty, unit_price: price });
  });

  if (items.length === 0) {
    toast.error('Add at least one line item');
    return;
  }

  let subtotal = 0;
  items.forEach(it => subtotal += it.quantity * it.unit_price);
  const tax = subtotal * 0.18;
  const total = subtotal + tax;

  try {
    await salesService.createSalesOrder({
      client_id,
      order_date,
      order_number: order_number || null,
      status,
      subtotal,
      tax_amount: tax,
      total_amount: total,
    }, items);

    toast.success('Sales order created successfully');
    closeModal('so-modal');
    loadSalesOrders();
  } catch (err) {
    toast.error('Failed to create sales order', err.message);
  }
});

poForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const vendor_id = document.getElementById('po_vendor').value;
  const order_date = document.getElementById('po_date').value;
  const po_number = document.getElementById('po_number').value;
  const status = document.getElementById('po_status').value;

  const items = [];
  poItemsTable.querySelectorAll('tr').forEach(tr => {
    const desc = tr.querySelector('.item-desc').value;
    const qty = parseInt(tr.querySelector('.item-qty').value);
    const price = parseFloat(tr.querySelector('.item-price').value);
    items.push({ item_description: desc, quantity: qty, unit_price: price });
  });

  if (items.length === 0) {
    toast.error('Add at least one line item');
    return;
  }

  let subtotal = 0;
  items.forEach(it => subtotal += it.quantity * it.unit_price);
  const tax = subtotal * 0.18;
  const total = subtotal + tax;

  try {
    await salesService.createPurchaseOrder({
      vendor_id,
      order_date,
      po_number: po_number || null,
      status,
      subtotal,
      tax_amount: tax,
      total_amount: total,
    }, items);

    toast.success('Purchase order created successfully');
    closeModal('po-modal');
    loadPurchaseOrders();
  } catch (err) {
    toast.error('Failed to create purchase order', err.message);
  }
});

vendorForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editingId = vendorForm.getAttribute('data-editing-id');

  const payload = {
    name: document.getElementById('v_name').value,
    email: document.getElementById('v_email').value || null,
    phone: document.getElementById('v_phone').value || null,
    address: document.getElementById('v_address').value || null,
    city: document.getElementById('v_city').value || null,
    state: document.getElementById('v_state').value || null,
    postal_code: document.getElementById('v_postal').value || null,
    country: document.getElementById('v_country').value || null,
    gstin: document.getElementById('v_gstin').value || null,
    pan_number: document.getElementById('v_pan').value || null,
    contact_person_name: document.getElementById('v_contact_name').value || null,
    contact_person_phone: document.getElementById('v_contact_phone').value || null,
    website: document.getElementById('v_website').value || null,
    payment_terms: document.getElementById('v_payment_terms').value,
    credit_rating: document.getElementById('v_credit_rating').value,
    status: document.getElementById('v_status').value,
  };

  try {
    if (editingId) {
      await vendorService.updateVendor(editingId, payload);
      toast.success('Vendor updated successfully');
    } else {
      await vendorService.createVendor(payload);
      toast.success('Vendor added successfully');
    }

    closeModal('vendor-modal');
    state.vendorsCache = []; // invalidate cache
    loadVendors();
  } catch (err) {
    toast.error('Failed to save vendor', err.message);
  }
});

ledgerForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    transaction_date: document.getElementById('l_date').value,
    entry_type: document.getElementById('l_type').value,
    account_name: document.getElementById('l_account').value,
    amount: parseFloat(document.getElementById('l_amount').value),
    description: document.getElementById('l_desc').value || null,
  };

  try {
    await salesService.logLedgerEntry(payload);
    toast.success('General ledger entry logged');
    closeModal('ledger-modal');
    loadLedgerData();
  } catch (err) {
    toast.error('Failed to log ledger entry', err.message);
  }
});

// ── Search & Filter Hooks ───────────────────────────────────
document.getElementById('quote-search').addEventListener('input', debounce((e) => {
  state.quotes.search = e.target.value.trim();
  state.quotes.page = 1;
  loadQuotations();
}, 300));

document.getElementById('quote-status-filter').addEventListener('change', (e) => {
  state.quotes.status = e.target.value;
  state.quotes.page = 1;
  loadQuotations();
});

document.getElementById('so-search').addEventListener('input', debounce((e) => {
  state.salesOrders.search = e.target.value.trim();
  state.salesOrders.page = 1;
  loadSalesOrders();
}, 300));

document.getElementById('so-status-filter').addEventListener('change', (e) => {
  state.salesOrders.status = e.target.value;
  state.salesOrders.page = 1;
  loadSalesOrders();
});

document.getElementById('po-search').addEventListener('input', debounce((e) => {
  state.purchaseOrders.search = e.target.value.trim();
  state.purchaseOrders.page = 1;
  loadPurchaseOrders();
}, 300));

document.getElementById('po-status-filter').addEventListener('change', (e) => {
  state.purchaseOrders.status = e.target.value;
  state.purchaseOrders.page = 1;
  loadPurchaseOrders();
});

document.getElementById('vendor-search').addEventListener('input', debounce((e) => {
  state.vendors.search = e.target.value.trim();
  state.vendors.page = 1;
  loadVendors();
}, 300));

document.getElementById('vendor-status-filter').addEventListener('change', (e) => {
  state.vendors.status = e.target.value;
  state.vendors.page = 1;
  loadVendors();
});

document.getElementById('ledger-search').addEventListener('input', debounce((e) => {
  state.ledger.search = e.target.value.trim();
  state.ledger.page = 1;
  loadLedgerData();
}, 300));

document.getElementById('ledger-type-filter').addEventListener('change', (e) => {
  state.ledger.type = e.target.value;
  state.ledger.page = 1;
  loadLedgerData();
});

// ── Quotation / Sales Order / Purchase Order Item Add triggers 
document.getElementById('btn-quote-add-item').addEventListener('click', () => addQuoteItemRow());
document.getElementById('btn-so-add-item').addEventListener('click', () => addSalesOrderItemRow());
document.getElementById('btn-po-add-item').addEventListener('click', () => addPurchaseOrderItemRow());

// ── Pagination Helper ────────────────────────────────────────
function setupPagination(el, totalPages, currentPage, onPageChange) {
  if (totalPages <= 1) {
    el.innerHTML = '';
    return;
  }

  let html = '';
  // Prev button
  html += `<button class="btn btn-secondary btn-sm" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">Prev</button>`;
  
  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="btn btn-sm ${currentPage === i ? 'btn-purple' : 'btn-secondary'}" data-page="${i}">${i}</button>`;
  }

  // Next button
  html += `<button class="btn btn-secondary btn-sm" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next</button>`;

  el.innerHTML = html;

  el.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page);
      if (page && page !== currentPage && page >= 1 && page <= totalPages) {
        onPageChange(page);
      }
    });
  });
}

// ── Initial Boot ─────────────────────────────────────────────
initTabs();
renderActionButtons();
loadQuotations(); // default active panel
