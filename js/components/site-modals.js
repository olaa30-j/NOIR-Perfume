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
        <form data-checkout-form class="checkout-form">
          <label>Full name<input name="name" required placeholder="Your name"></label>
          <label>Email address<input name="email" type="email" required placeholder="you@example.com"></label>
          <label>Delivery address<textarea name="address" required rows="3"
                  placeholder="Street, city, country"></textarea></label>
          <div class="subtotal"><span>Total</span><strong data-checkout-total>$0.00</strong></div>
          <button class="button button-gold button-full" type="submit">Place order</button>
        </form>
      </dialog>
    `;

    this.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => this.close(btn.dataset.close));
    });

    this.querySelectorAll('dialog').forEach(dlg => {
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) dlg.close();
      });
    });

    this.querySelector('[data-checkout-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const total = this.querySelector('[data-checkout-total]')?.textContent || '$0.00';
      const order = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        address: form.address.value.trim(),
        total,
        items: JSON.parse(localStorage.getItem('noir-cart') || '[]'),
        at: new Date().toISOString(),
      };
      document.dispatchEvent(new CustomEvent('noir:order-placed', { detail: order }));
      this.close('checkout-modal');
      form.reset();
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = 'Order placed — thank you!';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
      }
    });
  }

  open(id) {
    const dlg = this.querySelector('#' + id);
    if (!dlg) return;
    dlg.showModal();
    document.body.style.overflow = 'hidden';
  }

  close(id) {
    const dlg = this.querySelector('#' + id);
    if (!dlg) return;
    dlg.close();
    document.body.style.overflow = '';
  }
}
customElements.define('site-modals', SiteModals);