/* ============================================================
   NOIR — Central Store (Supabase ONLY)
   All reads/writes go directly to Supabase.
   ============================================================ */

// Verbose logging is opt-in: add ?debug to the URL or set localStorage 'noir-debug' = '1'
const STORE_DEBUG = /[?&]debug\b/.test(location.search) || (function () { try { return localStorage.getItem('noir-debug') === '1'; } catch (e) { return false; } })();
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
  heroSlides: [],
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
    shippingFlat: 8,
    freeShippingOver: 99,
    codEnabled: true,
    cardEnabled: false,
    bankEnabled: false,
    bankDetails: '',
    paymentSandbox: false,
  },
};

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
  NOIR_DB.settings._paymentColumns = ('cod_enabled' in row);
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
    shippingFlat: row.shipping_flat != null ? Number(row.shipping_flat) : 8,
    freeShippingOver: row.free_shipping_over != null ? Number(row.free_shipping_over) : 99,
    codEnabled: row.cod_enabled !== false,
    cardEnabled: row.card_enabled === true,
    bankEnabled: row.bank_enabled === true,
    bankDetails: row.bank_details || '',
    paymentSandbox: row.payment_sandbox === true,
  };
}

async function noirLoadAppSettings() {
  if (!noirHasSupabase()) {
    storeWarn('noirLoadAppSettings: Supabase not configured');
    window.__noirSettingsReady = true;
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
    window.__noirSettingsReady = true;
    window.dispatchEvent(new CustomEvent('noir:settings-ready', { detail: NOIR_DB.settings }));
    return true;
  } catch (err) {
    storeErr('Load settings failed:', err);
    window.__noirSettingsReady = true;
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
  // Payment / shipping columns exist only after supabase/schema_upgrade.sql has run
  if (NOIR_DB.settings._paymentColumns) {
    row.shipping_flat = Number(NOIR_DB.settings.shippingFlat) || 0;
    row.free_shipping_over = Number(NOIR_DB.settings.freeShippingOver) || 0;
    row.cod_enabled = !!NOIR_DB.settings.codEnabled;
    row.card_enabled = !!NOIR_DB.settings.cardEnabled;
    row.bank_enabled = !!NOIR_DB.settings.bankEnabled;
    row.bank_details = NOIR_DB.settings.bankDetails || '';
    row.payment_sandbox = !!NOIR_DB.settings.paymentSandbox;
  }

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
  window.__noirSettingsReady = true;
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
    const [productsRes, bundlesRes, ordersRes, customersRes, heroRes] = await Promise.all([
      window.db.from('products').select('*').order('id', { ascending: true }),
      window.db.from('bundles').select('*').order('id', { ascending: true }),
      window.db.from('orders').select('*').order('created_at', { ascending: false }),
      window.db.from('customers').select('*').order('name', { ascending: true }),
      window.db.from('hero_slides').select('*').order('position', { ascending: true }),
    ]);

    if (productsRes.error) storeErr('products load failed:', productsRes.error);
    if (bundlesRes.error)  storeWarn('bundles load failed:', bundlesRes.error.message || bundlesRes.error);
    if (ordersRes.error)   storeWarn('orders load failed:', ordersRes.error.message || ordersRes.error);
    if (customersRes.error) storeWarn('customers load failed:', customersRes.error.message || customersRes.error);
    if (heroRes.error)     storeWarn('hero_slides load failed:', heroRes.error.message || heroRes.error);

    NOIR_DB.products = (productsRes.data || []).map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      price: Number(row.price),
      stock: row.stock,
      nameAr: row.name_ar || '',
      subtitle: row.subtitle,
      subtitleAr: row.subtitle_ar || '',
      description: row.description,
      descriptionAr: row.description_ar || '',
      bottle: row.bottle || '',
      badge: row.badge || '',
      badgeAr: row.badge_ar || '',
      bestSeller: row.best_seller === true,
      offer: row.offer || null,
    }));

    NOIR_DB.bundles = (bundlesRes.data || []).map(row => ({
      id: row.id,
      name: row.name,
      nameAr: row.name_ar || '',
      description: row.description,
      descriptionAr: row.description_ar || '',
      productIds: row.product_ids || [],
      price: Number(row.price),
      badge: row.badge || '',
      badgeAr: row.badge_ar || '',
      bottle: row.bottle || '',
      active: row.active !== false,
    }));

    NOIR_DB.orders = (ordersRes.data || []).map(row => ({
      id: row.id,
      customer: row.customer_name,
      email: row.customer_email,
      address: row.address || '',
      customerId: row.customer_id || null,
      date: row.created_at ? row.created_at.slice(0, 10) : '',
      createdAt: row.created_at || '',
      total: Number(row.total),
      subtotal: row.subtotal != null ? Number(row.subtotal) : Number(row.total),
      shippingFee: Number(row.shipping_fee) || 0,
      status: row.status,
      items: row.items || [],
      phone: row.phone || '',
      city: row.city || '',
      notes: row.notes || '',
      paymentMethod: row.payment_method || 'cod',
      paymentStatus: row.payment_status || 'pending',
      paymentRef: row.payment_ref || '',
      paidAt: row.paid_at || '',
    }));

    NOIR_DB.customers = (customersRes.data || []).map(row => ({
      id: row.id,
      userId: row.user_id || null,
      ordersList: Array.isArray(row.orders) ? row.orders : [],
      name: row.name,
      email: row.email,
      avatarUrl: row.avatar_url || '',
      orders: Array.isArray(row.orders) ? row.orders.length : (Number(row.orders) || 0),
      spent: Number(row.spent) || 0,
    }));

    NOIR_DB.heroSlides = (heroRes.data || []).map(row => ({
      id: row.id,
      position: row.position,
      active: row.active !== false,
      theme: row.theme || 'classic',
      eyebrow: row.eyebrow || '',
      titleLine1: row.title_line1 || '',
      titleLine2: row.title_line2 || '',
      description: row.description || '',
      ctaText: row.cta_text || '',
      ctaLink: row.cta_link || '',
      note: row.note || '',
      bottleImage: row.bottle_image || '',
      artCaption: row.art_caption || '',
      videoUrl: row.video_url || '',
      videoPoster: row.video_poster || '',
      overlayOpacity: Number(row.overlay_opacity) || 45,
    }));

    window.NOIR_DB = NOIR_DB;

    storeLog(`Loaded: ${NOIR_DB.products.length} products, ${NOIR_DB.bundles.length} bundles, ${NOIR_DB.heroSlides.length} hero slides`);

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

async function noirRefreshStoreData() {
  const ok = await noirLoadFromSupabase();
  return ok;
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
    name_ar: product.nameAr || null,
    subtitle_ar: product.subtitleAr || null,
    description_ar: product.descriptionAr || null,
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
   WRITE: BUNDLE — uses `bottle` column (already exists)
   ============================================================ */
async function noirSaveBundleToDB(bundle) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');

  const row = {
    name: bundle.name,
    description: bundle.description,
    name_ar: bundle.nameAr || null,
    description_ar: bundle.descriptionAr || null,
    product_ids: bundle.productIds,
    price: bundle.price,
    badge: bundle.badge || '',
    bottle: bundle.bottle || '',
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
   WRITE: HERO SLIDE
   ============================================================ */
async function noirSaveHeroSlideToDB(slide) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');

  const row = {
    position: Number(slide.position) || 1,
    active: slide.active !== false,
    theme: slide.theme || 'classic',
    eyebrow: slide.eyebrow || '',
    title_line1: slide.titleLine1 || '',
    title_line2: slide.titleLine2 || '',
    description: slide.description || '',
    cta_text: slide.ctaText || '',
    cta_link: slide.ctaLink || '',
    note: slide.note || '',
    bottle_image: slide.bottleImage || '',
    art_caption: slide.artCaption || '',
    video_url: slide.videoUrl || '',
    video_poster: slide.videoPoster || '',
    overlay_opacity: Number(slide.overlayOpacity) || 45,
  };

  if (slide.id) {
    row.id = slide.id;
    const { data, error } = await window.db.from('hero_slides').upsert(row, { onConflict: 'id' }).select();
    if (error) throw error;
    return data && data[0] ? data[0] : row;
  }
  const { data, error } = await window.db.from('hero_slides').insert(row).select();
  if (error) throw error;
  return data && data[0] ? data[0] : row;
}

async function noirDeleteHeroSlideFromDB(id) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const { error } = await window.db.from('hero_slides').delete().eq('id', Number(id));
  if (error) throw error;
  return true;
}

/* ============================================================
   WRITE: ORDER
   ============================================================ */
/**
 * Place an order. Prices, offers, stock and shipping are computed IN THE DATABASE
 * (place_order function) — the browser only sends what the customer chose.
 * Throws an Error whose .code is one of: empty_cart, missing_details,
 * insufficient_stock, payment_method_disabled, product_not_found, upgrade_required, unknown.
 */
async function noirPlaceOrder(input) {
  if (!noirHasSupabase()) { const e = new Error('Supabase not configured'); e.code = 'unknown'; throw e; }
  const { data, error } = await window.db.rpc('place_order', {
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone,
    p_address: input.address,
    p_city: input.city || '',
    p_notes: input.notes || '',
    p_payment_method: input.paymentMethod || 'cod',
    p_payment_ref: input.paymentRef || '',
    p_items: (input.items || []).map(l => ({ type: l.type, id: l.id, qty: l.qty })),
  });
  if (error) throw noirRpcError(error);
  return noirMapOrder(Array.isArray(data) ? data[0] : data);
}

function noirRpcError(error) {
  const msg = String(error && (error.message || error.details) || '');
  const e = new Error(msg);
  if (error && (error.code === 'PGRST202' || error.code === '42883')) e.code = 'upgrade_required';
  else {
    const m = msg.match(/^(empty_cart|missing_details|insufficient_stock|payment_method_disabled|invalid_payment_method|product_not_found|bundle_not_found|forbidden|cannot_cancel|cannot_pay|cannot_update|sandbox_disabled|order_not_found)(?::(.*))?/);
    e.code = m ? m[1] : 'unknown';
    e.detail = m && m[2] ? m[2] : '';
  }
  return e;
}

function noirMapOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    customer: row.customer_name,
    email: row.customer_email,
    phone: row.phone || '',
    address: row.address || '',
    city: row.city || '',
    notes: row.notes || '',
    customerId: row.customer_id || null,
    date: row.created_at ? row.created_at.slice(0, 10) : '',
    createdAt: row.created_at || '',
    total: Number(row.total),
    subtotal: row.subtotal != null ? Number(row.subtotal) : Number(row.total),
    shippingFee: Number(row.shipping_fee) || 0,
    status: row.status,
    items: row.items || [],
    paymentMethod: row.payment_method || 'cod',
    paymentStatus: row.payment_status || 'pending',
    paymentRef: row.payment_ref || '',
    paidAt: row.paid_at || '',
  };
}

/** Admin: change fulfilment status (logged on the timeline, notifies the customer). */
async function noirUpdateOrderStatusInDB(id, status, note) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const { error } = await window.db.rpc('admin_set_order_status', { p_order: id, p_status: status, p_note: note || null });
  if (error) throw noirRpcError(error);
  return true;
}

/** Admin: mark payment pending / paid / failed / refunded. */
async function noirSetPaymentStatusInDB(id, status, ref) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const { error } = await window.db.rpc('admin_set_payment', { p_order: id, p_status: status, p_ref: ref || null });
  if (error) throw noirRpcError(error);
  return true;
}

async function noirCancelMyOrder(id) {
  const { error } = await window.db.rpc('cancel_my_order', { p_order: id });
  if (error) throw noirRpcError(error);
  return true;
}

async function noirSubmitPaymentRef(id, ref, email) {
  const { error } = await window.db.rpc('submit_payment_ref', { p_order: id, p_ref: ref, p_email: email || null });
  if (error) throw noirRpcError(error);
  return true;
}

async function noirSandboxPay(id, success) {
  const { data, error } = await window.db.rpc('sandbox_pay_order', { p_order: id, p_success: !!success });
  if (error) throw noirRpcError(error);
  return noirMapOrder(Array.isArray(data) ? data[0] : data);
}

/** Customer's own orders (RLS limits the rows to the signed-in user). */
async function noirLoadMyOrders() {
  if (!noirHasSupabase()) return [];
  const { data, error } = await window.db.from('orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(noirMapOrder);
}

async function noirLoadOrderEvents(orderId) {
  if (!noirHasSupabase()) return [];
  const { data, error } = await window.db.from('order_events')
    .select('status, note, created_at').eq('order_id', orderId).order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Guest tracking: order number + email. Returns { order, events } or null. */
async function noirTrackOrder(orderId, email) {
  const { data, error } = await window.db.rpc('track_order', { p_order: orderId, p_email: email });
  if (error) throw noirRpcError(error);
  if (!data) return null;
  return {
    order: noirMapOrder({
      ...data.order, customer_email: email,
    }),
    events: data.events || [],
  };
}

/* ---------- NOTIFICATIONS ---------- */
async function noirLoadNotifications(limit) {
  if (!noirHasSupabase()) return [];
  const { data, error } = await window.db.from('notifications')
    .select('*').order('created_at', { ascending: false }).limit(limit || 30);
  if (error) { storeWarn('notifications load failed:', error.message || error); return []; }
  return data || [];
}
async function noirMarkNotificationsRead(ids) {
  if (!noirHasSupabase()) return;
  let q = window.db.from('notifications').update({ read: true }).eq('read', false);
  if (ids && ids.length) q = q.in('id', ids);
  const { error } = await q;
  if (error) storeWarn('mark read failed:', error.message || error);
}

/* ============================================================
   WRITE: CUSTOMER
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
  if (customer.avatarUrl) row.avatar_url = customer.avatarUrl;

  let { data, error } = await window.db
    .from('customers')
    .update(row)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const ins = await window.db.from('customers').insert(row).select().maybeSingle();
    if (ins.error) throw ins.error;
    data = ins.data;
  }
  return data;
}

/* ============================================================
   STORAGE HELPERS
   ============================================================ */
async function noirUploadProductImage(file) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const path = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const { data, error } = await window.db.storage
    .from('product-images')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: urlData } = window.db.storage
    .from('product-images')
    .getPublicUrl(data.path);
  return urlData.publicUrl;
}

async function noirUploadBundleImage(file) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const path = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const { data, error } = await window.db.storage
    .from('bundle-images')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: urlData } = window.db.storage
    .from('bundle-images')
    .getPublicUrl(data.path);
  return urlData.publicUrl;
}

async function noirUploadHeroVideo(file) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const path = `hero/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const { data, error } = await window.db.storage
    .from('bundle-images')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: urlData } = window.db.storage
    .from('bundle-images')
    .getPublicUrl(data.path);
  return urlData.publicUrl;
}

async function noirUploadUserAvatar(file) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  const { data: { user } } = await window.db.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  const path = `${user.id}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const { data, error } = await window.db.storage
    .from('user-avatars')
    .upload(path, file, { cacheControl: '3600', upsert: true });
  if (error) throw error;
  return data.path;
}

async function noirGetUserAvatarSignedUrl(path, expiresIn = 3600) {
  if (!noirHasSupabase()) throw new Error('Supabase not configured');
  if (!path) return '';
  const { data, error } = await window.db.storage
    .from('user-avatars')
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
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
window.noirSaveHeroSlideToDB = noirSaveHeroSlideToDB;
window.noirDeleteHeroSlideFromDB = noirDeleteHeroSlideFromDB;
window.noirPlaceOrder = noirPlaceOrder;
window.noirMapOrder = noirMapOrder;
window.noirUpdateOrderStatusInDB = noirUpdateOrderStatusInDB;
window.noirSetPaymentStatusInDB = noirSetPaymentStatusInDB;
window.noirCancelMyOrder = noirCancelMyOrder;
window.noirSubmitPaymentRef = noirSubmitPaymentRef;
window.noirSandboxPay = noirSandboxPay;
window.noirLoadMyOrders = noirLoadMyOrders;
window.noirLoadOrderEvents = noirLoadOrderEvents;
window.noirTrackOrder = noirTrackOrder;
window.noirLoadNotifications = noirLoadNotifications;
window.noirMarkNotificationsRead = noirMarkNotificationsRead;
window.noirLoadAppSettings = noirLoadAppSettings;
window.noirSaveAppSettings = noirSaveAppSettings;
window.noirSaveCustomerToDB = noirSaveCustomerToDB;
window.noirDEFAULT_SETTINGS = NOIR_DEFAULT_SETTINGS;
window.noirUploadProductImage = noirUploadProductImage;
window.noirUploadBundleImage = noirUploadBundleImage;
window.noirUploadHeroVideo = noirUploadHeroVideo;
window.noirUploadUserAvatar = noirUploadUserAvatar;
window.noirGetUserAvatarSignedUrl = noirGetUserAvatarSignedUrl;

/* ---------- AUTO-LOAD ---------- */
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