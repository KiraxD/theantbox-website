// ============================================================
// THE ANT BOX ERP — invoices.js
// Invoices UI controller, dynamic row calculations, detail preview
// ============================================================

import { bootPage } from './modules/authGuard.js';
import { initTheme, initSidebar, initLogout, initThemeToggle, initDropdowns, renderSkeletonRows, renderEmptyState, setLoading, formatDate } from './modules/ui.js';
import { openModal, closeModal, populateForm, readForm, setupModalClosers } from './modules/modal.js';
import toast from './modules/toast.js';
import { validateForm, rules } from './modules/validators.js';
import { getInvoices, getInvoice, createInvoice, updateInvoiceStatus, deleteInvoice, getInvoiceStats, subscribeInvoices } from './services/invoiceService.js';

initTheme();
// Require finance roles
const ctx = await bootPage({ requiredRoles: ['super_admin', 'admin', 'hr', 'accountant', 'intern'] });
if (!ctx) throw new Error('Not authenticated');
initSidebar(); initLogout(); initThemeToggle(); initDropdowns(); setupModalClosers();

let allInvoices = [];
let searchQuery = '';
let statusFilter = '';
let rowCount = 0;

const FALLBACK_USD_RATES = {
  USD: 1.0,
  INR: 83.5,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  CAD: 1.36,
  AUD: 1.51,
  SGD: 1.35,
  JPY: 156.0,
  CNY: 7.24,
  CHF: 0.91,
  NZD: 1.63,
  HKD: 7.81,
  ZAR: 18.5,
  BRL: 5.15,
  MXN: 16.7,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.31,
  BHD: 0.38,
  OMR: 0.39,
  SEK: 10.7,
  NOK: 10.6,
  DKK: 6.9,
  TRY: 32.2,
  RUB: 90.5,
  PLN: 3.95,
  IDR: 16000.0,
  MYR: 4.7,
  PHP: 58.0,
  THB: 36.5,
  VND: 25400.0
};

// Helper to format currency dynamically using Intl.NumberFormat
function formatCurrency(amount, currencyCode = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode || 'USD'
    }).format(amount);
  } catch (e) {
    return `${currencyCode || 'USD'} ${Number(amount).toFixed(2)}`;
  }
}

// Helper to get currently selected currency in the creation form
function getSelectedCurrency() {
  const currencySelect = document.getElementById('currency');
  return currencySelect ? currencySelect.value : 'USD';
}

// ── Load & Render Invoices ────────────────────────────────────
async function loadInvoices() {
  const tbody = document.getElementById('invoices-tbody');
  if (!tbody) return;

  renderSkeletonRows(tbody, 4, 7);

  try {
    // 1. Load Stats
    const statsData = await getInvoiceStats();
    
    // Fetch live exchange rates
    let rates = FALLBACK_USD_RATES;
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (res.ok) {
        const json = await res.json();
        if (json && json.rates) {
          rates = json.rates;
        }
      }
    } catch (e) {
      console.warn('Could not fetch live exchange rates, using fallbacks:', e);
    }

    const inrRate = rates['INR'] || 83.5;

    // Helper to convert any amount to INR
    const convertToINR = (amount, fromCurrency) => {
      const currency = (fromCurrency || 'USD').toUpperCase();
      const usdAmount = amount / (rates[currency] || 1.0);
      return usdAmount * inrRate;
    };

    // Calculate totals in INR
    const totalInvoicedINR = statsData.reduce((sum, inv) => sum + convertToINR(Number(inv.total) || 0, inv.currency), 0);
    const paidAmountINR = statsData.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + convertToINR(Number(inv.total) || 0, inv.currency), 0);
    const pendingAmountINR = statsData.filter(inv => inv.status === 'sent').reduce((sum, inv) => sum + convertToINR(Number(inv.total) || 0, inv.currency), 0);

    document.getElementById('stat-total-invoiced').textContent = formatCurrency(totalInvoicedINR, 'INR');
    document.getElementById('stat-revenue-collected').textContent = formatCurrency(paidAmountINR, 'INR');
    document.getElementById('stat-outstanding').textContent = formatCurrency(pendingAmountINR, 'INR');

    // 2. Load Table
    allInvoices = await getInvoices({ status: statusFilter, search: searchQuery });

    if (!allInvoices.length) {
      tbody.innerHTML = '';
      renderEmptyState(tbody.closest('.table-container'), {
        title: 'No invoices found',
        message: searchQuery ? `No results matching "${searchQuery}"` : 'No invoices generated yet.',
        action: `<button class="btn btn-purple" onclick="document.getElementById('btn-add-invoice').click()">Create Invoice</button>`,
      });
      return;
    }

    tbody.innerHTML = allInvoices.map(inv => {
      let badgeCls = 'offline';
      if (inv.status === 'paid') badgeCls = 'active';
      if (inv.status === 'sent') badgeCls = 'review';
      
      const statusLabel = inv.status.charAt(0).toUpperCase() + inv.status.slice(1);

      return `
        <tr data-id="${inv.id}">
          <td><code style="background:var(--line); padding:3px 6px; border-radius:4px;">${inv.invoice_number}</code></td>
          <td style="font-weight: 500; color: var(--black);">${inv.client_name}</td>
          <td>${formatDate(inv.issued_date)}</td>
          <td>${formatDate(inv.due_date)}</td>
          <td style="font-weight: 600;">${formatCurrency(inv.total, inv.currency)}</td>
          <td><span class="status ${badgeCls}">${statusLabel}</span></td>
          <td style="text-align: right;">
            <div class="table-actions" style="justify-content: flex-end;">
              <button class="btn btn-sm btn-ghost btn-icon-sm" data-action="view" data-id="${inv.id}" title="View Details">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              ${inv.status !== 'paid' ? `
                <button class="btn btn-sm btn-ghost btn-icon-sm" data-action="pay" data-id="${inv.id}" title="Mark as Paid" style="color:#1c8f52">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
              ` : ''}
              ${inv.status !== 'void' ? `
                <button class="btn btn-sm btn-ghost btn-icon-sm" data-action="void" data-id="${inv.id}" title="Void Invoice" style="color:var(--danger)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const { action, id } = btn.dataset;
        if (action === 'view') openInvoiceDetail(id);
        if (action === 'pay') handleStatusChange(id, 'paid');
        if (action === 'void') handleStatusChange(id, 'void');
      });
    });

    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => openInvoiceDetail(row.dataset.id));
    });

  } catch (err) {
    console.error('[Load Invoices Error]', err);
    toast.error('Failed to load invoices', err.message);
  }
}

// ── Handle Action States ──────────────────────────────────────
async function handleStatusChange(id, status) {
  try {
    await updateInvoiceStatus(id, status);
    toast.success(`Invoice marked as ${status}`);
    await loadInvoices();
  } catch (err) {
    toast.error('Status update failed', err.message);
  }
}

// ── Dynamic Row Addition ──────────────────────────────────────
function addInvoiceRow(desc = '', qty = 1, price = 0.00) {
  const container = document.getElementById('invoice-rows-container');
  if (!container) return;

  const rowId = `row-${rowCount++}`;
  const currencyCode = getSelectedCurrency();
  const rowHtml = `
    <div class="invoice-row-item" id="${rowId}">
      <input type="text" class="input item-desc" placeholder="Description of service/item" value="${desc}" required>
      <input type="number" class="input item-qty" min="1" value="${qty}" style="text-align: right;" required>
      <input type="number" class="input item-price" min="0" step="0.01" value="${price.toFixed(2)}" style="text-align: right;" required>
      <span class="item-amount" style="text-align: right; font-weight: 500;">${formatCurrency(qty * price, currencyCode)}</span>
      <button type="button" class="btn btn-ghost btn-icon-sm btn-remove-row" style="color:var(--danger)">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', rowHtml);

  const newRow = document.getElementById(rowId);
  const qtyInput = newRow.querySelector('.item-qty');
  const priceInput = newRow.querySelector('.item-price');

  const updateRowVal = () => {
    const q = Number(qtyInput.value) || 0;
    const p = Number(priceInput.value) || 0;
    newRow.querySelector('.item-amount').textContent = formatCurrency(q * p, getSelectedCurrency());
    recalculateTotals();
  };

  qtyInput.addEventListener('input', updateRowVal);
  priceInput.addEventListener('input', updateRowVal);

  newRow.querySelector('.btn-remove-row').addEventListener('click', () => {
    newRow.remove();
    recalculateTotals();
  });

  recalculateTotals();
}

function recalculateTotals() {
  const rows = document.querySelectorAll('.invoice-row-item');
  let subtotal = 0;

  rows.forEach(row => {
    const q = Number(row.querySelector('.item-qty').value) || 0;
    const p = Number(row.querySelector('.item-price').value) || 0;
    subtotal += q * p;
  });

  const tax = Number(document.getElementById('tax').value) || 0;
  const discount = Number(document.getElementById('discount').value) || 0;
  const total = subtotal + tax - discount;
  const currencyCode = getSelectedCurrency();

  document.getElementById('summary-subtotal').textContent = formatCurrency(subtotal, currencyCode);
  document.getElementById('summary-total').textContent = formatCurrency(total, currencyCode);
}

// ── Detail & Preview ──────────────────────────────────────────
async function openInvoiceDetail(id) {
  try {
    const inv = await getInvoice(id);
    
    document.getElementById('invoice-title-number').textContent = inv.invoice_number;
    
    const statusEl = document.getElementById('invoice-detail-status');
    statusEl.textContent = inv.status.toUpperCase();
    statusEl.className = 'status ' + (inv.status === 'paid' ? 'active' : (inv.status === 'sent' ? 'review' : 'offline'));

    document.getElementById('invoice-to-name').textContent = inv.client_name;
    document.getElementById('invoice-to-email').textContent = inv.client_email || 'No email provided';
    document.getElementById('invoice-date-issued').textContent = formatDate(inv.issued_date);
    document.getElementById('invoice-date-due').textContent = formatDate(inv.due_date);

    const curr = inv.currency || 'USD';
    const tbody = document.getElementById('invoice-items-detail-tbody');
    if (tbody) {
      tbody.innerHTML = inv.items.map(item => `
        <tr>
          <td><strong>${item.description}</strong></td>
          <td style="text-align: right;">${item.quantity}</td>
          <td style="text-align: right;">${formatCurrency(item.unit_price, curr)}</td>
          <td style="text-align: right; font-weight: 500;">${formatCurrency(item.amount, curr)}</td>
        </tr>
      `).join('');
    }

    // Summary totals
    document.getElementById('invoice-detail-subtotal').textContent = formatCurrency(inv.subtotal, curr);
    document.getElementById('invoice-detail-tax').textContent = formatCurrency(inv.tax, curr);
    document.getElementById('invoice-detail-discount').textContent = formatCurrency(inv.discount, curr);
    document.getElementById('invoice-detail-total').textContent = formatCurrency(inv.total, curr);

    openModal('detail-modal');
  } catch (err) {
    toast.error('Could not load invoice detail', err.message);
  }
}

// ── Form Submits ──────────────────────────────────────────────
document.getElementById('invoice-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const valid = validateForm('invoice-form', {
    client_name: [rules.required()],
    due_date: [rules.required()]
  });
  if (!valid) return;

  const rows = document.querySelectorAll('.invoice-row-item');
  if (rows.length === 0) {
    toast.error('Add at least one line item before saving.');
    return;
  }

  const btn = e.target.querySelector('[type="submit"]');
  setLoading(btn, true);

  const mainData = readForm('invoice-form');
  mainData.created_by = ctx.profile.id;

  const itemsList = [];
  let itemsValid = true;

  rows.forEach(row => {
    const desc = row.querySelector('.item-desc').value.trim();
    const qty = Number(row.querySelector('.item-qty').value);
    const price = Number(row.querySelector('.item-price').value);

    if (!desc || isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
      itemsValid = false;
      return;
    }
    itemsList.push({ description: desc, quantity: qty, unit_price: price });
  });

  if (!itemsValid) {
    toast.error('Please fill in description, valid quantity and unit price for all lines.');
    setLoading(btn, false);
    return;
  }

  try {
    await createInvoice(mainData, itemsList);
    toast.success('Invoice created successfully');
    closeModal('invoice-modal');
    await loadInvoices();
  } catch (err) {
    toast.error('Creation failed', err.message);
  } finally {
    setLoading(btn, false);
  }
});

// ── Calculations triggers ─────────────────────────────────────
document.getElementById('tax')?.addEventListener('input', recalculateTotals);
document.getElementById('discount')?.addEventListener('input', recalculateTotals);
document.getElementById('currency')?.addEventListener('change', () => {
  // Update all existing row amounts to the new currency symbol
  const rows = document.querySelectorAll('.invoice-row-item');
  const currencyCode = getSelectedCurrency();
  rows.forEach(row => {
    const qtyInput = row.querySelector('.item-qty');
    const priceInput = row.querySelector('.item-price');
    const q = Number(qtyInput.value) || 0;
    const p = Number(priceInput.value) || 0;
    row.querySelector('.item-amount').textContent = formatCurrency(q * p, currencyCode);
  });
  recalculateTotals();
});

// ── Search & Filters ──────────────────────────────────────────
document.getElementById('invoice-search')?.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  loadInvoices();
});

document.getElementById('invoice-status-filter')?.addEventListener('change', (e) => {
  statusFilter = e.target.value;
  loadInvoices();
});

// ── Modal Triggers ────────────────────────────────────────────
document.getElementById('btn-add-invoice')?.addEventListener('click', () => {
  document.getElementById('invoice-form')?.reset();
  document.getElementById('invoice-rows-container').innerHTML = '';
  // Set default issued date to today
  document.getElementById('issued_date').value = new Date().toISOString().split('T')[0];
  // Add initial row
  addInvoiceRow('', 1, 0.00);
  openModal('invoice-modal');
});

document.getElementById('btn-add-row')?.addEventListener('click', () => {
  addInvoiceRow('', 1, 0.00);
});

document.getElementById('btn-print-invoice')?.addEventListener('click', () => {
  window.print();
});

window.downloadInvoicePDF = function() {
  const element = document.getElementById('print-area');
  const invoiceNumber = document.getElementById('invoice-title-number').textContent || 'invoice';
  
  // Clone element to customize for PDF generation
  const clone = element.cloneNode(true);
  const container = clone.querySelector('.invoice-print-container');
  if (container) {
    container.style.border = 'none';
    container.style.boxShadow = 'none';
    container.style.padding = '20px';
    container.style.maxWidth = '100%';
    container.style.background = '#fff';
    container.style.color = '#000';
  }

  // Ensure text elements render clean and visible in PDF regardless of theme
  clone.querySelectorAll('span, strong, td, th, h1, h2, h3, h4, div').forEach(el => {
    el.style.color = '#000';
  });
  
  const opt = {
    margin:       10,
    filename:     `${invoiceNumber}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  
  if (typeof html2pdf === 'undefined') {
    toast.error('PDF generator library is still loading. Please wait a moment or click Print instead.');
    return;
  }
  
  html2pdf().set(opt).from(clone).save();
};

document.getElementById('btn-download-pdf')?.addEventListener('click', window.downloadInvoicePDF);

// ── Realtime Sync ─────────────────────────────────────────────
await subscribeInvoices(() => loadInvoices());

// ── Init ──────────────────────────────────────────────────────
await loadInvoices();
