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

    this.querySelector('[data-cart-close]').addEventListener('click', () => this.close());
    this.querySelector('[data-cart-backdrop]').addEventListener('click', () => this.close());
    this.querySelector('[data-checkout]').addEventListener('click', () => {
      this.close();
      this.closest('noir-layout')?.querySelector('site-modals')?.open('checkout-modal');
    });

    this._onKey = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._onKey);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKey);
  }

  open() {
    this.querySelector('.cart-drawer').classList.add('open');
    this.querySelector('.cart-drawer').setAttribute('aria-hidden', 'false');
    this.querySelector('[data-cart-backdrop]').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.querySelector('.cart-drawer').classList.remove('open');
    this.querySelector('.cart-drawer').setAttribute('aria-hidden', 'true');
    this.querySelector('[data-cart-backdrop]').classList.add('hidden');
    document.body.style.overflow = '';
  }
}
customElements.define('site-cart', SiteCart);