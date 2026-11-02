/* ============================================================
   THEME CUSTOMIZER — DB-only source of truth + loading screen
   - Source of truth: Supabase (NOIR_DB.settings) — set by the admin
   - Loading screen shows until DB responds (or 8s timeout)
   - No localStorage cache, no per-visitor override:
     the store theme from the backend is the ONLY theme.
   ============================================================ */
(function initThemeCustomizer() {
    const PRESETS = {
        midnight: { bg: '#07111c', text: '#f5ead7', accent: '#c89b55', serif: 'Cormorant Garamond', sans: 'DM Sans', label: 'Midnight' },
        aurora:   { bg: '#0b0a1a', text: '#eae7f7', accent: '#8b7fd4', serif: 'Playfair Display',   sans: 'Inter', label: 'Aurora' },
        emerald:  { bg: '#06120d', text: '#e8f5ec', accent: '#4fae7a', serif: 'Cormorant Garamond', sans: 'DM Sans', label: 'Emerald' },
        crimson:  { bg: '#12060a', text: '#f7e8ec', accent: '#c4506a', serif: 'Playfair Display',   sans: 'Inter', label: 'Crimson' },
        sapphire: { bg: '#060d1f', text: '#e6edfb', accent: '#5b9bd5', serif: 'Playfair Display',   sans: 'Inter', label: 'Sapphire' },
        oud:      { bg: '#130c07', text: '#f3e6d6', accent: '#d08a3e', serif: 'Libre Baskerville',  sans: 'Manrope', label: 'Oud' },
        onyx:     { bg: '#0a0a0b', text: '#ededee', accent: '#c7c9cf', serif: 'Playfair Display',   sans: 'Inter', label: 'Onyx' },
        ivory:    { bg: '#f6f2ea', text: '#2a2418', accent: '#a67c3a', serif: 'Cormorant Garamond', sans: 'DM Sans', label: 'Ivory' },
        rose:     { bg: '#faf1ee', text: '#3a2226', accent: '#b5586b', serif: 'Playfair Display',   sans: 'Inter', label: 'Rosé' },
        sand:     { bg: '#efe3cc', text: '#2b2417', accent: '#9a5b2c', serif: 'Libre Baskerville',  sans: 'Manrope', label: 'Sand' },
    };

    const HEX_RE = /^#[0-9a-f]{6}$/i;

    const FONT_PAIRS = [
        { id: 'classic',   serif: 'Cormorant Garamond', sans: 'DM Sans',  label: 'Classic',   sub: 'Cormorant + DM Sans' },
        { id: 'editorial', serif: 'Playfair Display',   sans: 'Inter',    label: 'Editorial', sub: 'Playfair + Inter' },
        { id: 'modern',    serif: 'Libre Baskerville',  sans: 'Manrope',  label: 'Modern',    sub: 'Baskerville + Manrope' },
    ];

    const DEFAULT = { ...PRESETS.midnight, preset: 'midnight', fontPair: 'classic' };

    // DB is the source of truth. `prefs` is only the in-memory working copy
    // used for painting and for the admin customizer form.
    let prefs = { ...DEFAULT };
    let dbLoaded = false;

    /* ---------- Save (DB only) ---------- */
    function save() {
        if (typeof noirSaveAppSettings !== 'function') {
            console.warn('[theme] noirSaveAppSettings not available');
            return;
        }
        if (typeof NOIR_DB === 'undefined' || !NOIR_DB.settings) {
            console.warn('[theme] NOIR_DB.settings not available');
            return;
        }

        const payload = {
            theme: prefs.preset || null,
            fontSerif: prefs.serif || null,
            fontSans: prefs.sans || null,
            bgColor: prefs.bg || null,
            textColor: prefs.text || null,
            accentColor: prefs.accent || null,
        };
        Object.assign(NOIR_DB.settings, payload);

        noirSaveAppSettings(payload).catch(err => {
            console.warn('[theme] DB save failed:', err);
            if (typeof showToast === 'function') showToast('Theme could not be saved to DB');
        });
    }

    /* ---------- Helpers ---------- */
    function isLightColor(hex) {
        if (!hex || hex.length < 4) return false;
        const c = hex.replace('#', '');
        if (c.length < 6) return false;
        const r = parseInt(c.substr(0, 2), 16);
        const g = parseInt(c.substr(2, 2), 16);
        const b = parseInt(c.substr(4, 2), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 > 140;
    }

    // Readable text colour for anything painted with the accent
    // (buttons, badges). Uses WCAG relative luminance.
    function relLuminance(hex) {
        const c = hex.replace('#', '');
        const ch = [0, 2, 4].map((i) => {
            const v = parseInt(c.substr(i, 2), 16) / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    }
    function contrastRatio(a, b) {
        const l1 = relLuminance(a), l2 = relLuminance(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    function onAccentFor(accent, bg, text) {
        if (!HEX_RE.test(accent)) return bg;
        const candidates = [bg, text, '#0b0b0b', '#ffffff'].filter((c) => HEX_RE.test(c));
        return candidates.reduce((best, c) =>
            contrastRatio(accent, c) > contrastRatio(accent, best) ? c : best, candidates[0]);
    }

    // Which font-pair button matches the current serif/sans combo
    function pairIdFor(serif, sans) {
        const m = FONT_PAIRS.find((f) => f.serif === serif && f.sans === sans);
        return m ? m.id : null;
    }

    const loadedFonts = new Set();
    function loadFont(name) {
        if (!name || loadedFonts.has(name)) return;
        loadedFonts.add(name);
        const family = name.replace(/\s+/g, '+');
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`;
        document.head.appendChild(link);
    }

    let transitionTimer = null;
    function apply(animate) {
        const root = document.documentElement;
        if (animate === true) {
            root.classList.add('theme-transition');
            clearTimeout(transitionTimer);
            transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), 600);
        }
        prefs.fontPair = pairIdFor(prefs.serif, prefs.sans);
        root.style.setProperty('--bg', prefs.bg);
        root.style.setProperty('--on-accent', onAccentFor(prefs.accent, prefs.bg, prefs.text));
        root.style.setProperty('--text', prefs.text);
        root.style.setProperty('--accent', prefs.accent);
        root.style.setProperty('--font-serif', `"${prefs.serif}"`);
        root.style.setProperty('--font-sans', `"${prefs.sans}"`);
        if (prefs.preset && PRESETS[prefs.preset]) {
            root.setAttribute('data-theme', prefs.preset);
        } else {
            root.removeAttribute('data-theme');
        }
        root.style.colorScheme = isLightColor(prefs.bg) ? 'light only' : 'dark only';
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            document.head.appendChild(meta);
        }
        meta.content = prefs.bg;
        loadFont(prefs.serif);
        loadFont(prefs.sans);
        window.dispatchEvent(new CustomEvent('noir:theme'));
    }

    function applyRadius(r) {
        const val = Number(r) || 6;
        document.documentElement.style.setProperty('--radius', val + 'px');
    }

    /* ---------- Loader ---------- */
    function hideLoader() {
        const el = document.getElementById('noir-loader');
        if (el) {
            el.classList.add('hidden');
            setTimeout(() => { try { el.remove(); } catch (e) { } }, 400);
        }
    }

    // Fallback: if the DB never answers, don't trap the visitor behind the loader.
    // When Supabase isn't configured at all there is nothing to wait for.
    const noBackend = !window.db;
    let loaderFallbackTimer = setTimeout(function () {
        console.warn('[theme] DB timeout — hiding loader');
        hideLoader();
    }, noBackend ? 700 : 8000);

    /* ---------- DB → prefs (المصدر الوحيد) ---------- */
    function applyFromDB() {
        const s = (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings) || {};

        // 1) preset (store-wide theme chosen by the admin)
        if (s.theme && PRESETS[s.theme]) {
            prefs = { ...prefs, ...PRESETS[s.theme], preset: s.theme };
        } else if (s.theme === 'custom') {
            prefs.preset = 'custom';
        }

        // 2) manual font/color overrides (أولوية أعلى من preset)
        if (s.fontSerif) prefs.serif = s.fontSerif;
        if (s.fontSans) prefs.sans = s.fontSans;
        if (s.bgColor) prefs.bg = s.bgColor;
        if (s.textColor) prefs.text = s.textColor;
        if (s.accentColor) prefs.accent = s.accentColor;

        apply(true);

        if (typeof s.radius === 'number') applyRadius(s.radius);

        dbLoaded = true;

        // ✅ DB وصل — اخفي اللودر
        clearTimeout(loaderFallbackTimer);
        hideLoader();
    }

    /* ---------- UI (admin only) ---------- */
    function buildUI() {
        if (document.getElementById('theme-customizer')) return;
        if (!document.getElementById('admin-app')) return;

        const fab = document.createElement('button');
        fab.className = 'theme-fab';
        fab.setAttribute('aria-label', 'Customize theme');
        fab.title = 'Customize theme';
        fab.innerHTML = '🎨';
        fab.addEventListener('click', open);
        document.body.appendChild(fab);

        const back = document.createElement('div');
        back.className = 'tc-backdrop';
        back.addEventListener('click', close);
        document.body.appendChild(back);

        const panel = document.createElement('aside');
        panel.id = 'theme-customizer';
        panel.className = 'theme-customizer';
        panel.setAttribute('aria-hidden', 'true');
        panel.innerHTML = `
      <header class="theme-customizer-head">
        <h2>Customize</h2>
        <button class="theme-customizer-close" aria-label="Close">×</button>
      </header>
      <div class="theme-customizer-body">
        <section class="tc-section">
          <p class="tc-section-label">Presets</p>
          <div class="tc-presets"></div>
        </section>
        <section class="tc-section">
          <p class="tc-section-label">Colors</p>
          <div class="tc-color-row">
            <label for="tc-bg">Background</label>
            <span class="tc-hex" data-hex="bg"></span>
            <input class="tc-color-input" type="color" id="tc-bg" data-key="bg">
          </div>
          <div class="tc-color-row">
            <label for="tc-text">Text</label>
            <span class="tc-hex" data-hex="text"></span>
            <input class="tc-color-input" type="color" id="tc-text" data-key="text">
          </div>
          <div class="tc-color-row">
            <label for="tc-accent">Accent</label>
            <span class="tc-hex" data-hex="accent"></span>
            <input class="tc-color-input" type="color" id="tc-accent" data-key="accent">
          </div>
        </section>
        <section class="tc-section">
          <p class="tc-section-label">Typography</p>
          <div class="tc-font-row"></div>
        </section>
        <section class="tc-section">
          <p class="tc-section-label">Corner radius</p>
          <div class="tc-color-row">
            <label for="tc-radius">Radius</label>
            <span class="tc-hex" id="tc-radius-val">6px</span>
            <input class="tc-color-input" type="range" id="tc-radius" min="0" max="24" step="1" style="width:120px">
          </div>
        </section>
      </div>
      <footer class="theme-customizer-foot">
        <button class="tc-reset">Reset</button>
      </footer>
    `;
        document.body.appendChild(panel);

        const presetBox = panel.querySelector('.tc-presets');
        Object.entries(PRESETS).forEach(([id, p]) => {
            const b = document.createElement('button');
            b.className = 'tc-preset';
            b.dataset.preset = id;
            b.style.setProperty('--p-bg', p.bg);
            b.style.setProperty('--p-accent', p.accent);
            b.title = p.label;
            b.setAttribute('aria-label', p.label + ' theme');
            b.addEventListener('click', () => {
                prefs = { ...prefs, ...p, preset: id };
                if (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings) {
                    NOIR_DB.settings.theme = id;
                    NOIR_DB.settings.fontSerif = p.serif;
                    NOIR_DB.settings.fontSans = p.sans;
                    NOIR_DB.settings.bgColor = p.bg;
                    NOIR_DB.settings.textColor = p.text;
                    NOIR_DB.settings.accentColor = p.accent;
                }
                apply(true); save(); syncUI();
            });
            presetBox.appendChild(b);
        });

        panel.querySelectorAll('.tc-color-input').forEach((inp) => {
            if (inp.type === 'range') return;
            inp.addEventListener('input', () => {
                prefs[inp.dataset.key] = inp.value;
                prefs.preset = 'custom';
                if (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings) {
                    const keyMap = { bg: 'bgColor', text: 'textColor', accent: 'accentColor' };
                    NOIR_DB.settings[keyMap[inp.dataset.key]] = inp.value;
                    NOIR_DB.settings.theme = 'custom';
                }
                apply(); save(); syncUI();
            });
        });

        const fontBox = panel.querySelector('.tc-font-row');
        FONT_PAIRS.forEach((fp) => {
            const b = document.createElement('button');
            b.className = 'tc-font-btn';
            b.dataset.font = fp.id;
            b.innerHTML = `<span class="f-serif">${fp.label}</span><small>${fp.sub}</small>`;
            b.addEventListener('click', () => {
                prefs.serif = fp.serif;
                prefs.sans = fp.sans;
                prefs.fontPair = fp.id;
                if (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings) {
                    NOIR_DB.settings.fontSerif = fp.serif;
                    NOIR_DB.settings.fontSans = fp.sans;
                }
                apply(); save(); syncUI();
            });
            fontBox.appendChild(b);
        });

        // Radius slider (DB-backed, debounced)
        const radiusInp = panel.querySelector('#tc-radius');
        const radiusVal = panel.querySelector('#tc-radius-val');
        const initialR = Number((typeof NOIR_DB !== 'undefined' && NOIR_DB.settings && NOIR_DB.settings.radius) ?? prefs.radius ?? 6);
        radiusInp.value = initialR;
        radiusVal.textContent = initialR + 'px';

        let radiusSaveTimer = null;
        radiusInp.addEventListener('input', () => {
            const r = Number(radiusInp.value);
            radiusVal.textContent = r + 'px';
            prefs.radius = r;
            if (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings) NOIR_DB.settings.radius = r;
            applyRadius(r);

            clearTimeout(radiusSaveTimer);
            radiusSaveTimer = setTimeout(async () => {
                if (typeof noirSaveAppSettings === 'function') {
                    try { await noirSaveAppSettings({ radius: r }); }
                    catch (err) {
                        console.warn('[theme] radius DB save failed:', err);
                        if (typeof showToast === 'function') showToast('Radius could not be saved to DB');
                    }
                }
            }, 300);
        });

        panel.querySelector('.tc-reset').addEventListener('click', () => {
            prefs = { ...DEFAULT };
            if (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings) {
                NOIR_DB.settings.theme = 'midnight';
                NOIR_DB.settings.fontSerif = DEFAULT.serif;
                NOIR_DB.settings.fontSans = DEFAULT.sans;
                NOIR_DB.settings.bgColor = DEFAULT.bg;
                NOIR_DB.settings.textColor = DEFAULT.text;
                NOIR_DB.settings.accentColor = DEFAULT.accent;
            }
            apply(); save(); syncUI();
        });

        panel.querySelector('.theme-customizer-close').addEventListener('click', close);

        function open() {
            panel.classList.add('open');
            back.classList.add('open');
            panel.setAttribute('aria-hidden', 'false');
        }
        function close() {
            panel.classList.remove('open');
            back.classList.remove('open');
            panel.setAttribute('aria-hidden', 'true');
        }
    }

    function syncUI() {
        const panel = document.getElementById('theme-customizer');
        if (!panel) return;
        panel.querySelectorAll('.tc-color-input').forEach((inp) => {
            if (inp.type === 'range') return;
            inp.value = prefs[inp.dataset.key];
        });
        panel.querySelectorAll('[data-hex]').forEach((el) => {
            el.textContent = prefs[el.dataset.hex];
        });
        panel.querySelectorAll('.tc-preset').forEach((el) => {
            const on = el.dataset.preset === prefs.preset;
            el.classList.toggle('active', on);
            el.setAttribute('aria-pressed', String(on));
        });
        panel.querySelectorAll('.tc-font-btn').forEach((el) => {
            el.classList.toggle('active', el.dataset.font === prefs.fontPair);
        });
    }

    /* ---------- Bootstrap ---------- */
    window.addEventListener('noir:settings-ready', applyFromDB);
    window.addEventListener('noir:radius-change', (e) => applyRadius(e.detail));

    // لو DB سبق ووصل (unlikely)، طبّق فورًا
    if (window.__noirSettingsReady) {
        applyFromDB();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            buildUI();
            syncUI();
        });
    } else {
        buildUI();
        syncUI();
    }

    /* ---------- Public API ---------- */
    window.noirTheme = {
        apply,
        save,
        applyRadius,
        applyFromDB,
        hideLoader,
        get prefs() { return prefs; },
        get isFromDB() { return dbLoaded; },
        PRESETS,
    };
    window.noirApplyRadius = applyRadius;
})();