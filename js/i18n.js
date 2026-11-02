/* ============================================================
   NOIR — i18n (EN / AR) with RTL + automatic Arabic fonts
   ============================================================ */

const NOIR_I18N = {
  en: {
    'nav.home': 'Home',
    'nav.shop': 'Shop',
    'nav.collections': 'Collections',
    'nav.story': 'Our story',
    'hero.eyebrow': 'Discover the art of fragrance',
    'hero.title1': 'Essence of',
    'hero.title2': 'Arabian Luxury',
    'hero.desc': 'Timeless scents inspired by the rich heritage of Arabia. Crafted for those who appreciate elegance, sophistication and tradition.',
    'hero.cta': 'Shop collection',
    'section.featured': 'Featured fragrances',
    'section.bestsellers': 'Best sellers',
    'section.bundles': 'Bundles & offers',
    'section.viewAll': 'View all',
    'product.addToCart': 'Add to cart',
    'product.bestseller': 'Best seller',
    'product.save': 'Save',
    'product.quickView': 'Quick view',
    'cart.title': 'Shopping bag',
    'cart.empty': 'Your bag is empty.',
    'cart.subtotal': 'Subtotal',
    'cart.checkout': 'Continue to checkout',
    'admin.overview': 'Overview',
    'admin.products': 'Products',
    'admin.orders': 'Orders',
    'admin.customers': 'Customers',
    'admin.bundles': 'Bundles',
    'admin.offers': 'Offers',
    'admin.settings': 'Settings',
    'admin.language': 'Language',
    'admin.radius': 'Corner radius',
    'admin.save': 'Save',
    'admin.delete': 'Delete',
    'admin.edit': 'Edit',
    'admin.cancel': 'Cancel',
    'admin.addProduct': '+ Add product',
    'admin.addBundle': '+ Add bundle',
    'admin.bestSeller': 'Best seller',
    'admin.offer': 'Offer',
  },
  ar: {
    'nav.home': 'الرئيسية',
    'nav.shop': 'المتجر',
    'nav.collections': 'المجموعات',
    'nav.story': 'قصتنا',
    'hero.eyebrow': 'اكتشف فن العطور',
    'hero.title1': 'جوهر',
    'hero.title2': 'الفخامة العربية',
    'hero.desc': 'عطور خالدة مستوحاة من التراث العربي الغني. مصنوعة لمن يقدرون الأناقة والرقي والتقاليد.',
    'hero.cta': 'تسوّق المجموعة',
    'section.featured': 'عطور مميزة',
    'section.bestsellers': 'الأكثر مبيعاً',
    'section.bundles': 'الحزم والعروض',
    'section.viewAll': 'عرض الكل',
    'product.addToCart': 'أضف للسلة',
    'product.bestseller': 'الأكثر مبيعاً',
    'product.save': 'وفّر',
    'product.quickView': 'نظرة سريعة',
    'cart.title': 'حقيبة التسوق',
    'cart.empty': 'حقيبتك فارغة.',
    'cart.subtotal': 'المجموع',
    'cart.checkout': 'متابعة الدفع',
    'admin.overview': 'نظرة عامة',
    'admin.products': 'المنتجات',
    'admin.orders': 'الطلبات',
    'admin.customers': 'العملاء',
    'admin.bundles': 'الحزم',
    'admin.offers': 'العروض',
    'admin.settings': 'الإعدادات',
    'admin.language': 'اللغة',
    'admin.radius': 'استدارة الزوايا',
    'admin.save': 'حفظ',
    'admin.delete': 'حذف',
    'admin.edit': 'تعديل',
    'admin.cancel': 'إلغاء',
    'admin.addProduct': '+ إضافة منتج',
    'admin.addBundle': '+ إضافة حزمة',
    'admin.bestSeller': 'الأكثر مبيعاً',
    'admin.offer': 'عرض',
  },
};

/* ============================================================
   FONT PRESETS BY LANGUAGE
   - English: Cormorant Garamond (serif) + DM Sans (sans)
   - Arabic:  Cairo (serif-equivalent) + Tajawal (sans-equivalent)
   ============================================================ */
const NOIR_FONTS = {
  en: {
    serif: 'Cormorant Garamond',
    sans: 'DM Sans',
  },
  ar: {
    serif: 'Cairo',
    sans: 'Tajawal',
  },
};

/* Track which fonts we already downloaded to avoid duplicates */
const NOIR_LOADED_FONTS = new Set();

function noirLoadFont(name) {
  if (!name) return;
  const family = name.replace(/\s+/g, '+');
  if (NOIR_LOADED_FONTS.has(family)) return;
  NOIR_LOADED_FONTS.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

/* Apply fonts according to the language.
   - If the user has explicitly picked a font pair in the theme panel,
     we respect that ONLY for English. For Arabic, we always use
     Cairo + Tajawal, since the latin pair (Playfair etc.) has no
     Arabic glyphs.
*/
function noirApplyLanguageFonts(lang) {
  const root = document.documentElement;
  const isArabic = lang === 'ar';

  if (isArabic) {
    root.style.setProperty('--font-serif', `"${NOIR_FONTS.ar.serif}"`);
    root.style.setProperty('--font-sans', `"${NOIR_FONTS.ar.sans}"`);
    noirLoadFont(NOIR_FONTS.ar.serif);
    noirLoadFont(NOIR_FONTS.ar.sans);
  } else {
    // Try to use whatever theme preference is stored, otherwise default EN fonts
    let serif = NOIR_FONTS.en.serif;
    let sans = NOIR_FONTS.en.sans;
    try {
      const raw = localStorage.getItem('noir-theme-prefs');
      if (raw) {
        const prefs = JSON.parse(raw);
        if (prefs.serif) serif = prefs.serif;
        if (prefs.sans) sans = prefs.sans;
      }
    } catch (e) {}
    root.style.setProperty('--font-serif', `"${serif}"`);
    root.style.setProperty('--font-sans', `"${sans}"`);
    noirLoadFont(serif);
    noirLoadFont(sans);
  }
}

/* ============================================================
   LANGUAGE API
   - Store default language comes from the DB (admin setting).
   - A visitor can pick their own language (header toggle); it is kept in
     localStorage 'noir-visitor-lang' and wins on the storefront (never in admin).
   ============================================================ */
const NOIR_VISITOR_LANG_KEY = 'noir-visitor-lang';

function noirIsAdminPage() { return !!document.getElementById('admin-app'); }

function noirVisitorLang() {
  if (noirIsAdminPage()) return null;
  try {
    const v = localStorage.getItem(NOIR_VISITOR_LANG_KEY);
    return v && NOIR_I18N[v] ? v : null;
  } catch (e) { return null; }
}

/** Active language: visitor choice → store default → 'en' */
function noirLang() {
  return noirVisitorLang()
    || (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings && NOIR_DB.settings.language)
    || 'en';
}

function noirApplyLang(lang) {
  if (!NOIR_I18N[lang]) lang = 'en';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  noirApplyLanguageFonts(lang);
  noirTranslate();
  window.dispatchEvent(new CustomEvent('noir:language', { detail: { lang } }));
}

function noirSetLang(lang) {
  if (!NOIR_I18N[lang]) lang = 'en';
  if (noirIsAdminPage()) {
    NOIR_DB.settings.language = lang;      // admin edits the store default
  } else {
    try { localStorage.setItem(NOIR_VISITOR_LANG_KEY, lang); } catch (e) { /* ignore */ }
  }
  noirApplyLang(lang);
}

/** Translate a key; `{name}` placeholders are filled from `vars`. */
function noirT(key, vars) {
  const dict = NOIR_I18N[noirLang()] || NOIR_I18N.en;
  let str = dict[key] || NOIR_I18N.en[key] || key;
  if (vars) str = str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return str;
}

/** Localized field of a product/bundle/order line: noirLocalize(p, 'name') → nameAr in Arabic. */
function noirLocalize(obj, field) {
  if (!obj) return '';
  if (noirLang() === 'ar') {
    const ar = obj[field + 'Ar'];
    if (ar) return ar;
  }
  return obj[field] || '';
}

/** Product category label (Oud → عود). */
function noirCategory(cat) {
  const key = 'cat.' + cat;
  const dict = NOIR_I18N[noirLang()] || {};
  return dict[key] || cat || '';
}

function noirTranslate() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    el.textContent = noirT(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (!key) return;
    el.placeholder = noirT(key);
  });
}

/* ============================================================
   AUTO-INIT
   ============================================================ */
(function initI18n() {
  const lang = noirLang();

  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

  // Apply fonts as early as possible to avoid flash
  noirApplyLanguageFonts(lang);

  // Translate DOM when ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', noirTranslate);
  } else {
    noirTranslate();
  }

  // The DB (store default) arrives after first paint — re-resolve the language
  window.addEventListener('noir:settings-ready', () => {
    const l = noirLang();
    if (l !== document.documentElement.lang) noirApplyLang(l);
  });

  // Re-apply the current language fonts whenever the theme changes
  // (because theme may reset --font-serif / --font-sans)
  window.addEventListener('noir:theme', () => {
    noirApplyLanguageFonts(noirLang());
  });
})();

/* ============================================================
   EXPORTS
   ============================================================ */
window.noirSetLang = noirSetLang;
window.noirLang = noirLang;
window.noirLocalize = noirLocalize;
window.noirCategory = noirCategory;
window.NOIR_I18N = NOIR_I18N;
window.noirT = noirT;
window.noirTranslate = noirTranslate;
window.noirApplyLanguageFonts = noirApplyLanguageFonts;
window.NOIR_FONTS = NOIR_FONTS;