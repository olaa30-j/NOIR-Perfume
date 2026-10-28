class SiteHeader extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="announcement">
        <span>Complimentary delivery on orders over $99</span>
        <span class="announcement-ar" lang="ar">توصيل مجاني للطلبات فوق ٩٩ دولار</span>
      </div>
      <header class="site-header">
        <a class="brand" href="index.html" aria-label="NOIR home">
          <span>NOIR</span><small>ARABIAN PERFUMES</small>
        </a>
        <button class="icon-button menu-toggle" id="menu-toggle"
                aria-label="Toggle navigation" aria-expanded="false">☰</button>
        <nav class="main-nav" id="main-nav" aria-label="Main navigation">
          <a href="index.html" data-i18n="nav.home">Home</a>
          <a href="shop.html" data-i18n="nav.shop">Shop</a>
          <a href="collections.html" data-i18n="nav.collections">Collections</a>
          <a href="story.html" data-i18n="nav.story">Our story</a>
        </nav>
        <div class="header-actions">
          <button class="icon-button" id="search-toggle" aria-label="Search products">⌕</button>

          <button class="icon-button" id="account-button" aria-label="Open account">
            <span id="account-icon">♙</span>
            <span id="account-badge" class="account-badge hidden"></span>
          </button>

          <button class="icon-button cart-trigger" id="cart-open" aria-label="Open shopping bag">
            ♧ <span class="cart-count" id="cart-count">0</span>
          </button>

          <button class="icon-button checkout-quick hidden" id="checkout-quick"
                  aria-label="Quick checkout" title="Checkout">→</button>
        </div>
      </header>
    `;

    // --- المنيو ---
    this.querySelector('#menu-toggle').addEventListener('click', (e) => {
      const nav = this.querySelector('#main-nav');
      const open = nav.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', String(open));
    });

    // --- فتح السلة ---
    this.querySelector('#cart-open').addEventListener('click', () => {
      this._openCart();
    });

    // --- زر الحساب ---
    this.querySelector('#account-button').addEventListener('click', async () => {
      const session = await this._getSession();
      if (session) {
        window.location.href = session.role === 'admin' ? 'admin.html' : 'account.html';
      } else {
        window.location.href = 'login.html';
      }
    });

    // --- checkout السريع ---
    this.querySelector('#checkout-quick').addEventListener('click', () => {
      const cart = this._findCart();
      if (cart && typeof cart.open === 'function') cart.open();
      setTimeout(() => {
        const modals = this.closest('noir-layout')?.querySelector('site-modals')
          || document.querySelector('site-modals');
        if (modals && typeof modals.open === 'function') modals.open('checkout-modal');
      }, 200);
    });

    // --- البحث ---
    this.querySelector('#search-toggle').addEventListener('click', () => {
      if (document.getElementById('product-search')) {
        document.getElementById('product-search').focus();
      } else {
        window.location.href = 'shop.html';
      }
    });

    // --- الرابط الحالي ---
    const path = location.pathname.split('/').pop() || 'index.html';
    this.querySelectorAll('#main-nav a').forEach(a => {
      const href = a.getAttribute('href');
      if (href === path) a.setAttribute('aria-current', 'page');
    });

    // --- تحديث السلة ---
    this._onCartUpdate = (e) => {
      const items = (e && e.detail && e.detail.items) || [];
      const count = items.reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
      this.setCartCount(count);
      this._updateCheckoutButton(count);
    };
    window.addEventListener('noir:cart-updated', this._onCartUpdate);

    // --- تحديث الحساب ---
    this._onAuthChanged = () => this.updateAccountUI();
    window.addEventListener('noir:auth-changed', this._onAuthChanged);
    window.addEventListener('noir:session-ready', this._onAuthChanged);
    if (window.db && window.db.auth && window.db.auth.onAuthStateChange) {
      this._authSub = window.db.auth.onAuthStateChange(() => {
        this.updateAccountUI();
      });
    }

    // --- تحديث أولي ---
    this._initialUpdate();
  }

  disconnectedCallback() {
    window.removeEventListener('noir:cart-updated', this._onCartUpdate);
    window.removeEventListener('noir:auth-changed', this._onAuthChanged);
    window.removeEventListener('noir:session-ready', this._onAuthChanged);
    if (this._authSub && this._authSub.data && this._authSub.data.subscription) {
      try { this._authSub.data.subscription.unsubscribe(); } catch (e) { }
    }
  }

  /* ============================================================
     CART: find + open
     ============================================================ */
  _findCart() {
    return this.closest('noir-layout')?.querySelector('site-cart')
      || document.querySelector('noir-layout site-cart')
      || document.querySelector('site-cart')
      || null;
  }

  _openCart() {
    const cart = this._findCart();

    if (!cart) {
      // استنى noir-layout
      if (customElements.get('noir-layout')) {
        setTimeout(() => {
          const c = this._findCart();
          if (c) this._doOpen(c);
          else console.warn('[header] site-cart not found');
        }, 100);
      } else {
        customElements.whenDefined('noir-layout').then(() => {
          setTimeout(() => {
            const c = this._findCart();
            if (c) this._doOpen(c);
          }, 50);
        });
      }
      return;
    }

    this._doOpen(cart);
  }

  _doOpen(cart) {
    if (typeof cart.open === 'function') {
      cart.open();
      return;
    }
    if (!customElements.get('site-cart')) {
      customElements.whenDefined('site-cart').then(() => {
        if (typeof cart.open === 'function') cart.open();
        else this._manualOpen(cart);
      });
      return;
    }
    this._manualOpen(cart);
  }

  _manualOpen(cart) {
    const drawer = cart.querySelector('.cart-drawer');
    const backdrop = cart.querySelector('[data-cart-backdrop]');
    if (drawer) {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
    }
    if (backdrop) backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (typeof cart.render === 'function') cart.render();
  }

  /* ============================================================
     ACCOUNT: session + UI
     ============================================================ */
  async _getSession() {
    if (typeof window.noirGetSession === 'function') {
      try {
        const s = await window.noirGetSession();
        if (s) {
          return {
            user: s.user || s,
            role: s.role || s.user?.role || null,
          };
        }
      } catch (e) { /* ignore */ }
    }
    if (window.db && window.db.auth) {
      try {
        const { data } = await window.db.auth.getUser();
        const user = data?.user;
        if (user) {
          return {
            user,
            role: user.app_metadata?.role || user.user_metadata?.role || null,
          };
        }
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  async _initialUpdate() {
    let count = 0;
    try {
      if (typeof window.getCartCount === 'function') {
        count = Number(window.getCartCount()) || 0;
      } else if (typeof window.getCartItems === 'function') {
        const items = window.getCartItems() || [];
        count = items.reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
      }
    } catch (e) { }
    this.setCartCount(count);
    this._updateCheckoutButton(count);

    await this.updateAccountUI();
  }

  async updateAccountUI() {
    const session = await this._getSession();
    const iconEl = this.querySelector('#account-icon');
    const badgeEl = this.querySelector('#account-badge');
    const accountBtn = this.querySelector('#account-button');

    if (session) {
      const isAdmin = session.role === 'admin';
      if (iconEl) iconEl.textContent = isAdmin ? '🛡' : '👤';
      if (accountBtn) {
        accountBtn.setAttribute('aria-label', isAdmin ? 'Open admin panel' : 'Open account');
        accountBtn.classList.add('is-logged-in');
      }
      if (badgeEl) {
        badgeEl.classList.remove('hidden');
        badgeEl.classList.toggle('is-admin', isAdmin);
        badgeEl.textContent = '';
      }
    } else {
      if (iconEl) iconEl.textContent = '♙';
      if (accountBtn) {
        accountBtn.setAttribute('aria-label', 'Log in');
        accountBtn.classList.remove('is-logged-in');
      }
      if (badgeEl) badgeEl.classList.add('hidden');
    }

    // ✅ تحديث زر checkout حسب الحالة
    this._updateCheckoutButton(
      typeof window.getCartCount === 'function' ? window.getCartCount() : 0,
      !!session
    );
  }

  _updateCheckoutButton(count, isLoggedIn) {
    const btn = this.querySelector('#checkout-quick');
    if (!btn) return;

    // لو isLoggedIn مش محدد، خليه null (يظهر لو فيه منتجات بس)
    const hasItems = Number(count) > 0;

    if (isLoggedIn === undefined) {
      // fallback: اعتمد على وجود badge الحساب
      const badge = this.querySelector('#account-badge');
      isLoggedIn = badge && !badge.classList.contains('hidden');
    }

    const show = hasItems && isLoggedIn;
    btn.classList.toggle('hidden', !show);
  }

  setCartCount(n) {
    const el = this.querySelector('#cart-count');
    if (!el) return;
    const count = Number(n) || 0;
    el.textContent = count;
    el.classList.toggle('hidden', count === 0);
    el.classList.toggle('is-empty', count === 0);
  }
}

customElements.define('site-header', SiteHeader);