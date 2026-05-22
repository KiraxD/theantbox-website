import { bootPage, handleLogout } from './modules/authGuard.js';

(async () => {
    // Only boot if they have a session.
    // If they are approved, bootPage automatically redirects them to the dashboard.
    const booted = await bootPage();
    if (!booted) return;

    document.getElementById('btn-logout').addEventListener('click', async () => {
        const btn = document.getElementById('btn-logout');
        btn.classList.add('loading');
        await handleLogout();
        btn.classList.remove('loading');
    });
})();
