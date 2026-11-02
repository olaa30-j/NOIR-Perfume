# NOIR — Arabian Luxury Perfumes

A static, build-free storefront (plain HTML / CSS / JS) backed by
[Supabase](https://supabase.com) and deployed to GitHub Pages.
Bilingual (English / Arabic with RTL), themeable, with an admin dashboard.

## Pages
| File | Purpose |
|------|---------|
| `index.html` | Home — hero slides, benefits, featured products, collections, story, newsletter |
| `shop.html` | Product grid with search / filter / sort |
| `collections.html` | Signature collections |
| `story.html` | Brand story |
| `cart.html` | Shopping bag |
| `login.html`, `account.html` | Auth and customer account |
| `admin.html` | Admin dashboard (products, bundles, orders, customers, hero slides, theme) |

## Structure
```
css/styles.css          design tokens, themes, shared components, animations
css/pages/*.css         page-specific styles (shop, collections, admin)
js/store.js             central data layer — all Supabase reads / writes
js/auth.js              sessions and roles (role comes from the `customers` table)
js/theme.js             theme engine + admin customizer + visitor override
js/ui-enhance.js        scroll progress, header state, reveal, back-to-top, skip link
js/i18n.js              EN / AR strings and RTL handling
js/components/*.js      <noir-layout>, <site-header>, <site-footer>, <site-cart>, <site-modals>
```

## Theming
Ten built-in presets, defined in **two** places that must stay in sync:
`PRESETS` in `js/theme.js` (colours + fonts) and the `[data-theme="…"]` blocks in `css/styles.css`.

| Dark | Light |
|------|-------|
| Midnight (default), Aurora, Emerald, Crimson, Sapphire, Oud, Onyx | Ivory, Rosé, Sand |

* **Store theme** — chosen by the admin in the customizer (🎨) and stored in `site_settings`.
* **Visitor theme** — the ◐ button in the header lets a visitor pick a preset for themselves
  (`localStorage` key `noir-visitor-theme`). It never changes the store theme.
* Text on accent-coloured surfaces uses `--on-accent`, picked automatically for WCAG contrast,
  so any custom accent colour stays readable.
* Light themes get their own overrides (darker accent text, softer shadows, darker footer).

To add a theme: add a `PRESETS` entry in `js/theme.js`, a `[data-theme]` block in `css/styles.css`
(plus the light-theme group if it is light).

## Setup
1. Create the Supabase tables: `products`, `bundles`, `orders`, `customers`, `carts`,
   `hero_slides`, `site_settings`.
2. **Enable Row Level Security** and restrict writes to admins — the admin page is static,
   so RLS is the real protection.
3. Add repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
   The GitHub Actions workflow generates `js/config.js` from them on every push to `main`.
4. For local work, create `js/config.js` yourself (it is git-ignored):
   ```js
   window.__ENV__ = { SUPABASE_URL: '…', SUPABASE_ANON_KEY: '…' };
   ```
5. **Run `supabase/schema_upgrade.sql` once** in the Supabase SQL editor *before* deploying this
   version. It adds the Arabic columns, payment/shipping settings, order tracking tables,
   notifications, the `place_order()` function and the RLS policies.
6. Serve the folder with any static server, e.g. `python3 -m http.server`.

## Orders, payments & tracking
- **Checkout** (details → payment → review) calls the server function `place_order()`, which
  computes prices, offers, stock and shipping — the browser never sends totals.
- **Payment methods**: cash on delivery, bank transfer (customer submits a reference), and
  card in **test mode only** (`payment_sandbox`). To go live, implement
  `noirCheckout.cardGateway` with a real gateway and verify payments server-side.
  Enable/disable methods and set shipping under Admin → Settings → Payments & shipping.
- **Progress**: Processing → Confirmed → Preparing → Shipped → Delivered (or Cancelled).
  Customers follow it in *My account* (guests: order number + email). Admin updates it in the
  order drawer; COD orders are marked paid on delivery.
- **Notifications**: bell for customers and admin, realtime with a 60s polling fallback.
- **Bilingual products**: name, subtitle and description in English and Arabic
  (admin forms and tables); the storefront shows the visitor's language (RTL for Arabic).
- **Admin**: charts on Overview (revenue, status, top products, payments, low stock) and
  PDF export for every table via the browser's print dialog ("Save as PDF").

## Debugging
Verbose console logging is off by default. Add `?debug` to the URL, or run
`localStorage.setItem('noir-debug', '1')`, to turn it on.
