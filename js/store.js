/* ============================================================
   NOIR — Central Store
   Hybrid: Supabase (real DB) + localStorage (fallback / cache)
   Exports: NOIR_DB, noirGetProduct, noirComputePrice, noirPersist,
            noirLoadFromSupabase, noirSaveProductToDB, etc.
   ============================================================ */

const NOIR_STORE_KEY = 'noir-store-data';
const NOIR_STORE_VERSION = 2;

/* ---------- DEFAULT DATA ---------- */
const NOIR_DEFAULT_DATA = {
  version: NOIR_STORE_VERSION,
  products: [
    { id: 1, name: "Khamrah", category: "Oud", price: 129, stock: 24, subtitle: "Oud · Saffron · Woods", description: "A deep, smoky oud wrapped in saffron.", bottle: "red", badge: "New", bestSeller: true, offer: null },
    { id: 2, name: "Amber Nights", category: "Amber", price: 119, stock: 18, subtitle: "Amber · Vanilla · Musk", description: "Warm amber with a soft vanilla finish.", bottle: "light", badge: "", bestSeller: true, offer: { type: 'percent', value: 15, label: '-15%' } },
    { id: 3, name: "Musk Al Haram", category: "Musk", price: 99, stock: 6, subtitle: "White Musk · Rose", description: "Clean white musk with delicate rose.", bottle: "clear", badge: "", bestSeller: false, offer: null },
    { id: 4, name: "Rose Noir", category: "Floral", price: 109, stock: 32, subtitle: "Rose · Oud · Patchouli", description: "Bold rose with oud and patchouli.", bottle: "blue", badge: "", bestSeller: true, offer: null },
    { id: 5, name: "Desert Oud", category: "Oud", price: 149, stock: 12, subtitle: "Oud · Leather · Spice", description: "A desert-inspired oud with leather.", bottle: "green", badge: "", bestSeller: false, offer: null },
    { id: 6, name: "Saffron Dunes", category: "Amber", price: 139, stock: 8, subtitle: "Saffron · Amber · Sandalwood", description: "Golden saffron over warm amber.", bottle: "", badge: "", bestSeller: false, offer: { type: 'percent', value: 20, label: '-20%' } },
    { id: 7, name: "Night Jasmine", category: "Floral", price: 89, stock: 20, subtitle: "Jasmine · Neroli", description: "Soft jasmine and orange blossom.", bottle: "light", badge: "", bestSeller: false, offer: null },
    { id: 8, name: "Cedar Empire", category: "Musk", price: 155, stock: 14, subtitle: "Cedar · Vetiver · Musk", description: "Woody cedar with clean musk.", bottle: "blue", badge: "", bestSeller: true, offer: null },
  ],
  bundles: [
    { id: 1, name: "Discovery Set", description: "Three 30ml bottles to explore the collection.", productIds: [1, 2, 3], price: 249, badge: "Save 30%", active: true },
    { id: 2, name: "Oud Lovers", description: "Our two best oud fragrances.", productIds: [1, 5], price: 229, badge: "", active: true },
  ],
  orders: [
    { id: "N-1024", customer: "Ahmed Al Harbi", email: "ahmed@example.com", date: "2026-04-12", total: 258, status: "Delivered", items: [{ productId: 1, qty: 2, price: 129 }] },
    { id: "N-1025", customer: "Sara Al Mansoori", email: "sara@example.com", date: "2026-04-13", total: 119, status: "Processing", items: [{ productId: 2, qty: 1, price: 119 }] },
    { id: "N-1026", customer: "Khalid Al Suwaidi", email: "khalid@example.com", date: "2026-04-14", total: 407, status: "Shipped", items: [{ productId: 8, qty: 1, price: 155 }, { productId: 1, qty: 2, price: 126 }] },
    { id: "N-1027", customer: "Laila Al Qasimi", email: "laila@example.com", date: "2026-04-14", total: 99, status: "Processing", items: [{ productId: 3, qty: 1, price: 99 }] },
  ],
  customers: [
    { name: "Ahmed Al Harbi", email: "ahmed@example.com", orders: 4, spent: 516 },
    { name: "Sara Al Mansoori", email: "sara@example.com", orders: 2, spent: 238 },
    { name: "Khalid Al Suwaidi", email: "khalid@example.com", orders: 3, spent: 407 },
    { name: "Laila Al Qasimi", email: "laila@example.com", orders: 1, spent: 99 },
  ],
  settings: {
    language: 'en',
    radius: 6,
  },
};

/* ============================================================
   SUPABASE DETECTION
   ============================================================ */
function noirHasSupabase() {
  return typeof window.db !== 'undefined'
    && window.db
    && typeof window.db.from === 'function';
}

/* ============================================================
   LOCALSTORAGE FALLBACK
   ============================================================ */
function noirStoreLoad() {
  try {
    const raw = localStorage.getItem(NOIR_STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.version === NOIR_STORE_VERSION) {
        return {
          ...JSON.parse(JSON.stringify(NOIR_DEFAULT_DATA)),
          ...data,
          settings: { ...NOIR_DEFAULT_DATA.settings, ...(data.settings || {}) },
        };
      }
    }
  } catch (e) {}
  const fresh = JSON.parse(JSON.stringify(NOIR_DEFAULT_DATA));
  noirStoreSave(fresh);
  return fresh;
}

function noirStoreSave(data) {
  try { localStorage.setItem(NOIR_STORE_KEY, JSON.stringify(data)); } catch (e) {}
}

function noirStoreReset() {
  localStorage.removeItem(NOIR_STORE_KEY);
  return noirStoreLoad();
}

/* ============================================================
   GLOBAL STORE
   ============================================================ */
let NOIR_DB = noirStoreLoad();
let products = NOIR_DB.products;
let orders = NOIR_DB.orders;

function noirPersist() {
  NOIR_DB.products = products;
  NOIR_DB.orders = orders;
  noirStoreSave(NOIR_DB);
}

/* ============================================================
   HELPERS
   ============================================================ */
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
   SUPABASE LOADERS
   ============================================================ */
async function noirLoadFromSupabase() {
  if (!noirHasSupabase()) {
    console.info('[store] Supabase not configured — using localStorage only.');
    window.dispatchEvent(new CustomEvent('noir:data-ready', { detail: { source: 'localStorage' } }));
    return false;
  }
  try {
    const [productsRes, bundlesRes, ordersRes] = await Promise.all([
      window.db.from('products').select('*').order('id', { ascending: true }),
      window.db.from('bundles').select('*').order('id', { ascending: true }),
      window.db.from('orders').select('*').order('created_at', { ascending: false }),
    ]);

    if (productsRes.error) throw productsRes.error;
    if (bundlesRes.error) throw bundlesRes.error;
    if (ordersRes.error) throw ordersRes.error;

    NOIR_DB.products = (productsRes.data || []).map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      price: Number(row.price),
      stock: row.stock,
      subtitle: row.subtitle,
      description: row.description,
      bottle: row.bottle,
      badge: row.badge,
      bestSeller: row.best_seller === true,
      offer: row.offer || null,
    }));

    NOIR_DB.bundles = (bundlesRes.data || []).map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      productIds: row.product_ids || [],
      price: Number(row.price),
      badge: row.badge,
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

    products = NOIR_DB.products;
    orders = NOIR_DB.orders;

    noirStoreSave(NOIR_DB);

    console.info(`[store] loaded ${NOIR_DB.products.length} products, ${NOIR_DB.orders.length} orders from Supabase`);
    window.dispatchEvent(new CustomEvent('noir:data-ready', { detail: { source: 'supabase' } }));
    return true;
  } catch (err) {
    console.error('[store] Supabase load failed:', err);
    window.dispatchEvent(new CustomEvent('noir:data-ready', { detail: { source: 'localStorage', error: err.message } }));
    return false;
  }
}

/* ============================================================
   SUPABASE WRITERS
   ============================================================ */
async function noirSaveProductToDB(product) {
  if (!noirHasSupabase()) return false;
  try {
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
    const { error } = await window.db.from('products').upsert(row);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[store] save product failed:', err);
    return false;
  }
}

async function noirDeleteProductFromDB(id) {
  if (!noirHasSupabase()) return false;
  try {
    const { error } = await window.db.from('products').delete().eq('id', Number(id));
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[store] delete product failed:', err);
    return false;
  }
}

async function noirSaveBundleToDB(bundle) {
  if (!noirHasSupabase()) return false;
  try {
    const row = {
      id: bundle.id,
      name: bundle.name,
      description: bundle.description,
      product_ids: bundle.productIds,
      price: bundle.price,
      badge: bundle.badge || '',
      active: bundle.active !== false,
    };
    const { error } = await window.db.from('bundles').upsert(row);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[store] save bundle failed:', err);
    return false;
  }
}

async function noirDeleteBundleFromDB(id) {
  if (!noirHasSupabase()) return false;
  try {
    const { error } = await window.db.from('bundles').delete().eq('id', Number(id));
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[store] delete bundle failed:', err);
    return false;
  }
}

async function noirSaveOrderToDB(order) {
  if (!noirHasSupabase()) return false;
  try {
    const row = {
      id: order.id,
      customer_name: order.customer,
      customer_email: order.email,
      total: order.total,
      status: order.status || 'Processing',
      items: order.items || [],
    };
    const { error } = await window.db.from('orders').upsert(row);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[store] save order failed:', err);
    return false;
  }
}

async function noirUpdateOrderStatusInDB(id, status) {
  if (!noirHasSupabase()) return false;
  try {
    const { error } = await window.db.from('orders').update({ status }).eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[store] update order status failed:', err);
    return false;
  }
}

/* ============================================================
   EXPORTS
   ============================================================ */
window.noirGetProduct = noirGetProduct;
window.noirGetBundle = noirGetBundle;
window.noirComputePrice = noirComputePrice;
window.noirStoreSave = noirStoreSave;
window.noirPersist = noirPersist;
window.noirStoreReset = noirStoreReset;
window.noirHasSupabase = noirHasSupabase;
window.noirLoadFromSupabase = noirLoadFromSupabase;
window.noirSaveProductToDB = noirSaveProductToDB;
window.noirDeleteProductFromDB = noirDeleteProductFromDB;
window.noirSaveBundleToDB = noirSaveBundleToDB;
window.noirDeleteBundleFromDB = noirDeleteBundleFromDB;
window.noirSaveOrderToDB = noirSaveOrderToDB;
window.noirUpdateOrderStatusInDB = noirUpdateOrderStatusInDB;

/* ============================================================
   AUTO-LOAD ON READY
   ============================================================ */
(function autoLoad() {
  const run = () => {
    // Small delay so supabase-client.js has run
    setTimeout(() => { noirLoadFromSupabase(); }, 0);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();