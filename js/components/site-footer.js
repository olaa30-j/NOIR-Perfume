class SiteFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <footer class="site-footer">
        <a class="brand" href="index.html">
          <span>NOIR</span><small>ARABIAN PERFUMES</small>
        </a>
        <div>
          <h3>Explore</h3>
          <a href="shop.html">All fragrances</a>
          <a href="collections.html">Collections</a>
          <a href="story.html">Our story</a>
        </div>
        <div>
          <h3>Customer care</h3>
          <a href="#footer">Shipping &amp; delivery</a>
          <a href="#footer">Returns &amp; exchanges</a>
          <a href="#footer">Contact us</a>
        </div>
        <div>
          <h3>Follow our story</h3>
          <p>Instagram &nbsp; Pinterest &nbsp; TikTok</p>
          <button class="text-link admin-link" id="admin-open">Admin ↗</button>
        </div>
        <p class="copyright">© 2026 NOIR Arabian Perfumes.</p>
      </footer>
    `;

    this.querySelector('#admin-open').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('noir:admin-open'));
    });
  }
}
customElements.define('site-footer', SiteFooter);