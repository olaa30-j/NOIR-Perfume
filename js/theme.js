/* ============================================================
   THEME CUSTOMIZER — DB-first + loading screen
   - Source of truth: Supabase (NOIR_DB.settings)
   - Loading screen shows until DB responds (or 8s timeout)
   - No localStorage read on first paint (avoids flash)
   - localStorage is used ONLY as a write-through cache
   ============================================================ */
(function initThemeCustomizer() {
    const STORAGE = 'noir-theme-prefs'; // cache only

    const PRESETS = {
        midnight: { bg: '#07111c', text: '#f5ead7', accent: '#c89b55', serif: 'Cormorant Garamond', sans: 'DM Sans', label: 'Midnight' },
        aurora: { bg: '#0b0a1a', text: '#eae7f7', accent: '#8b7fd4', serif: 'Playfair Display', sans: 'Inter', label: 'Aurora' },
        emerald: { bg: '#06120d', text: '#e8f5ec', accent: '#4fae7a', serif: 'Cormorant Garamond', sans: 'DM Sans', label: 'Emerald' },
        crimson: { bg: '#12060a', text: '#f7e8ec', accent: '#c4506a', serif: 'Playfair Display', sans: 'Inter', label: 'Crimson' },
        ivory: { bg: '#f6f2ea', text: '#2a2418', accent: '#a67c3a', serif: 'Cormorant Garamond', sans: 'DM Sans', label: 'Ivory' },
    };

    const FONT_PAIRS = [
        { id: 'classic', serif: 'Cormorant Garamond', sans: 'DM Sans', label: 'Classic', sub: 'Cormorant + DM Sans' },
        { id: 'editorial', serif: 'Playfair Display', sans: 'Inter', label: 'Editorial', sub: 'Playfair + Inter' },
        { id: 'modern', serif: 'Libre Baskerville', sans: 'Manrope', label: 'Modern', sub: 'Baskerville + Manrope' },
    ];

    const DEFAULT = { ...PRESETS.midnight, preset: 'midnight', fontPair: 'classic' };

    // مفيش قراءة من localStorage في البداية — DEFAULT فقط.
    // DB هو المصدر، واللودر مخفي لحد ما DB يوصل.
    let prefs = { ...DEFAULT };
    let dbLoaded = false;

    /* ---------- Cache (write-only, لتحسين الأداء) ---------- */
    function writeCache() {
        try { localStorage.setItem(STORAGE, JSON.stringify(prefs)); } catch (e) { }
    }

    /* ---------- Save (DB + cache) ---------- */
    function save() {
        writeCache();
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
            if (typeof showToast === 'function') showToast('Theme saved locally — DB error');
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

    function apply() {
        const root = document.documentElement;
        root.style.setProperty('--bg', prefs.bg);
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

    // fallback: لو DB ماوصلش في 8 ثواني، نخفي اللودر
    let loaderFallbackTimer = setTimeout(function () {
        console.warn('[theme] DB timeout (8s) — hiding loader');
        hideLoader();
    }, 8000);

    /* ---------- DB → prefs (المصدر الرسمي) ---------- */
    function applyFromDB() {
        const s = (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings) || {};

        // 1) preset
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

        apply();

        if (typeof s.radius === 'number') applyRadius(s.radius);

        dbLoaded = true;
        writeCache();

        // ✅ DB وصل — اخفي اللودر
        clearTimeout(loaderFallbackTimer);
        hideLoader();
    }

    /* ---------- UI ---------- */
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
                apply(); save(); syncUI();
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
            writeCache();

            clearTimeout(radiusSaveTimer);
            radiusSaveTimer = setTimeout(async () => {
                if (typeof noirSaveAppSettings === 'function') {
                    try { await noirSaveAppSettings({ radius: r }); }
                    catch (err) {
                        console.warn('[theme] radius DB save failed:', err);
                        if (typeof showToast === 'function') showToast('Radius saved locally — DB error');
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
            el.classList.toggle('active', el.dataset.preset === prefs.preset);
        });
        panel.querySelectorAll('.tc-font-btn').forEach((el) => {
            el.classList.toggle('active', el.dataset.font === prefs.fontPair);
        });
    }

    /* ---------- Bootstrap ---------- */
    window.addEventListener('noir:settings-ready', applyFromDB);
    window.addEventListener('noir:radius-change', (e) => applyRadius(e.detail));

    // لو DB سبق ووصل (unlikely)، طبّق فورًا
    if (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings && NOIR_DB.settings.theme) {
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