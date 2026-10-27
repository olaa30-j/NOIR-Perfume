/* ============================================================
   THEME CUSTOMIZER — full user control + radius
   Radius is read from Supabase (NOIR_DB.settings.radius) and
   persisted through noirSaveAppSettings().
   ============================================================ */
(function initThemeCustomizer() {
    const STORAGE = 'noir-theme-prefs';

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

    let prefs = load();

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE);
            if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
        } catch (e) { }
        return { ...DEFAULT };
    }

    function save() {
        try { localStorage.setItem(STORAGE, JSON.stringify(prefs)); } catch (e) { }
    }

    function isLightColor(hex) {
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
                apply(); save(); syncUI();
            });
            presetBox.appendChild(b);
        });

        panel.querySelectorAll('.tc-color-input').forEach((inp) => {
            if (inp.type === 'range') return;
            inp.addEventListener('input', () => {
                prefs[inp.dataset.key] = inp.value;
                prefs.preset = 'custom';
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
                apply(); save(); syncUI();
            });
            fontBox.appendChild(b);
        });

        // Radius slider (persisted to Supabase)
        const radiusInp = panel.querySelector('#tc-radius');
        const radiusVal = panel.querySelector('#tc-radius-val');
        const initialR = Number((typeof NOIR_DB !== 'undefined' && NOIR_DB.settings?.radius) ?? 6);
        radiusInp.value = initialR;
        radiusVal.textContent = initialR + 'px';

        radiusInp.addEventListener('input', async () => {
            const r = Number(radiusInp.value);
            radiusVal.textContent = r + 'px';
            if (typeof NOIR_DB !== 'undefined') NOIR_DB.settings.radius = r;
            applyRadius(r);
            if (typeof noirSaveAppSettings === 'function') {
                try { await noirSaveAppSettings({ radius: r }); }
                catch (err) {
                    if (typeof showToast === 'function') showToast('Radius saved locally — DB error');
                }
            }
        });

        panel.querySelector('.tc-reset').addEventListener('click', () => {
            prefs = { ...DEFAULT };
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

    /* --- Apply from DB whenever settings arrive --- */
    function applyFromDB() {
        const s = (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings) || {};

        if (s.theme && PRESETS[s.theme]) {
            prefs = { ...prefs, ...PRESETS[s.theme], preset: s.theme };
        }
        apply();

        if (typeof s.radius === 'number') applyRadius(s.radius);
    }

    // first paint (avoid flash)
    apply();
    if (typeof NOIR_DB !== 'undefined' && NOIR_DB.settings.radius != null) {
        applyRadius(NOIR_DB.settings.radius);
    }

    // listen for Supabase settings
    window.addEventListener('noir:settings-ready', applyFromDB);
    window.addEventListener('noir:radius-change', (e) => applyRadius(e.detail));

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { buildUI(); syncUI(); applyFromDB(); });
    } else {
        buildUI(); syncUI(); applyFromDB();
    }

    window.noirTheme = { apply, save, applyRadius, get prefs() { return prefs; }, PRESETS, applyFromDB };
    window.noirApplyRadius = applyRadius;
})();