class NoirLayout extends HTMLElement {
  connectedCallback() {
    if (this._ready) return;
    this._ready = true;

    const content = this.querySelector('main');

    this.innerHTML = `
      <site-header></site-header>
      <div data-layout-content></div>
      <site-footer></site-footer>
      <site-cart></site-cart>
      <site-modals></site-modals>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    `;

    if (content) {
      this.querySelector('[data-layout-content]').appendChild(content);
    }

    document.addEventListener('noir:admin-open', () => {
      window.location.href = 'admin.html';
    });
  }
}
customElements.define('noir-layout', NoirLayout);