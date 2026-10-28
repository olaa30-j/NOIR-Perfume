/* ============================================================
   NOIR — Central Store (Supabase ONLY)
   All reads/writes go directly to Supabase.
   site_settings (project name, address, theme, language, radius,
   fonts, colors) are also Supabase-backed — single row id = 1.
   NO localStorage anywhere. NO legacy migration.
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

/* ---------- EXPOSE TO GLOBAL ---------- */
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
   APP SETTINGS
   ============================================================ */
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
    fontSerif: row.font_serif ?? null,
    fontSans: row.font_sans ?? null,
    bgColor: row.bg_color ?? null,
    textColor: row.text_color ?? null,
    accentColor: row.accent_color ?? null,
  };
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
      storeLog('Settings loaded:', NOIR_DB.settings);
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

async function noirSaveAppSettings(partial) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');

  if (partial) Object.assign(NOIR_DB.settings, partial);

  const row = {
    project_name: NOIR_DB.settings.projectName,
    project_address: NOIR_DB.settings.projectAddress,
    theme: NOIR_DB.settings.theme,
    language: NOIR_DB.settings.language,
    radius: Number(NOIR_DB.settings.radius) || 6,
    font_serif: NOIR_DB.settings.fontSerif ?? null,
    font_sans: NOIR_DB.settings.fontSans ?? null,
    bg_color: NOIR_DB.settings.bgColor ?? null,
    text_color: NOIR_DB.settings.textColor ?? null,
    accent_color: NOIR_DB.settings.accentColor ?? null,
  };

  storeLog('Saving settings…', row);

  // 1) UPDATE
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

  // 2) INSERT لو مفيش صف
  if (!data) {
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
  storeLog('Settings saved ✓', NOIR_DB.settings);
  window.dispatchEvent(new CustomEvent('noir:settings-ready', { detail: NOIR_DB.settings }));
  return data;
}

/* ============================================================
   LOAD ALL FROM SUPABASE — كل جدول optional
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

    if (productsRes.error) storeErr('products load failed:', productsRes.error);
    if (bundlesRes.error)  storeWarn('bundles load failed (non-fatal):', bundlesRes.error.message || bundlesRes.error);
    if (ordersRes.error)   storeWarn('orders load failed (non-fatal):', ordersRes.error.message || ordersRes.error);
    if (customersRes.error) storeWarn('customers load failed (non-fatal):', customersRes.error.message || customersRes.error);

    /* ---------- products ---------- */
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

    /* ---------- bundles ---------- */
    NOIR_DB.bundles = (bundlesRes.data || []).map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      productIds: row.product_ids || [],
      price: Number(row.price),
      badge: row.badge || '',
      active: row.active !== false,
    }));

    /* ---------- orders ---------- */
    NOIR_DB.orders = (ordersRes.data || []).map(row => ({
      id: row.id,
      customer: row.customer_name,
      email: row.customer_email,
      address: row.address || '',
      customerId: row.customer_id || null,
      date: row.created_at ? row.created_at.slice(0, 10) : '',
      total: Number(row.total),
      status: row.status,
      items: row.items || [],
    }));

    /* ---------- customers ---------- */
    NOIR_DB.customers = (customersRes.data || []).map(row => ({
      id: row.id,
      userId: row.user_id || null,
      ordersList: Array.isArray(row.orders) ? row.orders : [],
      name: row.name,
      email: row.email,
      orders: Array.isArray(row.orders) ? row.orders.length : (Number(row.orders) || 0),
      spent: Number(row.spent) || 0,
    }));

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
   REFRESH — data only; rendering handled by app.js via noir:data-ready
   ============================================================ */
async function noirRefreshStoreData() {
  storeLog('noirRefreshStoreData() start');
  const ok = await noirLoadFromSupabase();
  if (!ok) {
    storeWarn('Refresh failed');
    return false;
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
    const { data, error } = await window.db.from('products').upsert(row, { onConflict: 'id' }).select();
    if (error) throw error;
    return data && data[0] ? data[0] : row;
  } else {
    const { data, error } = await window.db.from('products').insert(row).select();
    if (error) throw error;
    return data && data[0] ? data[0] : row;
  }
}

async function noirDeleteProductFromDB(id) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const { error } = await window.db.from('products').delete().eq('id', Number(id));
  if (error) throw error;
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
    const { data, error } = await window.db.from('bundles').upsert(row, { onConflict: 'id' }).select();
    if (error) throw error;
    return data && data[0] ? data[0] : row;
  } else {
    const { data, error } = await window.db.from('bundles').insert(row).select();
    if (error) throw error;
    return data && data[0] ? data[0] : row;
  }
}

async function noirDeleteBundleFromDB(id) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const { error } = await window.db.from('bundles').delete().eq('id', Number(id));
  if (error) throw error;
  return true;
}

/* ============================================================
   WRITE: ORDER — now writes address + customer_id
   ============================================================ */
async function noirSaveOrderToDB(order) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');

  let customerId = order.customerId || null;
  if (!customerId && window.db?.auth) {
    try {
      const { data } = await window.db.auth.getUser();
      customerId = data?.user?.id || null;
    } catch (e) { /* ignore */ }
  }

  const row = {
    id: order.id,
    customer_name: order.customer,
    customer_email: order.email,
    total: Number(order.total) || 0,
    status: order.status || 'Processing',
    items: order.items || [],
  };

  // ✅ optional columns — only sent when the source field has a value
  if (order.address) row.address = String(order.address);
  if (customerId)    row.customer_id = customerId;

  storeLog('Saving order:', row.id, '| address:', !!row.address, '| customer_id:', row.customer_id || '—');

  const { data, error } = await window.db
    .from('orders')
    .upsert(row, { onConflict: 'id' })
    .select()
    .maybeSingle();

  if (error) {
    storeErr('Order save failed:', error);
    throw error;
  }
  return data || row;
}

async function noirUpdateOrderStatusInDB(id, status) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const { error } = await window.db.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
  return true;
}

/* ============================================================
   WRITE: CUSTOMER — no cart_id any more
   ============================================================ */
async function noirSaveCustomerToDB(customer) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');

  let userId = customer.userId || null;
  if (!userId && window.db?.auth) {
    const { data } = await window.db.auth.getUser();
    userId = data?.user?.id || null;
  }
  if (!userId) throw new Error('No authenticated user');

  const row = {
    user_id: userId,
    name: customer.name,
    email: customer.email,
    spent: Number(customer.spent) || 0,
  };

  if (Array.isArray(customer.orders)) row.orders = customer.orders;

  storeLog('Saving customer:', userId, '| orders:', row.orders?.length || 0);

  let { data, error } = await window.db
    .from('customers')
    .update(row)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (error) {
    storeErr('Customer update failed:', error);
    throw error;
  }

  if (!data) {
    const ins = await window.db.from('customers').insert(row).select().maybeSingle();
    if (ins.error) {
      storeErr('Customer insert failed:', ins.error);
      throw ins.error;
    }
    data = ins.data;
  }

  storeLog('Customer saved ✓', data);
  return data;
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
window.noirSaveCustomerToDB = noirSaveCustomerToDB;
window.noirDEFAULT_SETTINGS = NOIR_DEFAULT_SETTINGS;

/* ---------- AUTO-LOAD (no localStorage, no migration) ---------- */
(async function autoLoad() {
  const run = async () => {
    await noirLoadAppSettings();
    await noirLoadFromSupabase();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();