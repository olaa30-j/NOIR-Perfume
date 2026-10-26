/* ============================================================
   NOIR — Authentication
   Hybrid: Supabase Auth (real) + localStorage demo (fallback)
   Default demo credentials:
     Admin    → admin@gmail.com / admin
     Customer → any email + any password (≥1 char)
   ============================================================ */

const NOIR_SESSION_KEY = 'NOIR_SESSION';

const NOIR_DEMO_ADMIN = {
  email: 'admin@gmail.com',
  password: 'admin',
  role: 'admin',
  name: 'Store Admin',
};

/* ============================================================
   DETECT SUPABASE
   ============================================================ */
function noirHasAuth() {
  return typeof window.db !== 'undefined'
    && window.db
    && window.db.auth
    && typeof window.db.auth.signInWithPassword === 'function';
}

/* ============================================================
   SESSION (localStorage cache — always used for UI)
   ============================================================ */
function noirGetSession() {
  try {
    const raw = localStorage.getItem(NOIR_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function noirSetSession(session) {
  try {
    localStorage.setItem(NOIR_SESSION_KEY, JSON.stringify(session));
  } catch (e) {}
  if (typeof noirUpdateHeaderUI === 'function') noirUpdateHeaderUI();
}

function noirClearSession() {
  try { localStorage.removeItem(NOIR_SESSION_KEY); } catch (e) {}
  if (typeof noirUpdateHeaderUI === 'function') noirUpdateHeaderUI();
}

/* ============================================================
   LOGIN (async — supports both modes)
   Returns: Promise<{ ok, session?, error?, redirect? }>
   ============================================================ */
async function noirLogin(email, password) {
  const e = String(email || '').trim().toLowerCase();
  const p = String(password || '');

  if (!e || !p) {
    return { ok: false, error: 'Enter both email and password.' };
  }

  // -------- Mode 1: Supabase Auth (real) --------
  if (noirHasAuth()) {
    try {
      // Try sign in
      let { data, error } = await window.db.auth.signInWithPassword({
        email: e,
        password: p,
      });

      // If user doesn't exist → auto-sign-up (demo convenience)
      if (error && /invalid login credentials/i.test(error.message)) {
        const signUp = await window.db.auth.signUp({ email: e, password: p });
        if (signUp.error) {
          return { ok: false, error: signUp.error.message };
        }
        data = signUp.data;
        // If email confirmation is required, Supabase won't return a session
        if (!data.session) {
          return {
            ok: false,
            error: 'Check your email to confirm the account, then sign in.',
          };
        }
      } else if (error) {
        return { ok: false, error: error.message };
      }

      // Determine role — admin email gets admin
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

      return {
        ok: true,
        session,
        redirect: role === 'admin' ? 'admin.html' : 'account.html',
      };
    } catch (err) {
      console.error('[auth] Supabase login error:', err);
      return { ok: false, error: 'Login failed. Please try again.' };
    }
  }

  // -------- Mode 2: Demo localStorage (fallback) --------
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

/* ============================================================
   LOGOUT
   ============================================================ */
async function noirLogout(redirect) {
  if (redirect === undefined) redirect = 'index.html';

  // Sign out from Supabase too (best-effort)
  if (noirHasAuth()) {
    try { await window.db.auth.signOut(); } catch (e) {}
  }

  noirClearSession();
  if (typeof showToast === 'function') showToast('Signed out.');
  if (redirect) {
    setTimeout(() => { window.location.href = redirect; }, 400);
  }
}

/* ============================================================
   GUARD
   ============================================================ */
function noirRequireRole(role) {
  const s = noirGetSession();
  if (!s || (role && s.role !== role)) {
    const back = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
    window.location.href = 'login.html?next=' + back + (role === 'admin' ? '&role=admin' : '');
    return null;
  }
  return s;
}

/* ============================================================
   HEADER UI (account button state)
   ============================================================ */
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

/* ============================================================
   LOGIN PAGE FORM HANDLER
   ============================================================ */
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
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in…';
    }
    if (errorEl) errorEl.style.display = 'none';

    const result = await noirLogin(data.get('email'), data.get('password'));

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    }

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

/* ============================================================
   EXPORTS
   ============================================================ */
window.noirGetSession = noirGetSession;
window.noirSetSession = noirSetSession;
window.noirClearSession = noirClearSession;
window.noirLogin = noirLogin;
window.noirLogout = noirLogout;
window.noirRequireRole = noirRequireRole;
window.noirUpdateHeaderUI = noirUpdateHeaderUI;