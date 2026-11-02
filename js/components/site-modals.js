/* ============================================================
   NOIR — <site-modals> custom element
   - Provides product-modal + checkout-modal
   - checkout-modal hosts the multi-step flow from js/checkout.js
   ============================================================ */

class SiteModals extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <dialog class="modal product-modal" id="product-modal">
        <button class="modal-close" data-close="product-modal" aria-label="Close">×</button>
        <div id="product-detail"></div>
      </dialog>

      <dialog class="modal checkout-modal" id="checkout-modal" aria-labelledby="checkout-title">
        <button class="modal-close" data-close="checkout-modal" data-i18n-aria="checkout.close" aria-label="Close">×</button>
        <p class="eyebrow" data-i18n="checkout.eyebrow">Almost yours</p>
        <h2 id="checkout-title" data-co-title>Checkout</h2>
        <div id="checkout-flow"></div>
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

    /* NOTE: the checkout flow itself lives in js/checkout.js (renders into #checkout-flow). */

    /* ---- restore page scroll whenever any dialog closes (Esc, backdrop, button) ---- */
    this.querySelectorAll('dialog').forEach(dlg => {
      dlg.addEventListener('close', () => { document.body.style.overflow = ''; });
    });
  }

  /* ============================================================
     Open / close
     ============================================================ */
  open(id) {
    const dlg = this.querySelector('#' + id);
    if (!dlg) return;

    // (re)start the checkout flow right before opening it
    if (id === 'checkout-modal' && window.noirCheckout) window.noirCheckout.start();

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