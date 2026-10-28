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

    // --- روابط أساسية ---
    this.querySelector('[data-cart-close]').addEventListener('click', () => this.close());
    this.querySelector('[data-cart-backdrop]').addEventListener('click', () => this.close());
    this.querySelector('[data-checkout]').addEventListener('click', () => {
      this.close();
      this._openCheckout();
    });

    // --- ESC ---
    this._onKey = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._onKey);

    // --- رندر أولي ---
    this.render();
    this._syncHeaderCount();

    // --- استماع للتحديثات ---
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
     فتح checkout-modal
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

    // لو لسه مش موجودة، استنى
    customElements.whenDefined('site-modals').then(() => {
      if (!tryOpen()) {
        // fallback: دور على <dialog id="checkout-modal">
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
     تحديث العدد في الهيدر
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
    } catch (e) { }

    // حدّث كل الـ badges (ممكن يكون فيه أكتر من واحد)
    document.querySelectorAll('#cart-count, .cart-count').forEach(el => {
      el.textContent = count;
      el.classList.toggle('hidden', count === 0);
      el.classList.toggle('is-empty', count === 0);
    });
  }

  /* ============================================================
     رندر محتوى السلة
     ============================================================ */
  render() {
    const itemsEl = this.querySelector('[data-cart-items]');
    const subtotalEl = this.querySelector('[data-cart-subtotal]');
    if (!itemsEl) return;

    const cart =
      (typeof window.getCartItems === 'function' && window.getCartItems()) ||
      (typeof window.noirCart !== 'undefined' && window.noirCart.items) ||
      (typeof window.cart !== 'undefined' && window.cart.items) ||
      [];

    let subtotal = 0;
    const lines = itemsEl;

    if (!Array.isArray(cart) || cart.length === 0) {
      lines.innerHTML = `
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

    lines.innerHTML = cart.map((line) => {
      const product = line.product || line;
      const qty = Number(line.qty ?? line.quantity ?? 1) || 1;

      let unit = 0;
      try {
        unit = (typeof window.noirComputePrice === 'function')
          ? window.noirComputePrice(product)
          : Number(product.price) || 0;
      } catch (e) {
        unit = Number(product.price) || 0;
      }

      const lineTotal = unit * qty;
      subtotal += lineTotal;

      const name = esc(product.name || 'Product');
      const category = esc(product.category || '');
      const bottle = esc(product.bottle || '');
      const id = product.id ?? line.id ?? '';

      return `
        <div class="cart-line" data-line-id="${id}">
          <div class="cart-line-visual">
            <div class="product-bottle ${bottle}"></div>
          </div>
          <div class="cart-line-info">
            <p class="product-category">${category}</p>
            <h3>${name}</h3>
            <p class="cart-line-price">
              $${unit.toFixed(2)} × ${qty} = <strong>$${lineTotal.toFixed(2)}</strong>
            </p>
            <div class="cart-line-actions">
              <button class="qty-btn" data-cart-dec="${id}" aria-label="Decrease quantity">−</button>
              <span class="qty-val">${qty}</span>
              <button class="qty-btn" data-cart-inc="${id}" aria-label="Increase quantity">+</button>
              <button class="remove-btn" data-cart-remove="${id}" aria-label="Remove">Remove</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;

    // --- ربط الأزرار ---
    lines.querySelectorAll('[data-cart-inc]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.cartInc);
        if (typeof window.addToCart === 'function') {
          await window.addToCart(id, 1);
        } else if (typeof window.setCartQty === 'function') {
          const line = cart.find(x => Number(x.id ?? x.product?.id) === id);
          const current = line ? Number(line.qty ?? 1) : 1;
          await window.setCartQty(id, current + 1);
        }
        this.render();
        this._syncHeaderCount();
      });
    });

    lines.querySelectorAll('[data-cart-dec]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.cartDec);
        if (typeof window.updateCartQty === 'function') {
          await window.updateCartQty(id, -1);
        } else if (typeof window.addToCart === 'function') {
          await window.addToCart(id, -1);
        }
        this.render();
        this._syncHeaderCount();
      });
    });

    lines.querySelectorAll('[data-cart-remove]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.cartRemove);
        if (typeof window.removeFromCart === 'function') {
          await window.removeFromCart(id);
        }
        this.render();
        this._syncHeaderCount();
      });
    });
  }

  /* ============================================================
     فتح / إغلاق (بسيط — يعتمد على CSS)
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