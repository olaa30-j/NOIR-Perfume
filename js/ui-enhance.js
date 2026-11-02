/* ============================================================
   NOIR — UI enhancements (progressive; the site works without it)
   - header condenses after scrolling
   - scroll progress bar
   - scroll-reveal for sections
   - back-to-top button
   - skip-to-content link
   - cart badge "bump" animation
   ============================================================ */
(function noirUiEnhance() {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

  /* ---------- Skip link + main landmark ---------- */
  function setupSkipLink() {
    var main = document.querySelector('main');
    if (!main) return;
    if (!main.id) main.id = 'main-content';
    main.setAttribute('tabindex', '-1');
    if (document.querySelector('.skip-link')) return;
    var a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#' + main.id;
    a.textContent = 'Skip to content';
    document.body.insertBefore(a, document.body.firstChild);
  }

  /* ---------- Scroll progress + header state + to-top ---------- */
  var bar, toTop, header, ticking = false;

  function buildChrome() {
    bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    toTop = document.createElement('button');
    toTop.type = 'button';
    toTop.className = 'to-top';
    toTop.setAttribute('aria-label', 'Back to top');
    toTop.textContent = '↑';
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    document.body.appendChild(toTop);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY || root.scrollTop;
      var max = Math.max(1, root.scrollHeight - window.innerHeight);
      if (bar) bar.style.setProperty('--progress', Math.min(1, y / max).toFixed(4));
      if (!header) header = document.querySelector('.site-header');
      if (header) header.classList.toggle('is-scrolled', y > 24);
      if (toTop) toTop.classList.toggle('show', y > 600);
      ticking = false;
    });
  }

  /* ---------- Scroll reveal ---------- */
  var REVEAL_SELECTOR = [
    '.section-heading', '.story-section', '.benefit', '.newsletter',
    '.collection-banner .banner-copy', '.shop-toolbar', '.bundle-card'
  ].join(',');
  var io = null;

  function observeNew() {
    if (!io) return;
    document.querySelectorAll(REVEAL_SELECTOR).forEach(function (el) {
      if (el.dataset.revealBound) return;
      el.dataset.revealBound = '1';
      // stagger siblings of the same kind a little
      var idx = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.setProperty('--reveal-delay', Math.min(idx, 5) * 0.07 + 's');
      el.classList.add('js-reveal');
      io.observe(el);
    });
  }

  function setupReveal() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    root.classList.add('reveal-ready');
    observeNew();

    // content is rendered asynchronously (layout component, DB data)
    var t = null;
    new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(observeNew, 80);
    }).observe(document.body, { childList: true, subtree: true });

    // Safety net: never leave content hidden if something goes wrong
    setTimeout(function () {
      document.querySelectorAll('.js-reveal:not(.is-visible)').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) el.classList.add('is-visible');
      });
    }, 2500);
  }

  /* ---------- Cart badge bump ---------- */
  function setupCartBump() {
    var last = null;
    window.addEventListener('noir:cart-updated', function () {
      setTimeout(function () {
        var el = document.getElementById('cart-count');
        if (!el) return;
        var now = el.textContent;
        if (last !== null && now !== last) {
          el.classList.remove('bump');
          void el.offsetWidth; // restart animation
          el.classList.add('bump');
        }
        last = now;
      }, 350);
    });
  }

  function init() {
    // The admin dashboard has its own layout and controls
    if (document.getElementById('admin-app')) return;
    setupSkipLink();
    buildChrome();
    setupReveal();
    setupCartBump();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
    // the layout component moves <main> after upgrade — re-run once it exists
    if (window.customElements && customElements.whenDefined) {
      customElements.whenDefined('noir-layout').then(function () {
        requestAnimationFrame(function () { setupSkipLink(); onScroll(); });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
