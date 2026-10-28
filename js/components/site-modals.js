/* ============================================================
   NOIR — <site-modals> custom element
   - Provides product-modal + checkout-modal
   - Delegates checkout submission to cart.js (#checkout-form)
   - Updates the total on open / on 'noir:cart-updated'
   - No localStorage anywhere
   ============================================================ */

class SiteModals extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <dialog class="modal product-modal" id="product-modal">
        <button class="modal-close" data-close="product-modal" aria-label="Close">×</button>
        <div id="product-detail"></div>
      </dialog>

      <dialog class="modal checkout-modal" id="checkout-modal">
        <button class="modal-close" data-close="checkout-modal" aria-label="Close">×</button>
        <p class="eyebrow">Almost yours</p>
        <h2>Checkout</h2>
        <p class="modal-description">Enter your details to place your order.</p>

        <form id="checkout-form" class="checkout-form" autocomplete="on">
          <label>Full name
            <input name="name" required placeholder="Your name" autocomplete="name">
          </label>
          <label>Email address
            <input name="email" type="email" required placeholder="you@example.com" autocomplete="email">
          </label>
          <label>Delivery address
            <textarea name="address" required rows="3"
                      placeholder="Street, city, country"
                      autocomplete="street-address"></textarea>
          </label>

          <div class="subtotal">
            <span>Total</span>
            <strong data-checkout-total>$0.00</strong>
          </div>

          <button class="button button-gold button-full" type="submit">Place order</button>
        </form>
      </dialog>
    `;

    /* ---- close buttons ---- */
    this.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => this.close(btn.dataset.close));
    });

    /* ---- click-outside closes ---- */
    this.querySelectorAll('dialog').forEach(dlg => {
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) dlg.close();
      });
    });

    /* ---- keep total in sync ---- */
    this._onCartUpdate = () => this._refreshTotal();
    window.addEventListener('noir:cart-updated', this._onCartUpdate);
    window.addEventListener('noir:data-ready', this._onCartUpdate);
    window.addEventListener('noir:auth-changed', this._onCartUpdate);

    /* ---- initial total ---- */
    this._refreshTotal();

    /* NOTE:
       The submit handler for #checkout-form lives in cart.js.
       We intentionally do NOT attach another submit listener here
       to avoid double-processing the order.
    */
  }

  disconnectedCallback() {
    window.removeEventListener('noir:cart-updated', this._onCartUpdate);
    window.removeEventListener('noir:data-ready', this._onCartUpdate);
    window.removeEventListener('noir:auth-changed', this._onCartUpdate);
  }

  /* ============================================================
     Total
     ============================================================ */
  _refreshTotal() {
    const el = this.querySelector('[data-checkout-total]');
    if (!el) return;

    let total = 0;
    try {
      if (typeof window.getCartSubtotal === 'function') {
        total = Number(window.getCartSubtotal()) || 0;
      } else if (typeof window.cartSubtotal === 'function') {
        total = Number(window.cartSubtotal()) || 0;
      }
    } catch (e) { /* ignore */ }

    el.textContent = '$' + total.toFixed(2);
  }

  /* ============================================================
     Open / close
     ============================================================ */
  open(id) {
    const dlg = this.querySelector('#' + id);
    if (!dlg) return;

    // refresh total right before opening checkout
    if (id === 'checkout-modal') this._refreshTotal();

    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');

    document.body.style.overflow = 'hidden';
  }

  close(id) {
    const dlg = this.querySelector('#' + id);
    if (!dlg) return;

    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');

    document.body.style.overflow = '';
  }
}

customElements.define('site-modals', SiteModals);