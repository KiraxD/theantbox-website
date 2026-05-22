// ============================================================
// THE ANT BOX ERP — toast.js
// Toast notification system
// ============================================================

let _container = null;

function getContainer() {
  if (_container) return _container;
  _container = document.createElement('div');
  _container.className = 'toast-container';
  _container.setAttribute('aria-live', 'polite');
  _container.setAttribute('aria-label', 'Notifications');
  document.body.appendChild(_container);
  return _container;
}

const ICONS = {
  success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

/**
 * Show a toast notification
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {string} title
 * @param {string} [message]
 * @param {number} [duration=4000] ms before auto-dismiss (0 = persistent)
 */
export function showToast(type = 'info', title = '', message = '', duration = 4000) {
  const container = getContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type === 'error' ? 'danger' : type}`;
  toast.setAttribute('role', 'alert');

  toast.innerHTML = `
    <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
    <div class="toast-content">
      <p class="toast-title">${escHtml(title)}</p>
      ${message ? `<p class="toast-message">${escHtml(message)}</p>` : ''}
    </div>
    <button class="toast-close" aria-label="Dismiss">${CLOSE_ICON}</button>
  `;

  container.appendChild(toast);

  // Dismiss on close btn
  toast.querySelector('.toast-close').addEventListener('click', () => dismiss(toast));

  // Auto dismiss
  if (duration > 0) {
    setTimeout(() => dismiss(toast), duration);
  }

  return toast;
}

function dismiss(toast) {
  toast.classList.add('is-removing');
  setTimeout(() => toast.remove(), 350);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Convenience helpers
export const toast = {
  success: (title, msg, dur) => showToast('success', title, msg, dur),
  error:   (title, msg, dur) => showToast('error',   title, msg, dur),
  warning: (title, msg, dur) => showToast('warning', title, msg, dur),
  info:    (title, msg, dur) => showToast('info',    title, msg, dur),
};

export default toast;
