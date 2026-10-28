/* ============================================================
   NOIR — Central Store (Supabase ONLY)
   All reads/writes go directly to Supabase.
   No localStorage fallback for products/orders/bundles.
   site_settings (project name, address, theme, language, radius,
   fonts, colors) are also Supabase-backed — single row id = 1.
   ============================================================ */

const STORE_DEBUG = true;
function storeLog(...args) {
  if (STORE_DEBUG) console.log('%c[STORE]', 'color:#4fae7a;font-weight:bold', ...args);
}
function storeWarn(...args) {
  if (STORE_DEBUG) console.warn('%c[STORE]', 'color:#e0a800;font-weight:bold', ...args);
}
function storeErr(...args) {
  console.error('%c[STORE]', 'color:#e05252;font-weight:bold', ...args);
}

/* ---------- STATE ---------- */
let NOIR_DB = {
  products: [],
  bundles: [],
  orders: [],
  customers: [],
  settings: {
    projectName: 'NOIR Arabian Perfumes',
    projectAddress: '',
    theme: 'midnight',
    language: 'en',
    radius: 6,
    fontSerif: null,
    fontSans: null,
    bgColor: null,
    textColor: null,
    accentColor: null,
  },
};

/* ---------- EXPOSE TO GLOBAL (CRITICAL) ----------
   `let` at top-level does NOT create window.NOIR_DB.
   app.js (and other files) need this on window.
   We also re-assign window.NOIR_DB whenever NOIR_DB is re-assigned. */
window.NOIR_DB = NOIR_DB;

/* ---------- SUPABASE DETECTION ---------- */
function noirHasSupabase() {
  return typeof window.db !== 'undefined'
    && window.db
    && typeof window.db.from === 'function';
}

/* ---------- HELPERS ---------- */
function noirGetProduct(id) {
  return NOIR_DB.products.find(p => p.id === Number(id));
}
function noirGetBundle(id) {
  return NOIR_DB.bundles.find(b => b.id === Number(id));
}
function noirComputePrice(product) {
  if (!product) return 0;
  if (product.offer) {
    if (product.offer.type === 'percent') {
      return Math.round(product.price * (1 - product.offer.value / 100) * 100) / 100;
    }
    if (product.offer.type === 'fixed') {
      return Math.max(0, product.price - product.offer.value);
    }
  }
  return product.price;
}

/* ============================================================
   APP SETTINGS (Supabase-backed, row id = 1)
   ============================================================ */
const NOIR_APP_SETTINGS_KEY = 'noir-app-settings'; // legacy only

const NOIR_DEFAULT_SETTINGS = {
  projectName: 'NOIR Arabian Perfumes',
  projectAddress: 'Riyadh, Saudi Arabia',
  theme: 'midnight',
  language: 'en',
  radius: 6,
  fontSerif: 'Cormorant Garamond',
  fontSans: 'DM Sans',
  bgColor: '#07111c',
  textColor: '#f5ead7',
  accentColor: '#c89b55',
};

function noirApplySettingsToState(row) {
  if (!row) return;
  NOIR_DB.settings = {
    ...NOIR_DB.settings,
    projectName: row.project_name ?? NOIR_DEFAULT_SETTINGS.projectName,
    projectAddress: row.project_address ?? NOIR_DEFAULT_SETTINGS.projectAddress,
    theme: row.theme ?? NOIR_DEFAULT_SETTINGS.theme,
    language: row.language ?? NOIR_DEFAULT_SETTINGS.language,
    radius: row.radius ?? NOIR_DEFAULT_SETTINGS.radius,
    // NEW — theme details
    fontSerif: row.font_serif ?? null,
    fontSans: row.font_sans ?? null,
    bgColor: row.bg_color ?? null,
    textColor: row.text_color ?? null,
    accentColor: row.accent_color ?? null,
  };
}

/* (optional) migrate old localStorage settings once */
function noirMigrateLegacySettings() {
  try {
    const raw = localStorage.getItem(NOIR_APP_SETTINGS_KEY);
    if (!raw) return null;
    const old = JSON.parse(raw);
    localStorage.removeItem(NOIR_APP_SETTINGS_KEY);
    return {
      project_name: old.projectName || NOIR_DEFAULT_SETTINGS.projectName,
      project_address: old.projectAddress || NOIR_DEFAULT_SETTINGS.projectAddress,
      theme: old.theme || NOIR_DEFAULT_SETTINGS.theme,
      language: old.language || NOIR_DEFAULT_SETTINGS.language,
      radius: Number(old.radius) || NOIR_DEFAULT_SETTINGS.radius,
      font_serif: old.fontSerif || null,
      font_sans: old.fontSans || null,
      bg_color: old.bgColor || null,
      text_color: old.textColor || null,
      accent_color: old.accentColor || null,
    };
  } catch { return null; }
}

async function noirLoadAppSettings() {
  if (!noirHasSupabase()) {
    storeWarn('noirLoadAppSettings: Supabase not configured');
    window.dispatchEvent(new CustomEvent('noir:settings-ready', { detail: NOIR_DB.settings }));
    return false;
  }
  try {
    const { data, error } = await window.db
      .from('site_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      noirApplySettingsToState(data);
      storeLog('Settings loaded from Supabase:', NOIR_DB.settings);
    } else {
      storeWarn('site_settings row id=1 not found — using defaults');
    }
    window.dispatchEvent(new CustomEvent('noir:settings-ready', { detail: NOIR_DB.settings }));
    return true;
  } catch (err) {
    storeErr('Load settings failed:', err);
    window.dispatchEvent(new CustomEvent('noir:settings-ready', { detail: NOIR_DB.settings }));
    return false;
  }
}

/**
 * Save app settings to Supabase (row id = 1).
 * Strategy: UPDATE first; if no row, INSERT (without id, DB generates).
 * This works even if `id` column is `GENERATED ALWAYS`.
 */
async function noirSaveAppSettings(partial) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');

  if (partial) Object.assign(NOIR_DB.settings, partial);

  const row = {
    project_name: NOIR_DB.settings.projectName,
    project_address: NOIR_DB.settings.projectAddress,
    theme: NOIR_DB.settings.theme,
    language: NOIR_DB.settings.language,
    radius: Number(NOIR_DB.settings.radius) || 6,
    // NEW — theme details
    font_serif: NOIR_DB.settings.fontSerif ?? null,
    font_sans: NOIR_DB.settings.fontSans ?? null,
    bg_color: NOIR_DB.settings.bgColor ?? null,
    text_color: NOIR_DB.settings.textColor ?? null,
    accent_color: NOIR_DB.settings.accentColor ?? null,
  };

  storeLog('Saving settings (update-then-insert)…', row);

  // 1) UPDATE id=1
  let { data, error } = await window.db
    .from('site_settings')
    .update(row)
    .eq('id', 1)
    .select()
    .maybeSingle();

  if (error) {
    storeErr('Save settings (update) failed:', error);
    throw error;
  }

  // 2) INSERT بدون id لو مفيش صف
  if (!data) {
    storeLog('No row id=1 — inserting new row without id');
    const insertRes = await window.db
      .from('site_settings')
      .insert(row)
      .select()
      .maybeSingle();
    if (insertRes.error) {
      storeErr('Save settings (insert) failed:', insertRes.error);
      throw insertRes.error;
    }
    data = insertRes.data;
  }

  noirApplySettingsToState(data);
  storeLog('Settings saved to Supabase ✓', NOIR_DB.settings);
  window.dispatchEvent(new CustomEvent('noir:settings-ready', { detail: NOIR_DB.settings }));
  return data;
}

/* ============================================================
   LOAD ALL FROM SUPABASE
   ============================================================ */
async function noirLoadFromSupabase() {
  if (!noirHasSupabase()) {
    storeWarn('Supabase not configured — app will be empty.');
    window.dispatchEvent(new CustomEvent('noir:data-ready', {
      detail: { source: 'none', error: 'Supabase not configured' },
    }));
    return false;
  }

  storeLog('Loading all data from Supabase…');

  try {
    const [productsRes, bundlesRes, ordersRes, customersRes] = await Promise.all([
      window.db.from('products').select('*').order('id', { ascending: true }),
      window.db.from('bundles').select('*').order('id', { ascending: true }),
      window.db.from('orders').select('*').order('created_at', { ascending: false }),
      window.db.from('customers').select('*').order('name', { ascending: true }),
    ]);

    if (productsRes.error) throw productsRes.error;
    if (bundlesRes.error) throw bundlesRes.error;
    if (ordersRes.error) throw ordersRes.error;
    const customers = customersRes.error ? [] : (customersRes.data || []);

    NOIR_DB.products = (productsRes.data || []).map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      price: Number(row.price),
      stock: row.stock,
      subtitle: row.subtitle,
      description: row.description,
      bottle: row.bottle || '',
      badge: row.badge || '',
      bestSeller: row.best_seller === true,
      offer: row.offer || null,
    }));

    NOIR_DB.bundles = (bundlesRes.data || []).map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      productIds: row.product_ids || [],
      price: Number(row.price),
      badge: row.badge || '',
      active: row.active !== false,
    }));

    NOIR_DB.orders = (ordersRes.data || []).map(row => ({
      id: row.id,
      customer: row.customer_name,
      email: row.customer_email,
      date: row.created_at ? row.created_at.slice(0, 10) : '',
      total: Number(row.total),
      status: row.status,
      items: row.items || [],
    }));

    NOIR_DB.customers = customers.map(row => ({
      name: row.name,
      email: row.email,
      orders: row.orders || 0,
      spent: Number(row.spent) || 0,
    }));

    /* Keep window.NOIR_DB in sync */
    window.NOIR_DB = NOIR_DB;

    storeLog(`Loaded: ${NOIR_DB.products.length} products, ${NOIR_DB.orders.length} orders, ${NOIR_DB.bundles.length} bundles, ${NOIR_DB.customers.length} customers`);

    window.dispatchEvent(new CustomEvent('noir:data-ready', {
      detail: { source: 'supabase' },
    }));
    return true;
  } catch (err) {
    storeErr('Supabase load failed:', err);
    window.dispatchEvent(new CustomEvent('noir:data-ready', {
      detail: { source: 'none', error: err.message },
    }));
    return false;
  }
}

/* ============================================================
   REFRESH WITHOUT RELOAD
   ============================================================ */
async function noirRefreshStoreData() {
  storeLog('noirRefreshStoreData() start — no page reload');

  const ok = await noirLoadFromSupabase();

  if (!ok) {
    storeWarn('Refresh failed — data may be stale');
    return false;
  }

  try {
    if (typeof renderProducts === 'function' && document.getElementById('product-grid')) {
      renderProducts();
      storeLog('Re-rendered products grid');
    }
    if (typeof renderBestSellers === 'function' && document.getElementById('bestsellers-grid')) {
      renderBestSellers();
      storeLog('Re-rendered best sellers');
    }
    if (typeof renderBundles === 'function' && document.getElementById('bundles-grid')) {
      renderBundles();
      storeLog('Re-rendered bundles');
    }
    if (typeof updateCartUI === 'function') {
      updateCartUI();
      storeLog('Updated cart UI');
    }
  } catch (e) {
    storeWarn('Re-render failed:', e);
  }

  storeLog('noirRefreshStoreData() done ✓');
  return true;
}

/* ============================================================
   WRITE: PRODUCT
   ============================================================ */
async function noirSaveProductToDB(product) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');

  const row = {
    name: product.name,
    category: product.category,
    price: product.price,
    stock: product.stock,
    subtitle: product.subtitle,
    description: product.description,
    bottle: product.bottle || '',
    badge: product.badge || '',
    best_seller: !!product.bestSeller,
    offer: product.offer || null,
  };

  if (product.id) {
    row.id = product.id;
    storeLog('Upserting product (update):', row.name, '| id:', row.id);
    const { data, error } = await window.db
      .from('products')
      .upsert(row, { onConflict: 'id' })
      .select();
    if (error) {
      storeErr('Product update failed:', error);
      throw error;
    }
    storeLog('Product updated ✓', data && data[0] ? data[0].id : row.id);
    return data && data[0] ? data[0] : row;
  } else {
    storeLog('Inserting product (new):', row.name);
    const { data, error } = await window.db
      .from('products')
      .insert(row)
      .select();
    if (error) {
      storeErr('Product insert failed:', error);
      throw error;
    }
    storeLog('Product inserted ✓', data && data[0] ? data[0].id : 'no id returned');
    return data && data[0] ? data[0] : row;
  }
}

async function noirDeleteProductFromDB(id) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  storeLog('Deleting product:', id);
  const { error } = await window.db.from('products').delete().eq('id', Number(id));
  if (error) {
    storeErr('Product delete failed:', error);
    throw error;
  }
  storeLog('Product deleted ✓', id);
  return true;
}

/* ============================================================
   WRITE: BUNDLE
   ============================================================ */
async function noirSaveBundleToDB(bundle) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');

  const row = {
    name: bundle.name,
    description: bundle.description,
    product_ids: bundle.productIds,
    price: bundle.price,
    badge: bundle.badge || '',
    active: bundle.active !== false,
  };

  if (bundle.id) {
    row.id = bundle.id;
    storeLog('Upserting bundle (update):', row.name, '| id:', row.id);
    const { data, error } = await window.db
      .from('bundles')
      .upsert(row, { onConflict: 'id' })
      .select();
    if (error) {
      storeErr('Bundle update failed:', error);
      throw error;
    }
    storeLog('Bundle updated ✓', data && data[0] ? data[0].id : row.id);
    return data && data[0] ? data[0] : row;
  } else {
    storeLog('Inserting bundle (new):', row.name);
    const { data, error } = await window.db
      .from('bundles')
      .insert(row)
      .select();
    if (error) {
      storeErr('Bundle insert failed:', error);
      throw error;
    }
    storeLog('Bundle inserted ✓', data && data[0] ? data[0].id : 'no id returned');
    return data && data[0] ? data[0] : row;
  }
}

async function noirDeleteBundleFromDB(id) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  storeLog('Deleting bundle:', id);
  const { error } = await window.db.from('bundles').delete().eq('id', Number(id));
  if (error) {
    storeErr('Bundle delete failed:', error);
    throw error;
  }
  storeLog('Bundle deleted ✓', id);
  return true;
}

/* ============================================================
   WRITE: ORDER
   ============================================================ */
async function noirSaveOrderToDB(order) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');

  const row = {
    id: order.id,
    customer_name: order.customer,
    customer_email: order.email,
    total: order.total,
    status: order.status || 'Processing',
    items: order.items || [],
  };

  storeLog('Saving order to Supabase:', row.id, '| total:', row.total);

  const { data, error } = await window.db.from('orders').upsert(row).select();
  if (error) {
    storeErr('Order save failed:', error);
    throw error;
  }
  storeLog('Order saved ✓', data && data[0] ? data[0].id : row.id);
  return data && data[0] ? data[0] : row;
}

async function noirUpdateOrderStatusInDB(id, status) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  storeLog('Updating order status:', id, '→', status);
  const { error } = await window.db.from('orders').update({ status }).eq('id', id);
  if (error) {
    storeErr('Order status update failed:', error);
    throw error;
  }
  storeLog('Order status updated ✓');
  return true;
}

/* ---------- EXPORTS ---------- */
window.noirGetProduct = noirGetProduct;
window.noirGetBundle = noirGetBundle;
window.noirComputePrice = noirComputePrice;
window.noirHasSupabase = noirHasSupabase;
window.noirLoadFromSupabase = noirLoadFromSupabase;
window.noirRefreshStoreData = noirRefreshStoreData;
window.noirSaveProductToDB = noirSaveProductToDB;
window.noirDeleteProductFromDB = noirDeleteProductFromDB;
window.noirSaveBundleToDB = noirSaveBundleToDB;
window.noirDeleteBundleFromDB = noirDeleteBundleFromDB;
window.noirSaveOrderToDB = noirSaveOrderToDB;
window.noirUpdateOrderStatusInDB = noirUpdateOrderStatusInDB;
window.noirLoadAppSettings = noirLoadAppSettings;
window.noirSaveAppSettings = noirSaveAppSettings;
window.noirDEFAULT_SETTINGS = NOIR_DEFAULT_SETTINGS;

/* ---------- AUTO-LOAD ---------- */
(async function autoLoad() {
  // (optional) migrate old localStorage settings
  const legacy = noirMigrateLegacySettings();
  if (legacy && noirHasSupabase()) {
    try {
      // Update first, fallback to insert (no id)
      const upd = await window.db.from('site_settings').update(legacy).eq('id', 1).select();
      if (!upd.error && (!upd.data || upd.data.length === 0)) {
        const ins = await window.db.from('site_settings').insert(legacy).select();
        if (ins.error) throw ins.error;
      }
      storeLog('Legacy settings migrated to Supabase ✓');
    } catch (e) { storeWarn('Legacy migration failed:', e); }
  }

  const run = async () => {
    await noirLoadAppSettings();   // first — theme, language, radius, fonts, colors
    await noirLoadFromSupabase();  // then — products, orders, bundles
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();