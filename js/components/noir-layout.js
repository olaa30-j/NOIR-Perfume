import './site-header.js';
import './site-footer.js';
import './site-cart.js';
import './site-modals.js';

class NoirLayout extends HTMLElement {
  connectedCallback() {
    if (this._ready) return;
    this._ready = true;

    const main = this.querySelector('main');

    this.innerHTML = `
      <site-header></site-header>
      <div data-layout-content></div>
      <site-footer></site-footer>
      <site-cart></site-cart>
      <site-modals></site-modals>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    `;

    if (main) {
      this.querySelector('[data-layout-content]').appendChild(main);
    }
  }
}
customElements.define('noir-layout', NoirLayout);