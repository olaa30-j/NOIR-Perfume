/* ============================================================
   NOIR — Central Store (Supabase ONLY)
   All reads/writes go directly to Supabase.
   No localStorage fallback for products/orders/bundles.
   ============================================================ */

/* ---------- STATE (in-memory only) ---------- */
let NOIR_DB = {
  products: [],
  bundles: [],
  orders: [],
  customers: [],
  settings: { language: 'en', radius: 6 },
};

let products = NOIR_DB.products;
let orders = NOIR_DB.orders;

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

/* ---------- APP SETTINGS (language, radius) — local only ---------- */
const NOIR_APP_SETTINGS_KEY = 'noir-app-settings';

function noirLoadAppSettings() {
  try {
    const raw = localStorage.getItem(NOIR_APP_SETTINGS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      Object.assign(NOIR_DB.settings, data);
    }
  } catch (e) {}
}

function noirSaveAppSettings() {
  try {
    localStorage.setItem(NOIR_APP_SETTINGS_KEY, JSON.stringify(NOIR_DB.settings));
  } catch (e) {}
}

/* ---------- LOAD ALL FROM SUPABASE ---------- */
async function noirLoadFromSupabase() {
  if (!noirHasSupabase()) {
    console.warn('[store] Supabase not configured — app will be empty.');
    window.dispatchEvent(new CustomEvent('noir:data-ready', {
      detail: { source: 'none', error: 'Supabase not configured' },
    }));
    return false;
  }
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

    products = NOIR_DB.products;
    orders = NOIR_DB.orders;

    console.info(`[store] loaded ${NOIR_DB.products.length} products, ${NOIR_DB.orders.length} orders from Supabase`);
    window.dispatchEvent(new CustomEvent('noir:data-ready', {
      detail: { source: 'supabase' },
    }));
    return true;
  } catch (err) {
    console.error('[store] Supabase load failed:', err);
    window.dispatchEvent(new CustomEvent('noir:data-ready', {
      detail: { source: 'none', error: err.message },
    }));
    return false;
  }
}

/* ---------- WRITE: PRODUCT ---------- */
async function noirSaveProductToDB(product) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const row = {
    id: product.id,
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
  const { data, error } = await window.db.from('products').upsert(row).select();
  if (error) throw error;
  return data && data[0] ? data[0] : row;
}

async function noirDeleteProductFromDB(id) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const { error } = await window.db.from('products').delete().eq('id', Number(id));
  if (error) throw error;
  return true;
}

/* ---------- WRITE: BUNDLE ---------- */
async function noirSaveBundleToDB(bundle) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const row = {
    id: bundle.id,
    name: bundle.name,
    description: bundle.description,
    product_ids: bundle.productIds,
    price: bundle.price,
    badge: bundle.badge || '',
    active: bundle.active !== false,
  };
  const { data, error } = await window.db.from('bundles').upsert(row).select();
  if (error) throw error;
  return data && data[0] ? data[0] : row;
}

async function noirDeleteBundleFromDB(id) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const { error } = await window.db.from('bundles').delete().eq('id', Number(id));
  if (error) throw error;
  return true;
}

/* ---------- WRITE: ORDER ---------- */
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
  const { data, error } = await window.db.from('orders').upsert(row).select();
  if (error) throw error;
  return data && data[0] ? data[0] : row;
}

async function noirUpdateOrderStatusInDB(id, status) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const { error } = await window.db.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
  return true;
}

/* ---------- EXPORTS ---------- */
window.noirGetProduct = noirGetProduct;
window.noirGetBundle = noirGetBundle;
window.noirComputePrice = noirComputePrice;
window.noirHasSupabase = noirHasSupabase;
window.noirLoadFromSupabase = noirLoadFromSupabase;
window.noirSaveProductToDB = noirSaveProductToDB;
window.noirDeleteProductFromDB = noirDeleteProductFromDB;
window.noirSaveBundleToDB = noirSaveBundleToDB;
window.noirDeleteBundleFromDB = noirDeleteBundleFromDB;
window.noirSaveOrderToDB = noirSaveOrderToDB;
window.noirUpdateOrderStatusInDB = noirUpdateOrderStatusInDB;
window.noirLoadAppSettings = noirLoadAppSettings;
window.noirSaveAppSettings = noirSaveAppSettings;

/* ---------- AUTO-LOAD ---------- */
(function autoLoad() {
  noirLoadAppSettings();
  const run = () => { setTimeout(() => { noirLoadFromSupabase(); }, 0); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();