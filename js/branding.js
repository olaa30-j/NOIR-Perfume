/* NOIR — apply project identity from Supabase to storefront */
(function () {
  function applyBranding(settings) {
    if (!settings) return;

    // Brand name in header/footer (first word keeps "NOIR" style)
    if (settings.projectName) {
      const first = settings.projectName.trim().split(/\s+/)[0];
      document.querySelectorAll('.brand span').forEach(el => {
        el.textContent = first;
      });
    }

    // Any element with data-project-address
    if (settings.projectAddress) {
      document.querySelectorAll('[data-project-address]').forEach(el => {
        el.textContent = settings.projectAddress;
      });
    }
  }

  window.addEventListener('noir:settings-ready', (e) => applyBranding(e.detail));

  // If settings already arrived before this script loaded
  if (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings) {
    applyBranding(NOIR_DB.settings);
  }
})();