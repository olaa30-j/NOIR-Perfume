/* ============================================================
   NOIR — <site-cart> custom element
   Works with cart.js (one-row-per-user, items jsonb)
   Supports products AND bundles per line.
   ============================================================ */

class SiteCart extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="drawer-backdrop hidden" data-cart-backdrop></div>
      <aside class="cart-drawer" aria-label="Shopping bag" aria-hidden="true">
        <div class="drawer-header">
          <div>
            <p class="eyebrow">Your selection</p>
            <h2 data-i18n="cart.title">Shopping bag</h2>
          </div>
          <button class="icon-button" data-cart-close aria-label="Close">×</button>
        </div>
        <div class="cart-items" data-cart-items></div>
        <div class="cart-footer">
          <div class="subtotal">
            <span data-i18n="cart.subtotal">Subtotal</span>
            <strong data-cart-subtotal>$0.00</strong>
          </div>
          <p class="small-note">Shipping and taxes calculated at checkout.</p>
          <button class="button button-gold button-full" data-checkout
                  data-i18n="cart.checkout">Continue to checkout →</button>
        </div>
      </aside>
    `;

    /* --- basic bindings --- */
    this.querySelector('[data-cart-close]').addEventListener('click', () => this.close());
    this.querySelector('[data-cart-backdrop]').addEventListener('click', () => this.close());
    this.querySelector('[data-checkout]').addEventListener('click', () => {
      this.close();
      this._openCheckout();
    });

    /* --- ESC --- */
    this._onKey = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._onKey);

    /* --- initial render --- */
    this.render();
    this._syncHeaderCount();

    /* --- listen for updates --- */
    this._onCartUpdate = () => {
      this.render();
      this._syncHeaderCount();
    };
    window.addEventListener('noir:cart-updated', this._onCartUpdate);
    window.addEventListener('noir:data-ready', this._onCartUpdate);
    window.addEventListener('noir:language', this._onCartUpdate);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKey);
    window.removeEventListener('noir:cart-updated', this._onCartUpdate);
    window.removeEventListener('noir:data-ready', this._onCartUpdate);
    window.removeEventListener('noir:language', this._onCartUpdate);
  }

  /* ============================================================
     Checkout modal
     ============================================================ */
  _openCheckout() {
    const tryOpen = () => {
      let modals = this.closest('noir-layout')?.querySelector('site-modals');
      if (!modals) modals = document.querySelector('site-modals');
      if (modals && typeof modals.open === 'function') {
        modals.open('checkout-modal');
        return true;
      }
      return false;
    };

    if (tryOpen()) return;

    customElements.whenDefined('site-modals').then(() => {
      if (!tryOpen()) {
        const dlg = document.getElementById('checkout-modal');
        if (dlg) {
          if (typeof dlg.showModal === 'function') dlg.showModal();
          else dlg.setAttribute('open', '');
        } else {
          console.warn('[cart] checkout-modal not found');
        }
      }
    });
  }

  /* ============================================================
     Header count
     ============================================================ */
  _syncHeaderCount() {
    let count = 0;
    try {
      if (typeof window.getCartCount === 'function') {
        count = Number(window.getCartCount()) || 0;
      } else if (typeof window.getCartItems === 'function') {
        const items = window.getCartItems() || [];
        count = items.reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
      }
    } catch (e) { /* ignore */ }

    document.querySelectorAll('#cart-count, .cart-count').forEach(el => {
      el.textContent = count;
      el.classList.toggle('hidden', count === 0);
      el.classList.toggle('is-empty', count === 0);
    });
  }

  /* ============================================================
     Render (products + bundles)
     ============================================================ */
  render() {
    const itemsEl = this.querySelector('[data-cart-items]');
    const subtotalEl = this.querySelector('[data-cart-subtotal]');
    if (!itemsEl) return;

    const cart =
      (typeof window.getCartItems === 'function' && window.getCartItems()) ||
      (typeof window.noirCart !== 'undefined' && window.noirCart.items) ||
      [];

    if (!Array.isArray(cart) || cart.length === 0) {
      itemsEl.innerHTML = `
        <div class="cart-empty">
          <p>Your bag is empty.</p>
          <a href="shop.html" class="button button-outline" style="margin-top:12px;display:inline-block">
            Browse fragrances →
          </a>
        </div>
      `;
      if (subtotalEl) subtotalEl.textContent = '$0.00';
      return;
    }

    const esc = (typeof window.escapeHTML === 'function')
      ? window.escapeHTML
      : (s) => String(s == null ? '' : s);

    let subtotal = 0;

    itemsEl.innerHTML = cart.map((line) => {
      const type = line.type || 'product';
      const qty = Number(line.qty) || 1;
      const key = `${type}:${line.id}`;

      /* ---- resolve displayed data per type ---- */
      let name = 'Item';
      let category = '';
      let bottle = '';
      let unit = 0;

      if (type === 'bundle') {
        const b = line.bundle || {};
        name = b.name || 'Bundle';
        category = 'Bundle';
        bottle = b.bottle || '';
        unit = Number(b.price) || 0;
      } else {
        const p = line.product || {};
        name = p.name || 'Product';
        category = p.category || '';
        bottle = p.bottle || '';
        try {
          unit = (typeof window.noirComputePrice === 'function')
            ? window.noirComputePrice(p)
            : Number(p.price) || 0;
        } catch (e) {
          unit = Number(p.price) || 0;
        }
      }

      const lineTotal = unit * qty;
      subtotal += lineTotal;

      return `
        <div class="cart-line" data-line-type="${type}" data-line-id="${line.id}">
          <div class="cart-line-visual">
            <div class="product-bottle ${esc(bottle)}"></div>
          </div>
          <div class="cart-line-info">
            <p class="product-category">${esc(category)}</p>
            <h3>${esc(name)}</h3>
            <p class="cart-line-price">
              $${unit.toFixed(2)} × ${qty} = <strong>$${lineTotal.toFixed(2)}</strong>
            </p>
            <div class="cart-line-actions">
              <button class="qty-btn" data-cart-minus="${key}" aria-label="Decrease quantity">−</button>
              <span class="qty-val">${qty}</span>
              <button class="qty-btn" data-cart-plus="${key}" aria-label="Increase quantity">+</button>
              <button class="remove-btn" data-cart-remove="${key}" aria-label="Remove">Remove</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;

    /* ------------------------------------------------------------
       IMPORTANT: do NOT bind click handlers here.
       cart.js already has delegated listeners for
       [data-cart-minus] / [data-cart-plus] / [data-cart-remove]
       that accept "product:12" / "bundle:3".
       ------------------------------------------------------------ */
  }

  /* ============================================================
     Open / close (CSS driven)
     ============================================================ */
  open() {
    const drawer = this.querySelector('.cart-drawer');
    const backdrop = this.querySelector('[data-cart-backdrop]');

    if (drawer) {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
    }
    if (backdrop) {
      backdrop.classList.remove('hidden');
    }
    document.body.style.overflow = 'hidden';
    this.render();
  }

  close() {
    const drawer = this.querySelector('.cart-drawer');
    const backdrop = this.querySelector('[data-cart-backdrop]');

    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) {
      backdrop.classList.add('hidden');
    }
    document.body.style.overflow = '';
  }
}

customElements.define('site-cart', SiteCart);