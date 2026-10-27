import './noir-layout.js';

export function onLayoutReady(cb) {
  customElements.whenDefined('noir-layout').then(() => {
    requestAnimationFrame(cb);
  });
}

export function getHeader() {
  return document.querySelector('site-header');
}
export function getCart() {
  return document.querySelector('site-cart');
}
export function getModals() {
  return document.querySelector('site-modals');
}