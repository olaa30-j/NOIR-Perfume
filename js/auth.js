/* ============================================================
   NOIR — Authentication
   Hybrid: Supabase Auth (real) + localStorage demo (fallback)
   Demo credentials:
     Admin    → admin@gmail.com / admin
     Customer → any email + any password (≥6 chars for Supabase)
   ============================================================ */

const NOIR_SESSION_KEY = 'NOIR_SESSION';

const NOIR_DEMO_ADMIN = {
  email: 'admin@gmail.com',
  password: 'admin',
  role: 'admin',
  name: 'Store Admin',
};

/* ---------- SUPABASE AUTH DETECTION ---------- */
function noirHasAuth() {
  return typeof window.db !== 'undefined'
    && window.db
    && window.db.auth
    && typeof window.db.auth.signInWithPassword === 'function';
}

/* ---------- SESSION (localStorage cache) ---------- */
function noirGetSession() {
  try {
    const raw = localStorage.getItem(NOIR_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function noirSetSession(session) {
  try { localStorage.setItem(NOIR_SESSION_KEY, JSON.stringify(session)); } catch (e) {}
  if (typeof noirUpdateHeaderUI === 'function') noirUpdateHeaderUI();
}

function noirClearSession() {
  try { localStorage.removeItem(NOIR_SESSION_KEY); } catch (e) {}
  if (typeof noirUpdateHeaderUI === 'function') noirUpdateHeaderUI();
}

/* ---------- LOGIN (async) ---------- */
async function noirLogin(email, password) {
  const e = String(email || '').trim().toLowerCase();
  const p = String(password || '');

  if (!e || !p) {
    return { ok: false, error: 'Enter both email and password.' };
  }

  // ---------- Supabase Auth (real) ----------
  if (noirHasAuth()) {
    try {
      let { data, error } = await window.db.auth.signInWithPassword({ email: e, password: p });

      // If invalid credentials → try sign up (demo convenience)
      if (error && /invalid login credentials/i.test(error.message)) {
        const signUp = await window.db.auth.signUp({ email: e, password: p });
        if (signUp.error) {
          return { ok: false, error: signUp.error.message };
        }
        data = signUp.data;
        if (!data.session) {
          return {
            ok: false,
            error: 'Account created but email confirmation is required. Check your inbox, or disable "Confirm email" in Supabase Auth settings.',
          };
        }
      } else if (error) {
        return { ok: false, error: error.message };
      }

      const role = (e === NOIR_DEMO_ADMIN.email) ? 'admin' : 'customer';
      const name = role === 'admin'
        ? NOIR_DEMO_ADMIN.name
        : (data.user?.user_metadata?.name || e.split('@')[0] || 'Customer');

      const session = {
        email: e,
        role,
        name,
        at: Date.now(),
        source: 'supabase',
        userId: data.user?.id || null,
      };
      noirSetSession(session);

      // Verify role matches requirement if redirected from admin
      const params = new URLSearchParams(location.search);
      const forcedRole = params.get('role');
      const next = params.get('next');

      if (forcedRole === 'admin' && role !== 'admin') {
        // Signed in but not admin → sign out and reject
        try { await window.db.auth.signOut(); } catch (_) {}
        noirClearSession();
        return {
          ok: false,
          error: 'Admin access requires the admin account (admin@gmail.com).',
        };
      }

      return {
        ok: true,
        session,
        redirect: next || (role === 'admin' ? 'admin.html' : 'account.html'),
      };
    } catch (err) {
      console.error('[auth] Supabase login error:', err);
      return { ok: false, error: 'Login failed: ' + (err.message || 'Unknown error') };
    }
  }

  // ---------- Demo fallback (no Supabase) ----------
  if (e === NOIR_DEMO_ADMIN.email && p === NOIR_DEMO_ADMIN.password) {
    const session = { email: e, role: 'admin', name: NOIR_DEMO_ADMIN.name, at: Date.now(), source: 'demo' };
    noirSetSession(session);
    return { ok: true, session, redirect: 'admin.html' };
  }

  const session = {
    email: e,
    role: 'customer',
    name: e.split('@')[0] || 'Customer',
    at: Date.now(),
    source: 'demo',
  };
  noirSetSession(session);
  return { ok: true, session, redirect: 'account.html' };
}

/* ---------- LOGOUT ---------- */
async function noirLogout(redirect) {
  if (redirect === undefined) redirect = 'index.html';

  if (noirHasAuth()) {
    try { await window.db.auth.signOut(); } catch (e) {}
  }

  noirClearSession();
  if (typeof showToast === 'function') showToast('Signed out.');
  if (redirect) {
    setTimeout(() => { window.location.href = redirect; }, 400);
  }
}

/* ---------- GUARD ---------- */
function noirRequireRole(role) {
  const s = noirGetSession();
  if (!s || (role && s.role !== role)) {
    const back = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
    window.location.href = 'login.html?next=' + back + (role === 'admin' ? '&role=admin' : '');
    return null;
  }
  return s;
}

/* ---------- HEADER UI ---------- */
function noirUpdateHeaderUI() {
  const btn = document.getElementById('account-button');
  if (!btn) return;
  const s = noirGetSession();
  if (s) {
    btn.setAttribute('aria-label', 'Account: ' + s.name + ' (' + s.role + '). Click to open.');
    btn.title = s.name + ' · ' + s.role;
    btn.dataset.loggedIn = 'true';
    btn.dataset.role = s.role;
  } else {
    btn.setAttribute('aria-label', 'Open account');
    btn.title = 'Sign in';
    delete btn.dataset.loggedIn;
    delete btn.dataset.role;
  }
}

/* ---------- LOGIN PAGE HANDLER ---------- */
document.addEventListener('DOMContentLoaded', function () {
  noirUpdateHeaderUI();

  const form = document.getElementById('login-form');
  if (!form) return;

  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  const forcedRole = params.get('role');
  const hint = document.getElementById('login-hint');
  const errorEl = document.getElementById('login-error');

  if (forcedRole === 'admin' && hint) {
    hint.innerHTML = 'Admin studio requires sign-in. Use <strong>admin@gmail.com</strong> / <strong>admin</strong>.';
  }

  const existing = noirGetSession();
  if (existing && hint) {
    hint.innerHTML =
      'You are signed in as <strong>' + existing.name + '</strong> (' + existing.role + '). ' +
      '<a href="#" id="login-signout" style="color:var(--gold-light);text-decoration:underline">Sign out</a> to switch.';
    const so = document.getElementById('login-signout');
    if (so) {
      so.addEventListener('click', function (e) {
        e.preventDefault();
        noirLogout(null);
        setTimeout(() => location.reload(), 400);
      });
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const data = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in…'; }
    if (errorEl) errorEl.style.display = 'none';

    const result = await noirLogin(data.get('email'), data.get('password'));

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign in'; }

    if (!result.ok) {
      if (errorEl) {
        errorEl.textContent = result.error;
        errorEl.style.display = 'block';
      }
      return;
    }

    if (typeof showToast === 'function') {
      showToast(result.session.role === 'admin' ? 'Signed in as admin.' : 'Signed in.');
    }
    const dest = next || result.redirect;
    setTimeout(() => { window.location.href = dest; }, 350);
  });
});

/* ---------- EXPORTS ---------- */
window.noirGetSession = noirGetSession;
window.noirSetSession = noirSetSession;
window.noirClearSession = noirClearSession;
window.noirLogin = noirLogin;
window.noirLogout = noirLogout;
window.noirRequireRole = noirRequireRole;
window.noirUpdateHeaderUI = noirUpdateHeaderUI;
window.noirHasAuth = noirHasAuth;