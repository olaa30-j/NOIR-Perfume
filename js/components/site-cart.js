/* ============================================================
   NOIR — <site-cart> custom element
   Works with cart.js (one-row-per-user, items jsonb)
   Supports products AND bundles per line.
   ============================================================ */

class SiteCart extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="drawer-backdrop hidden" data-cart-backdrop></div>
      <aside class="cart-drawer" aria-label="Shopping bag" aria-hidden="true" role="dialog">
        <div class="drawer-header">
          <div>
            <p class="eyebrow" data-i18n="cart.eyebrow">Your selection</p>
            <h2 data-i18n="cart.title">Shopping bag</h2>
          </div>
          <button class="icon-button" data-cart-close aria-label="Close">×</button>
        </div>
        <div class="cart-items" data-cart-items></div>
        <div class="cart-footer" data-cart-footer></div>
      </aside>
    `;

    /* --- basic bindings --- */
    this.querySelector('[data-cart-close]').addEventListener('click', () => this.close());
    this.querySelector('[data-cart-backdrop]').addEventListener('click', () => this.close());
    this.addEventListener('click', (e) => {
      if (e.target.closest('[data-checkout]')) { this.close(); this._openCheckout(); }
      else if (e.target.closest('[data-cart-link]')) this.close();
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
    window.addEventListener('noir:settings-ready', this._onCartUpdate);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKey);
    window.removeEventListener('noir:cart-updated', this._onCartUpdate);
    window.removeEventListener('noir:data-ready', this._onCartUpdate);
    window.removeEventListener('noir:language', this._onCartUpdate);
    window.removeEventListener('noir:settings-ready', this._onCartUpdate);
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
     Render (products + bundles) — shared markup lives in noirBagLinesHTML
     ============================================================ */
  render() {
    const itemsEl = this.querySelector('[data-cart-items]');
    const footerEl = this.querySelector('[data-cart-footer]');
    if (!itemsEl || !footerEl) return;
    const html = window.noirBagHTML ? window.noirBagHTML({ variant: 'drawer' }) : { items: '', footer: '' };
    itemsEl.innerHTML = html.items;
    footerEl.innerHTML = html.footer;
    footerEl.hidden = !html.hasItems;
    if (typeof window.noirTranslate === 'function') window.noirTranslate();
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