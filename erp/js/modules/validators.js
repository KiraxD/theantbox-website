// ============================================================
// THE ANT BOX ERP — validators.js
// Input sanitization, form validation
// ============================================================

// ── Sanitize string (XSS prevention) ─────────────────────────
export function sanitize(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str ?? '')));
  return div.innerHTML;
}

// ── Validate Email ────────────────────────────────────────────
export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

// ── Validate Phone ────────────────────────────────────────────
export function isPhone(value) {
  return /^[6-9]\d{9}$/.test(String(value).replace(/\s/g, ''));
}

// ── Validate Password Strength ────────────────────────────────
export function passwordStrength(password) {
  const checks = {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number:    /[0-9]/.test(password),
    special:   /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const labels = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  return { checks, score, label: labels[score] || '' };
}

// ── Required field check ──────────────────────────────────────
export function isRequired(value) {
  return String(value ?? '').trim().length > 0;
}

// ── Validate salary / number ──────────────────────────────────
export function isPositiveNumber(value) {
  const n = Number(value);
  return !isNaN(n) && n > 0;
}

// ── Date validation ───────────────────────────────────────────
export function isValidDate(value) {
  const d = new Date(value);
  return d instanceof Date && !isNaN(d.getTime());
}

export function isFutureDate(value) {
  return isValidDate(value) && new Date(value) > new Date();
}

// ── File validation ───────────────────────────────────────────
const ALLOWED_TYPES = {
  image:    ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  document: ['application/pdf', 'application/msword',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  any:      null,
};

export function validateFile(file, { maxMB = 5, allowedCategory = 'any' } = {}) {
  const errors = [];

  if (!file) { errors.push('No file selected'); return errors; }

  const maxBytes = maxMB * 1024 * 1024;
  if (file.size > maxBytes) errors.push(`File exceeds ${maxMB}MB limit`);

  const allowed = ALLOWED_TYPES[allowedCategory];
  if (allowed && !allowed.includes(file.type)) {
    errors.push(`Invalid file type. Allowed: ${allowed.map(t => t.split('/')[1]).join(', ')}`);
  }

  return errors;
}

// ── Form Validator ────────────────────────────────────────────
/**
 * Validate a form and show inline errors
 * rules: { fieldName: [{ fn, message }] }
 * Returns true if valid
 */
export function validateForm(formId, rules) {
  const form = document.getElementById(formId);
  if (!form) return false;

  let valid = true;

  // Clear previous errors
  form.querySelectorAll('.form-error').forEach(el => el.remove());
  form.querySelectorAll('.input.is-invalid, .select.is-invalid, .textarea.is-invalid')
    .forEach(el => el.classList.remove('is-invalid'));

  Object.entries(rules).forEach(([fieldName, fieldRules]) => {
    const field = form.querySelector(`[name="${fieldName}"], #${fieldName}`);
    if (!field) return;

    for (const rule of fieldRules) {
      if (!rule.fn(field.value)) {
        valid = false;
        field.classList.add('is-invalid');

        const errEl = document.createElement('p');
        errEl.className = 'form-error';
        errEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${sanitize(rule.message)}`;

        field.parentElement.appendChild(errEl);
        break; // Show only first failing rule per field
      }
    }
  });

  return valid;
}

// ── Common rule factories ─────────────────────────────────────
export const rules = {
  required:        (msg = 'This field is required')        => ({ fn: isRequired,        message: msg }),
  email:           (msg = 'Enter a valid email address')   => ({ fn: isEmail,           message: msg }),
  phone:           (msg = 'Enter a valid 10-digit number') => ({ fn: isPhone,           message: msg }),
  positiveNumber:  (msg = 'Must be a positive number')     => ({ fn: isPositiveNumber,  message: msg }),
  validDate:       (msg = 'Enter a valid date')            => ({ fn: isValidDate,       message: msg }),
  minLength: (min, msg) => ({
    fn: v => String(v ?? '').trim().length >= min,
    message: msg || `Minimum ${min} characters required`,
  }),
  maxLength: (max, msg) => ({
    fn: v => String(v ?? '').trim().length <= max,
    message: msg || `Maximum ${max} characters allowed`,
  }),
  match: (otherId, msg = 'Fields do not match') => ({
    fn: (v) => {
      const other = document.getElementById(otherId);
      return other ? v === other.value : true;
    },
    message: msg,
  }),
};
