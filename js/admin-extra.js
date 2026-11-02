/* ============================================================
   NOIR — admin helpers
   1. Charts   — dependency-free SVG (follow the active theme via CSS variables)
   2. PDF      — adminExportPDF(): a print-ready document in a hidden frame;
                 the browser's "Save as PDF" produces the file (Arabic-safe).
   ============================================================ */
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const money = (n) => '$' + (Math.round(Number(n) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money0 = (n) => '$' + Math.round(Number(n)).toLocaleString('en-US');

  /* ============================================================
     CHART DATA
     ============================================================ */
  const STATUS_COLOR = {
    Processing: 'var(--status-pending-fg)',
    Confirmed: '#5b9bd5',
    Preparing: '#8b7fd4',
    Shipped: '#c89b55',
    Delivered: 'var(--status-ok-fg)',
    Cancelled: 'var(--status-cancelled-fg)',
  };

  function dayKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /** Revenue + order count for each of the last `days` days (cancelled orders excluded from revenue). */
  function salesByDay(orders, days) {
    const out = [];
    const map = {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const row = { key: dayKey(d), date: d, revenue: 0, orders: 0 };
      out.push(row); map[row.key] = row;
    }
    orders.forEach((o) => {
      const d = new Date(o.createdAt || o.date);
      if (isNaN(d)) return;
      const row = map[dayKey(d)];
      if (!row) return;
      row.orders += 1;
      if (o.status !== 'Cancelled') row.revenue += Number(o.total) || 0;
    });
    return out;
  }

  function countBy(list, fn) { const m = {}; list.forEach((x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; }); return m; }

  function topProducts(orders, n) {
    const m = {};
    orders.filter((o) => o.status !== 'Cancelled').forEach((o) => (o.items || []).forEach((l) => {
      const name = l.name || '—';
      m[name] = m[name] || { name, qty: 0, revenue: 0 };
      m[name].qty += Number(l.qty) || 1;
      m[name].revenue += (Number(l.price) || 0) * (Number(l.qty) || 1);
    }));
    return Object.values(m).sort((a, b) => b.revenue - a.revenue).slice(0, n);
  }

  /* ============================================================
     SVG CHARTS
     ============================================================ */
  function niceMax(v) {
    if (v <= 0) return 10;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  function areaChart(rows) {
    const W = 640, H = 240, L = 46, R = 14, T = 14, B = 30;
    const iw = W - L - R, ih = H - T - B;
    const max = niceMax(Math.max.apply(null, rows.map((r) => r.revenue).concat([0])));
    const x = (i) => L + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
    const y = (v) => T + ih - (v / max) * ih;
    const pts = rows.map((r, i) => [x(i), y(r.revenue)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (T + ih) + ' L' + pts[0][0].toFixed(1) + ' ' + (T + ih) + ' Z';
    let grid = '';
    for (let g = 0; g <= 4; g++) {
      const v = (max / 4) * g, yy = y(v);
      grid += '<line class="ch-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/>' +
        '<text class="ch-tick" x="' + (L - 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end">' + money0(v) + '</text>';
    }
    const step = rows.length > 10 ? 3 : 1;
    const xl = rows.map((r, i) => (i % step === 0 || i === rows.length - 1)
      ? '<text class="ch-tick" x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + r.date.getDate() + '/' + (r.date.getMonth() + 1) + '</text>' : '').join('');
    const dots = rows.map((r, i) =>
      '<circle class="ch-dot" cx="' + x(i).toFixed(1) + '" cy="' + y(r.revenue).toFixed(1) + '" r="' + (r.revenue ? 3.5 : 2) + '"><title>' +
      esc(r.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' — ' + money(r.revenue) + ' · ' + r.orders + ' orders') + '</title></circle>').join('');
    return '<svg class="ch ch-area" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Revenue, last ' + rows.length + ' days">' +
      '<defs><linearGradient id="chGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".32"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>' +
      grid + xl + '<path d="' + area + '" fill="url(#chGrad)"/><path class="ch-line" d="' + line + '"/>' + dots + '</svg>';
  }

  function donutChart(parts, centerTop, centerBottom) {
    const total = parts.reduce((s, p) => s + p.value, 0);
    const R = 70, r = 46, C = 90;
    let acc = 0, arcs = '';
    if (!total) {
      arcs = '<circle cx="' + C + '" cy="' + C + '" r="' + ((R + r) / 2) + '" fill="none" class="ch-empty-ring" stroke-width="' + (R - r) + '"/>';
    } else {
      parts.filter((p) => p.value > 0).forEach((p) => {
        const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
        acc += p.value;
        const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
        if (p.value === total) {
          arcs += '<circle cx="' + C + '" cy="' + C + '" r="' + ((R + r) / 2) + '" fill="none" stroke="' + p.color + '" stroke-width="' + (R - r) + '"><title>' + esc(p.label + ': ' + p.value) + '</title></circle>';
          return;
        }
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const pt = (rad, a) => (C + rad * Math.cos(a)).toFixed(2) + ' ' + (C + rad * Math.sin(a)).toFixed(2);
        arcs += '<path d="M' + pt(R, a0) + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + pt(R, a1) + ' L' + pt(r, a1) + ' A' + r + ' ' + r + ' 0 ' + large + ' 0 ' + pt(r, a0) + ' Z" fill="' + p.color + '" class="ch-seg"><title>' + esc(p.label + ': ' + p.value) + '</title></path>';
      });
    }
    return '<svg class="ch ch-donut" viewBox="0 0 180 180" role="img" aria-label="' + esc(parts.map((p) => p.label + ' ' + p.value).join(', ')) + '">' + arcs +
      '<text class="ch-center" x="90" y="88" text-anchor="middle">' + esc(centerTop) + '</text>' +
      '<text class="ch-center-sub" x="90" y="106" text-anchor="middle">' + esc(centerBottom) + '</text></svg>';
  }

  function legend(parts) {
    return '<ul class="ch-legend">' + parts.map((p) =>
      '<li><i style="background:' + p.color + '"></i><span>' + esc(p.label) + '</span><strong>' + p.value + '</strong></li>').join('') + '</ul>';
  }

  function barList(items, fmt) {
    if (!items.length) return '<p class="admin-empty">No sales yet.</p>';
    const max = Math.max.apply(null, items.map((i) => i.value)) || 1;
    return '<ul class="ch-bars">' + items.map((i) =>
      '<li><div class="ch-bar-top"><span>' + esc(i.label) + '</span><strong>' + esc(fmt ? fmt(i.value) : i.value) + '</strong></div>' +
      '<div class="ch-bar"><span style="width:' + Math.max(3, (i.value / max) * 100).toFixed(1) + '%"></span></div>' +
      (i.sub ? '<small>' + esc(i.sub) + '</small>' : '') + '</li>').join('') + '</ul>';
  }

  /** Whole charts section for the Overview tab. */
  function overviewCharts(db) {
    const orders = db.orders || [];
    const rows = salesByDay(orders, 14);
    const rev14 = rows.reduce((s, r) => s + r.revenue, 0);
    const ord14 = rows.reduce((s, r) => s + r.orders, 0);

    const stCount = countBy(orders, (o) => o.status);
    const stParts = ['Processing', 'Confirmed', 'Preparing', 'Shipped', 'Delivered', 'Cancelled']
      .map((s) => ({ label: s, value: stCount[s] || 0, color: STATUS_COLOR[s] }));

    const methodLabel = { cod: 'Cash on delivery', card: 'Card', bank_transfer: 'Bank transfer' };
    const mCount = countBy(orders.filter((o) => o.status !== 'Cancelled'), (o) => o.paymentMethod || 'cod');
    const methodItems = Object.keys(mCount).map((k) => ({ label: methodLabel[k] || k, value: mCount[k] }));

    const top = topProducts(orders, 5).map((p) => ({ label: p.name, value: p.revenue, sub: p.qty + ' sold' }));

    const lowStock = (db.products || []).filter((p) => p.stock <= 3).sort((a, b) => a.stock - b.stock).slice(0, 5);

    return '<div class="chart-grid">' +
      '<section class="admin-panel chart-wide"><div class="chart-head"><div><h3>Revenue</h3><p>Last 14 days</p></div>' +
        '<div class="chart-kpis"><span><small>Revenue</small><strong>' + money(rev14) + '</strong></span><span><small>Orders</small><strong>' + ord14 + '</strong></span></div></div>' +
        areaChart(rows) + '</section>' +
      '<section class="admin-panel"><div class="chart-head"><div><h3>Orders by status</h3><p>All time</p></div></div>' +
        '<div class="chart-donut">' + donutChart(stParts, String(orders.length), 'orders') + legend(stParts) + '</div></section>' +
      '<section class="admin-panel"><div class="chart-head"><div><h3>Top products</h3><p>By revenue</p></div></div>' +
        barList(top, money0) + '</section>' +
      '<section class="admin-panel"><div class="chart-head"><div><h3>Payment methods</h3><p>Active orders</p></div></div>' +
        barList(methodItems.sort((a, b) => b.value - a.value), (v) => v + ' orders') + '</section>' +
      '<section class="admin-panel"><div class="chart-head"><div><h3>Low stock</h3><p>3 units or fewer</p></div></div>' +
        (lowStock.length
          ? barList(lowStock.map((p) => ({ label: p.name, value: p.stock, sub: p.stock === 0 ? 'Out of stock' : '' })), (v) => v + ' left')
          : '<p class="admin-empty">All products are well stocked.</p>') + '</section>' +
    '</div>';
  }

  /* ============================================================
     PDF EXPORT (print-ready document in a hidden frame)
     ============================================================ */
  /**
   * adminExportPDF({ title, subtitle, columns:[{key,label,align}], rows:[{…}], totals:[{label,value}], landscape })
   * Cells may be plain text; values are escaped. Opens the browser's print dialog
   * (choose "Save as PDF"). Works for Arabic content (rendered with Cairo).
   */
  function exportPDF(opt) {
    const cols = opt.columns || [];
    const rows = opt.rows || [];
    const store = (window.NOIR_DB && window.NOIR_DB.settings && window.NOIR_DB.settings.projectName) || 'NOIR';
    const now = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    const head = cols.map((c) => '<th class="' + (c.align || '') + '">' + esc(c.label) + '</th>').join('');
    const body = rows.length
      ? rows.map((r) => '<tr>' + cols.map((c) => '<td class="' + (c.align || '') + '" dir="auto">' + esc(r[c.key]) + '</td>').join('') + '</tr>').join('')
      : '<tr><td colspan="' + cols.length + '" class="empty">No records</td></tr>';
    const totals = (opt.totals || []).map((t) => '<div><span>' + esc(t.label) + '</span><strong>' + esc(t.value) + '</strong></div>').join('');
    const meta = (opt.meta || []).map((m) => '<div><span>' + esc(m.label) + '</span><strong dir="auto">' + esc(m.value) + '</strong></div>').join('');

    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc(opt.title) + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">' +
      '<style>' +
      '@page{size:A4 ' + (opt.landscape === false ? 'portrait' : 'landscape') + ';margin:14mm 12mm}' +
      '*{box-sizing:border-box}body{margin:0;font:11px/1.5 "DM Sans","Cairo",Arial,sans-serif;color:#1d1a14}' +
      'header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #a67c3a;padding-bottom:10px;margin-bottom:14px}' +
      '.brand{font:600 26px/1 Georgia,serif;letter-spacing:.06em;color:#8a6428}.brand small{display:block;font:600 8px "DM Sans",sans-serif;letter-spacing:.4em;color:#555;margin-top:5px}' +
      'h1{font:600 17px/1.2 "DM Sans","Cairo",sans-serif;margin:0 0 3px;text-align:right}.sub{color:#666;text-align:right;font-size:10px}' +
      '.meta{display:flex;flex-wrap:wrap;gap:6px 22px;margin:0 0 12px}.meta div,.totals div{display:flex;gap:6px}.meta span,.totals span{color:#777}' +
      'table{width:100%;border-collapse:collapse}th{background:#f3ecdd;color:#5b4520;text-transform:uppercase;font-size:8.5px;letter-spacing:.08em;text-align:left;padding:7px 8px;border-bottom:1.5px solid #a67c3a}' +
      'td{padding:6px 8px;border-bottom:1px solid #e6dfd0;vertical-align:top}tr{break-inside:avoid}tbody tr:nth-child(even) td{background:#fbf8f2}' +
      '.right{text-align:right}.center{text-align:center}.empty{text-align:center;color:#888;padding:22px}' +
      '.totals{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px 26px;margin-top:12px;padding-top:10px;border-top:1.5px solid #a67c3a;font-size:12px}' +
      'footer{margin-top:16px;color:#888;font-size:9px;display:flex;justify-content:space-between}' +
      '</style></head><body>' +
      '<header><div class="brand">' + esc(String(store).split(/\s+/)[0].toUpperCase()) + '<small>ARABIAN PERFUMES</small></div>' +
      '<div><h1>' + esc(opt.title) + '</h1><div class="sub">' + esc(opt.subtitle || '') + '</div></div></header>' +
      (meta ? '<div class="meta">' + meta + '</div>' : '') +
      '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>' +
      (totals ? '<div class="totals">' + totals + '</div>' : '') +
      '<footer><span>' + esc(store) + ' · ' + rows.length + ' record(s)</span><span>Generated ' + esc(now) + '</span></footer>' +
      '</body></html>';

    // reuse one hidden frame
    let frame = document.getElementById('noir-pdf-frame');
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.id = 'noir-pdf-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open(); doc.write(html); doc.close();

    const run = () => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch (e) { console.error('[pdf] print failed', e); }
    };
    // print once fonts are ready (but never wait more than ~2.5s — offline works too)
    let done = false;
    const go = () => { if (done) return; done = true; run(); };
    setTimeout(go, 2500);
    try { frame.contentWindow.document.fonts.ready.then(() => setTimeout(go, 150)); } catch (e) { setTimeout(go, 400); }
  }

  window.NoirAdminCharts = { overviewCharts, salesByDay, topProducts, areaChart, donutChart };
  window.adminExportPDF = exportPDF;
  window.adminMoneyFmt = money;
})();
