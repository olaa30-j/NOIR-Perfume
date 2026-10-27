class SiteHeader extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="announcement">
        <span>Complimentary delivery on orders over $99</span>
        <span class="announcement-ar" lang="ar">توصيل مجاني للطلبات فوق ٩٩ دولار</span>
      </div>
      <header class="site-header">
        <a class="brand" href="index.html" aria-label="NOIR home">
          <span>NOIR</span><small>ARABIAN PERFUMES</small>
        </a>
        <button class="icon-button menu-toggle" id="menu-toggle"
                aria-label="Toggle navigation" aria-expanded="false">☰</button>
        <nav class="main-nav" id="main-nav" aria-label="Main navigation">
          <a href="index.html" data-i18n="nav.home">Home</a>
          <a href="shop.html" data-i18n="nav.shop">Shop</a>
          <a href="collections.html" data-i18n="nav.collections">Collections</a>
          <a href="story.html" data-i18n="nav.story">Our story</a>
        </nav>
        <div class="header-actions">
          <button class="icon-button" id="search-toggle" aria-label="Search products">⌕</button>
          <button class="icon-button" id="account-button" aria-label="Open account">♙</button>
          <button class="icon-button cart-trigger" id="cart-open" aria-label="Open shopping bag">
            ♧ <span class="cart-count" id="cart-count">0</span>
          </button>
        </div>
      </header>
    `;

    this.querySelector('#menu-toggle').addEventListener('click', (e) => {
      const nav = this.querySelector('#main-nav');
      const open = nav.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', String(open));
    });

    this.querySelector('#cart-open').addEventListener('click', () => {
      this.closest('noir-layout')?.querySelector('site-cart')?.open();
    });

    this.querySelector('#account-button').addEventListener('click', () => {
      const user = localStorage.getItem('noir-user');
      window.location.href = user ? 'account.html' : 'login.html';
    });

    this.querySelector('#search-toggle').addEventListener('click', () => {
      if (document.getElementById('product-search')) {
        document.getElementById('product-search').focus();
      } else {
        window.location.href = 'shop.html';
      }
    });

    const path = location.pathname.split('/').pop() || 'index.html';
    this.querySelectorAll('#main-nav a').forEach(a => {
      const href = a.getAttribute('href');
      if (href === path) a.setAttribute('aria-current', 'page');
    });
  }

  setCartCount(n) {
    const el = this.querySelector('#cart-count');
    if (el) el.textContent = n;
  }
}
customElements.define('site-header', SiteHeader);