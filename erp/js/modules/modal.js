// ============================================================
// THE ANT BOX ERP — modal.js
// Modal & drawer open/close, confirm dialog, stack support
// ============================================================

import toast from './toast.js';

const openModals = [];

// ── Open a Modal ─────────────────────────────────────────────
export function openModal(overlayId) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) { console.warn(`[modal] No overlay found: #${overlayId}`); return; }

  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  openModals.push(overlayId);

  // Close on backdrop click
  overlay.addEventListener('click', _backdropClose);

  // Close on Escape
  document.addEventListener('keydown', _escClose);

  // Focus first focusable element
  requestAnimationFrame(() => {
    const focusable = overlay.querySelector('input, button:not(.modal-close), select, textarea, [tabindex]');
    focusable?.focus();
  });
}

// ── Close a Modal ─────────────────────────────────────────────
export function closeModal(overlayId) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;

  overlay.classList.remove('is-open');
  overlay.removeEventListener('click', _backdropClose);

  const idx = openModals.indexOf(overlayId);
  if (idx > -1) openModals.splice(idx, 1);

  if (openModals.length === 0) {
    document.body.style.overflow = '';
    document.removeEventListener('keydown', _escClose);
  }
}

// ── Close All Modals ──────────────────────────────────────────
export function closeAllModals() {
  [...openModals].forEach(id => closeModal(id));
}

// ── Open Drawer ───────────────────────────────────────────────
export function openDrawer(overlayId) {
  openModal(overlayId); // Same mechanics
}

export function closeDrawer(overlayId) {
  closeModal(overlayId);
}

// ── Confirm Dialog ────────────────────────────────────────────
/**
 * Show a confirm dialog and return a Promise<boolean>
 */
export function confirm({
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
}) {
  return new Promise(resolve => {
    // Remove existing confirm dialogs
    document.getElementById('__erp_confirm')?.remove();

    const ICONS = {
      danger:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      warning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    };

    const overlay = document.createElement('div');
    overlay.id = '__erp_confirm';
    overlay.className = 'modal-overlay is-open';
    overlay.innerHTML = `
      <div class="modal modal-sm confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="modal-body">
          <div class="confirm-icon ${type}">${ICONS[type] || ICONS.danger}</div>
          <h3 id="confirm-title">${escHtml(title)}</h3>
          <p>${escHtml(message)}</p>
        </div>
        <div class="modal-footer" style="justify-content:center;gap:12px;">
          <button class="btn btn-secondary" id="confirm-cancel">${escHtml(cancelText)}</button>
          <button class="btn btn-${type}" id="confirm-ok">${escHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const cleanup = (result) => {
      overlay.remove();
      document.body.style.overflow = '';
      resolve(result);
    };

    overlay.querySelector('#confirm-ok').addEventListener('click', () => cleanup(true));
    overlay.querySelector('#confirm-cancel').addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });

    // Focus confirm button
    requestAnimationFrame(() => overlay.querySelector('#confirm-ok').focus());
  });
}

// ── Populate a Modal Form ─────────────────────────────────────
export function populateForm(formId, data = {}) {
  const form = document.getElementById(formId);
  if (!form) return;

  Object.entries(data).forEach(([key, value]) => {
    const el = form.querySelector(`[name="${key}"], #${key}`);
    if (!el) return;

    if (el.type === 'checkbox') {
      el.checked = Boolean(value);
    } else if (el.tagName === 'SELECT') {
      el.value = value ?? '';
    } else {
      el.value = value ?? '';
    }
  });
}

// ── Read Form Data ────────────────────────────────────────────
export function readForm(formId) {
  const form = document.getElementById(formId);
  if (!form) return {};

  const fd = new FormData(form);
  const result = {};

  for (const [key, value] of fd.entries()) {
    result[key] = value;
  }

  // Handle unchecked checkboxes
  form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (!(cb.name in result)) result[cb.name] = false;
    else result[cb.name] = true;
  });

  return result;
}

// ── Setup Modal Close Buttons ─────────────────────────────────
export function setupModalClosers() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.closeModal;
      closeModal(targetId);
    });
  });

  document.querySelectorAll('[data-open-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.openModal;
      openModal(targetId);
    });
  });
}

// ── Private helpers ───────────────────────────────────────────
function _backdropClose(e) {
  if (e.target === e.currentTarget) {
    const id = e.currentTarget.id;
    closeModal(id);
  }
}

function _escClose(e) {
  if (e.key === 'Escape' && openModals.length > 0) {
    closeModal(openModals[openModals.length - 1]);
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Expose modal control functions globally to support legacy/inline HTML handlers
window.openModal = openModal;
window.closeModal = closeModal;

