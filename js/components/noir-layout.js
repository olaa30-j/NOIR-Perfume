// js/components/noir-layout.js
import './site-header.js';
import './site-footer.js';
import './site-cart.js';
import './site-modals.js';

class NoirLayout extends HTMLElement {
  connectedCallback() {
    if (this._ready) return;
    this._ready = true;

    this.innerHTML = `
      <site-header></site-header>
      <slot></slot>
      <site-footer></site-footer>
      <site-cart></site-cart>
      <site-modals></site-modals>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    `;

    document.addEventListener('noir:admin-open', () => {
      window.location.href = 'admin.html';
    });

    document.addEventListener('noir:order-placed', (e) => {
      console.log('Order placed:', e.detail);
    });
  }
}
customElements.define('noir-layout', NoirLayout);