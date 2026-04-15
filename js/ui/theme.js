// theme.js — Theme manager for Pro Tuner (dark/light mode)

const STORAGE_KEY = 'pro-tuner-theme';
const THEME_COLORS = {
    dark: '#e8a838',
    light: '#c88a20'
};

export class ThemeManager {
    constructor() {
        this.theme = 'dark';
    }

    init() {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (saved === 'dark' || saved === 'light') {
            this.theme = saved;
        }

        this._apply();

        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggle());
        }
    }

    toggle() {
        this.set(this.theme === 'dark' ? 'light' : 'dark');
    }

    set(theme) {
        if (theme !== 'dark' && theme !== 'light') return;
        this.theme = theme;
        localStorage.setItem(STORAGE_KEY, theme);
        this._apply();
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    }

    get() {
        return this.theme;
    }

    _apply() {
        if (this.theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }

        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            metaTheme.setAttribute('content', THEME_COLORS[this.theme]);
        }
    }
}
