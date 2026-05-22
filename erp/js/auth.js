// ============================================================
// THE ANT BOX ERP — auth.js
// Login, forgot password, reset password page logic
// ============================================================

import { signIn, signUp, sendPasswordReset, updatePassword, getSession } from './services/authService.js';
import { validateForm, rules } from './modules/validators.js';
import { setLoading } from './modules/ui.js';
import toast from './modules/toast.js';

// ── Detect which auth page is active ─────────────────────────
const page = document.body.dataset.authPage || 'login';

// ── Redirect if already logged in ────────────────────────────
(async () => {
  const session = await getSession();
  if (session && page !== 'reset') {
    window.location.href = '/erp/dashboard.html';
  }

  // Show message from URL param (e.g. session expired)
  const params = new URLSearchParams(window.location.search);
  const msg = params.get('msg');
  if (msg) showAuthMessage(msg, 'error');
})();

// ── Login Form ────────────────────────────────────────────────
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const valid = validateForm('login-form', {
      email:    [rules.required(), rules.email()],
      password: [rules.required(), rules.minLength(6)],
    });
    if (!valid) return;

    const btn = loginForm.querySelector('[type="submit"]');
    setLoading(btn, true);
    clearAuthMessage();

    const email    = loginForm.querySelector('#email').value.trim();
    const password = loginForm.querySelector('#password').value;

    try {
      await signIn(email, password);
      toast.success('Welcome back!', 'Redirecting to dashboard…');
      setTimeout(() => { window.location.href = '/erp/dashboard.html'; }, 800);
    } catch (err) {
      showAuthMessage(err.message || 'Invalid credentials. Please try again.', 'error');
      setLoading(btn, false);
    }
  });
}

// ── Sign Up Form ──────────────────────────────────────────────
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const valid = validateForm('signup-form', {
      full_name: [rules.required(), rules.minLength(2)],
      email:     [rules.required(), rules.email()],
      password:  [rules.required(), rules.minLength(6)],
    });
    if (!valid) return;

    const btn = signupForm.querySelector('[type="submit"]');
    setLoading(btn, true);
    clearAuthMessage();

    const fullName = signupForm.querySelector('#full_name').value.trim();
    const email    = signupForm.querySelector('#email').value.trim();
    const password = signupForm.querySelector('#password').value;

    try {
      await signUp(email, password, fullName);
      toast.success('Account created!', 'Redirecting...');
      setTimeout(() => { window.location.href = '/erp/pages/pending.html'; }, 800);
    } catch (err) {
      showAuthMessage(err.message || 'Failed to create account.', 'error');
      setLoading(btn, false);
    }
  });
}

// ── Password visibility toggle ────────────────────────────────
document.querySelectorAll('[data-toggle-password]').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.togglePassword;
    const input = document.getElementById(targetId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.querySelector('.eye-open')?.classList.toggle('hidden', !isHidden);
    btn.querySelector('.eye-closed')?.classList.toggle('hidden', isHidden);
  });
});

// ── Forgot Password Form ──────────────────────────────────────
const forgotForm = document.getElementById('forgot-form');
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const valid = validateForm('forgot-form', {
      email: [rules.required(), rules.email()],
    });
    if (!valid) return;

    const btn = forgotForm.querySelector('[type="submit"]');
    setLoading(btn, true);
    clearAuthMessage();

    const email = forgotForm.querySelector('#email').value.trim();

    try {
      await sendPasswordReset(email);
      showAuthMessage(
        `Password reset link sent to ${email}. Check your inbox.`,
        'success'
      );
      forgotForm.reset();
    } catch (err) {
      showAuthMessage(err.message || 'Failed to send reset email. Try again.', 'error');
    } finally {
      setLoading(btn, false);
    }
  });
}

// ── Reset Password Form ───────────────────────────────────────
const resetForm = document.getElementById('reset-form');
if (resetForm) {
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const valid = validateForm('reset-form', {
      password:         [rules.required(), rules.minLength(8)],
      confirm_password: [rules.required(), rules.match('password', 'Passwords do not match')],
    });
    if (!valid) return;

    const btn = resetForm.querySelector('[type="submit"]');
    setLoading(btn, true);
    clearAuthMessage();

    const newPassword = resetForm.querySelector('#password').value;

    try {
      await updatePassword(newPassword);
      showAuthMessage('Password updated successfully. You can now log in.', 'success');
      setTimeout(() => { window.location.href = '/erp/index.html'; }, 2000);
    } catch (err) {
      showAuthMessage(err.message || 'Failed to update password.', 'error');
      setLoading(btn, false);
    }
  });

  // Password strength meter
  const passwordInput = resetForm.querySelector('#password');
  const strengthBar   = document.getElementById('password-strength');
  const strengthLabel = document.getElementById('strength-label');

  if (passwordInput && strengthBar) {
    passwordInput.addEventListener('input', () => {

      import('./modules/validators.js').then(({ passwordStrength }) => {
        const { score, label } = passwordStrength(passwordInput.value);
        const pct  = (score / 5) * 100;
        const cls  = ['', 'danger', 'danger', 'warning', 'success', 'purple'][score] || '';
        strengthBar.style.width = `${pct}%`;
        strengthBar.className  = `progress-bar ${cls}`;
        if (strengthLabel) strengthLabel.textContent = label;
      });
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────
function showAuthMessage(msg, type = 'error') {
  const box = document.getElementById('auth-message');
  if (!box) return;
  const iconMap = {
    error:   `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    success: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  };
  box.className = `auth-${type}`;
  box.innerHTML = `${iconMap[type] || ''} ${msg}`;
  box.style.display = 'flex';
}

function clearAuthMessage() {
  const box = document.getElementById('auth-message');
  if (box) { box.style.display = 'none'; box.textContent = ''; }
}
