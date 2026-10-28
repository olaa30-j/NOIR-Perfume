/* ============================================================
   NOIR — Authentication (Supabase only) — DEBUG EDITION
   No demo / no localStorage fallback.
   Role & name are read from the `customers` table ONLY.
   user_metadata is used for `name` only (never for role).
   ============================================================ */

/* ---------- DEBUG LOGGER ---------- */
const NOIR_DEBUG = true;

function noirLog(...args) {
  if (NOIR_DEBUG) console.log('%c[NOIR AUTH]', 'color:#c89b55;font-weight:bold', ...args);
}
function noirWarn(...args) {
  if (NOIR_DEBUG) console.warn('%c[NOIR AUTH]', 'color:#e0a800;font-weight:bold', ...args);
}
function noirError(...args) {
  console.error('%c[NOIR AUTH]', 'color:#e05252;font-weight:bold', ...args);
}

/* ---------- SUPABASE AUTH CHECK ---------- */
function noirHasAuth() {
  const ok = typeof window.db !== 'undefined'
    && window.db
    && window.db.auth
    && typeof window.db.auth.signInWithPassword === 'function';
  noirLog('noirHasAuth() →', ok, '| window.db:', !!window.db, '| window.db.auth:', !!(window.db && window.db.auth));
  return ok;
}

/* ---------- CUSTOMER PROFILE LOOKUP ---------- */
async function noirFetchCustomerProfile(userId, email) {
  if (!window.db || !window.db.from) {
    noirWarn('noirFetchCustomerProfile: Supabase client missing .from()');
    return null;
  }

  try {
    noirLog('Fetching customer profile for userId:', userId);
    const { data, error } = await window.db
      .from('customers')
      .select('role, name, email')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      noirError('customers lookup error:', error.message);
      return null;
    }
    if (!data) {
      noirWarn('No customers row found for userId:', userId, '— defaulting to customer');
      return null;
    }

    noirLog('customers row →', data);
    return {
      role: data.role || 'customer',
      name: data.name || (email || '').split('@')[0] || 'Customer',
    };
  } catch (e) {
    noirError('noirFetchCustomerProfile exception:', e);
    return null;
  }
}

/* ---------- BUILD SESSION ---------- */
async function noirBuildSession(user) {
  const email = user.email || '';
  const metaName = user.user_metadata?.name;

  let role = 'customer';
  let name = metaName || email.split('@')[0] || 'Customer';
  let source = 'defaults';

  const profile = await noirFetchCustomerProfile(user.id, email);
  if (profile) {
    role = profile.role;
    name = profile.name;
    source = 'customers_table';
  } else {
    noirWarn('noirBuildSession: no customers row — defaulting to customer (ignoring any metadata role)');
    source = 'defaults_no_row';
  }

  noirLog('noirBuildSession →', { email, role, name, source });

  return {
    email,
    role,
    name,
    userId: user.id,
    source,
    at: Date.now(),
  };
}

/* ---------- GET SESSION ---------- */
async function noirGetSession() {
  noirLog('noirGetSession() start');

  if (!noirHasAuth()) {
    noirWarn('noirGetSession() aborted: Supabase auth not available');
    return null;
  }

  try {
    const { data, error } = await window.db.auth.getSession();
    noirLog('getSession() raw →', { hasSession: !!(data && data.session), error });

    if (error) {
      noirError('getSession() error:', error.message);
      return null;
    }
    if (!data || !data.session) {
      noirLog('noirGetSession() → null (no active session)');
      return null;
    }

    const session = await noirBuildSession(data.session.user);
    noirLog('noirGetSession() →', session);
    return session;
  } catch (e) {
    noirError('noirGetSession() exception:', e);
    return null;
  }
}

/* ---------- LOGIN ---------- */
async function noirLogin(email, password) {
  const e = String(email || '').trim().toLowerCase();
  const p = String(password || '');

  noirLog('noirLogin() called with:', { email: e, passwordLength: p.length });

  if (!e || !p) {
    noirWarn('noirLogin() missing email or password');
    return { ok: false, error: 'Enter both email and password.' };
  }

  if (!noirHasAuth()) {
    noirError('noirLogin() aborted: Supabase auth not available');
    return { ok: false, error: 'Authentication service is not available.' };
  }

  try {
    noirLog('Calling signInWithPassword…');
    const { data, error } = await window.db.auth.signInWithPassword({ email: e, password: p });
    noirLog('signInWithPassword() response →', { hasSession: !!(data && data.session), error });

    if (error) {
      noirError('signInWithPassword() error:', error.message);
      return { ok: false, error: error?.message || 'Invalid email or password.' };
    }
    if (!data || !data.session) {
      noirError('signInWithPassword() returned no session');
      return { ok: false, error: 'Sign-in failed. Please try again.' };
    }

    const session = await noirBuildSession(data.session.user);

    const params = new URLSearchParams(location.search);
    const forcedRole = params.get('role');
    const next = params.get('next');

    noirLog('URL params →', { forcedRole, next });

    if (forcedRole === 'admin' && session.role !== 'admin') {
      noirWarn('Role mismatch: forcedRole=admin but role=' + session.role + ' → signing out');
      try { await window.db.auth.signOut(); } catch (_) {}
      return { ok: false, error: 'Admin access requires an admin account.' };
    }

    const redirect = next || (session.role === 'admin' ? 'admin.html' : 'account.html');
    noirLog('Login success → redirect:', redirect);

    return { ok: true, session, redirect };
  } catch (err) {
    noirError('noirLogin() exception:', err);
    return { ok: false, error: 'Login failed: ' + (err?.message || 'Unknown error') };
  }
}

/* ---------- SIGN UP ---------- */
async function noirSignUp({ name, email, password, passwordConfirm }) {
  const n = String(name || '').trim();
  const e = String(email || '').trim().toLowerCase();
  const p = String(password || '');
  const pc = String(passwordConfirm || '');

  noirLog('noirSignUp() called with:', { name: n, email: e, passwordLength: p.length });

  if (!n || !e || !p) return { ok: false, error: 'Please fill in all fields.' };
  if (p.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
  if (p !== pc)     return { ok: false, error: 'Passwords do not match.' };
  if (!noirHasAuth()) return { ok: false, error: 'Authentication service is not available.' };

  try {
    noirLog('Calling signUp…', { email: e, name: n });
    const { data, error } = await window.db.auth.signUp({
      email: e,
      password: p,
      options: { data: { name: n } },
    });

    noirLog('signUp() response →', {
      hasSession: !!(data && data.session),
      hasUser: !!(data && data.user),
      error,
    });

    if (error) {
      noirError('signUp() error:', error.message);
      return { ok: false, error: error.message };
    }

    if (data && data.session) {
      const session = await noirBuildSession(data.session.user);
      noirLog('Sign-up + auto-login →', session);
      return { ok: true, session, redirect: 'account.html' };
    }

    noirLog('Sign-up succeeded — email confirmation required');
    return {
      ok: true,
      needsConfirmation: true,
      message: 'Account created! Check your email to confirm before signing in.',
    };
  } catch (err) {
    noirError('noirSignUp() exception:', err);
    return { ok: false, error: 'Sign-up failed: ' + (err?.message || 'Unknown error') };
  }
}

/* ---------- LOGOUT ---------- */
async function noirLogout(redirect) {
  if (redirect === undefined) redirect = 'index.html';
  noirLog('noirLogout() called → redirect:', redirect);

  if (noirHasAuth()) {
    try {
      await window.db.auth.signOut();
      noirLog('signOut() done');
    } catch (e) {
      noirWarn('signOut() failed:', e);
    }
  }

  if (typeof showToast === 'function') showToast('Signed out.');
  if (redirect) {
    setTimeout(() => {
      noirLog('Redirecting to', redirect);
      window.location.href = redirect;
    }, 400);
  }
}

/* ---------- GUARD ---------- */
async function noirRequireRole(role) {
  noirLog('noirRequireRole() required role:', role);
  const s = await noirGetSession();

  if (!s || (role && s.role !== role)) {
    noirWarn('noirRequireRole() DENIED', { session: s, required: role });
    const back = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
    const url = 'login.html?next=' + back + (role === 'admin' ? '&role=admin' : '');
    noirLog('Redirecting to:', url);
    window.location.href = url;
    return null;
  }

  noirLog('noirRequireRole() GRANTED →', s);
  return s;
}

/* ---------- HEADER UI ---------- */
async function noirUpdateHeaderUI() {
  const btn = document.getElementById('account-button');
  if (!btn) {
    noirLog('noirUpdateHeaderUI() skipped: #account-button not found');
    return;
  }

  const s = await noirGetSession();
  if (s) {
    btn.setAttribute('aria-label', 'Account: ' + s.name + ' (' + s.role + '). Click to open.');
    btn.title = s.name + ' · ' + s.role;
    btn.dataset.loggedIn = 'true';
    btn.dataset.role = s.role;
    noirLog('Header UI → logged in:', s.name, '(' + s.role + ')');
  } else {
    btn.setAttribute('aria-label', 'Open account');
    btn.title = 'Sign in';
    delete btn.dataset.loggedIn;
    delete btn.dataset.role;
    noirLog('Header UI → signed out');
  }
}

/* ---------- LOGIN PAGE HANDLER ---------- */
document.addEventListener('DOMContentLoaded', async function () {
  noirLog('DOMContentLoaded — auth.js ready');

  try {
    await noirUpdateHeaderUI();
  } catch (e) {
    noirError('noirUpdateHeaderUI() failed:', e);
  }

  const form = document.getElementById('login-form');
  if (!form) {
    noirLog('No #login-form on this page — skipping login handler');
    return;
  }

  noirLog('Login form found — wiring handlers');

  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  const forcedRole = params.get('role');
  const hint = document.getElementById('login-hint');
  const errorEl = document.getElementById('login-error');

  noirLog('Login page params →', { next, forcedRole });

  if (forcedRole === 'admin' && hint) {
    hint.innerHTML = 'Admin studio requires an admin account.';
  }

  const existing = await noirGetSession();
  if (existing && hint) {
    noirLog('Existing session found →', existing);
    hint.innerHTML =
      'You are signed in as <strong>' + existing.name + '</strong> (' + existing.role + '). ' +
      '<a href="#" id="login-signout" style="color:var(--gold-light);text-decoration:underline">Sign out</a> to switch.';
    const so = document.getElementById('login-signout');
    if (so) {
      so.addEventListener('click', async function (e) {
        e.preventDefault();
        noirLog('Sign-out link clicked');
        await noirLogout(null);
        setTimeout(() => location.reload(), 400);
      });
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    noirLog('Login form submitted');

    const data = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in…'; }
    if (errorEl) errorEl.style.display = 'none';

    const result = await noirLogin(data.get('email'), data.get('password'));

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign in'; }

    if (!result.ok) {
      noirWarn('Login failed →', result.error);
      if (errorEl) {
        errorEl.textContent = result.error;
        errorEl.style.display = 'block';
      }
      return;
    }

    noirLog('Login OK →', result.session);
    if (typeof showToast === 'function') {
      showToast(result.session.role === 'admin' ? 'Signed in as admin.' : 'Signed in.');
    }
    const dest = next || result.redirect;
    noirLog('Redirecting to', dest);
    setTimeout(() => { window.location.href = dest; }, 350);
  });
});

/* ---------- TABS + SIGN-UP FORM ---------- */
document.addEventListener('DOMContentLoaded', function () {
  const tabs = document.querySelectorAll('.auth-tab');
  const panels = {
    signin: document.getElementById('login-form'),
    signup: document.getElementById('signup-form'),
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      tabs.forEach(t => {
        const active = t.dataset.mode === mode;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      Object.entries(panels).forEach(([key, panel]) => {
        if (!panel) return;
        panel.classList.toggle('hidden', key !== mode);
      });
      ['login-error', 'signup-error', 'signup-info'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      noirLog('Auth tab switched →', mode);
    });
  });

  const signupForm = document.getElementById('signup-form');
  if (!signupForm) {
    noirLog('No #signup-form on this page — skipping sign-up handler');
    return;
  }

  const signupError = document.getElementById('signup-error');
  const signupInfo  = document.getElementById('signup-info');

  function showError(msg) {
    if (signupInfo) signupInfo.style.display = 'none';
    if (signupError) {
      signupError.textContent = msg;
      signupError.style.display = 'block';
    }
    noirWarn('Sign-up error:', msg);
  }
  function showInfo(msg) {
    if (signupError) signupError.style.display = 'none';
    if (signupInfo) {
      signupInfo.textContent = msg;
      signupInfo.style.display = 'block';
    }
    noirLog('Sign-up info:', msg);
  }

  signupForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    noirLog('Sign-up form submitted');

    const data = new FormData(signupForm);
    const submitBtn = signupForm.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating account…'; }

    const result = await noirSignUp({
      name: data.get('name'),
      email: data.get('email'),
      password: data.get('password'),
      passwordConfirm: data.get('passwordConfirm'),
    });

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create account'; }

    if (!result.ok) {
      showError(result.error);
      return;
    }

    if (result.needsConfirmation) {
      showInfo(result.message);
      if (typeof showToast === 'function') showToast('Check your inbox to confirm.');
      return;
    }

    showInfo('Account created. Signing you in…');
    if (typeof showToast === 'function') showToast('Account created 🎉');
    setTimeout(() => { window.location.href = result.redirect || 'account.html'; }, 600);
  });
});

/* ---------- EXPORTS ---------- */
window.noirLog = noirLog;
window.noirWarn = noirWarn;
window.noirError = noirError;
window.noirHasAuth = noirHasAuth;
window.noirGetSession = noirGetSession;
window.noirLogin = noirLogin;
window.noirSignUp = noirSignUp;
window.noirLogout = noirLogout;
window.noirRequireRole = noirRequireRole;
window.noirUpdateHeaderUI = noirUpdateHeaderUI;
window.noirBuildSession = noirBuildSession;
window.noirFetchCustomerProfile = noirFetchCustomerProfile;

/* ---------- BOOT DIAGNOSTICS (no localStorage) ---------- */
window.addEventListener('load', async () => {
  noirLog('=== BOOT DIAGNOSTICS ===');
  noirLog('window.db present:', !!window.db);
  noirLog('window.db.auth present:', !!(window.db && window.db.auth));
  noirLog('noirHasAuth():', noirHasAuth());
  noirLog('Current URL:', location.href);

  if (noirHasAuth()) {
    try {
      const { data: sess } = await window.db.auth.getSession();
      if (sess?.session?.user) {
        const uid = sess.session.user.id;
        noirLog('Diagnostics — checking customers table for userId:', uid);
        const { data, error } = await window.db
          .from('customers')
          .select('role, name, email')
          .eq('user_id', uid)
          .maybeSingle();
        if (error) noirError('customers diag error:', error.message);
        else noirLog('customers diag row:', data);
      } else {
        noirLog('Diagnostics — no active session (skip customers check)');
      }
    } catch (e) {
      noirWarn('Diagnostics customers check failed:', e);
    }
  }
  noirLog('========================');
});