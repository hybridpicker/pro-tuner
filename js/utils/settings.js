const STORAGE_KEY = 'pro-tuner-settings';
const NON_PERSISTED_KEYS = new Set(['meterStyle']);

const DEFAULTS = {
    a4Reference: 440,
    meterStyle: 'needle',
    sensitivity: 'medium',
    notation: 'sharp',
    transposition: 0,
    theme: 'dark',
    lastInstrument: 'guitar',
    lastTuning: 'guitar-standard'
};

const VALID = {
    meterStyle: ['needle', 'strobe'],
    sensitivity: ['low', 'medium', 'high'],
    notation: ['sharp', 'flat'],
    theme: ['dark', 'light']
};

export class Settings {
    constructor() {
        this.values = { ...DEFAULTS };
        this.listeners = new Map();
        this._isPanelOpen = false;
        this._lastFocusedElement = null;
        this.load();
    }

    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;

            for (const key of Object.keys(DEFAULTS)) {
                if (NON_PERSISTED_KEYS.has(key)) continue;
                if (!(key in parsed)) continue;
                const val = parsed[key];

                if (key in VALID) {
                    if (VALID[key].includes(val)) this.values[key] = val;
                } else if (key === 'a4Reference') {
                    const n = Number(val);
                    if (Number.isFinite(n) && n >= 430 && n <= 450) this.values[key] = n;
                } else if (key === 'transposition') {
                    const n = Number(val);
                    if (Number.isInteger(n) && n >= -6 && n <= 0) this.values[key] = n;
                } else if (typeof val === typeof DEFAULTS[key]) {
                    this.values[key] = val;
                }
            }
        } catch {
            // Corrupted data — keep defaults
        }
    }

    save() {
        try {
            const persistedValues = {};
            for (const [key, value] of Object.entries(this.values)) {
                if (NON_PERSISTED_KEYS.has(key)) continue;
                persistedValues[key] = value;
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedValues));
        } catch {
            // Storage full or unavailable
        }
    }

    get(key) {
        return key in this.values ? this.values[key] : undefined;
    }

    set(key, value) {
        if (!(key in DEFAULTS)) return;
        this.values[key] = value;
        this.save();
        const cbs = this.listeners.get(key);
        if (cbs) {
            for (const cb of cbs) cb(value, key);
        }
    }

    onChange(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);
    }

    offChange(key, callback) {
        const cbs = this.listeners.get(key);
        if (cbs) cbs.delete(callback);
    }

    reset() {
        this.values = { ...DEFAULTS };
        this.save();
        for (const [key, cbs] of this.listeners) {
            for (const cb of cbs) cb(this.values[key], key);
        }
    }

    initPanel() {
        const settingsToggle = document.getElementById('settingsToggle');
        const settingsClose = document.getElementById('settingsClose');
        const settingsPanel = document.getElementById('settingsPanel');
        const settingsOverlay = document.getElementById('settingsOverlay');
        const a4Input = document.getElementById('a4Input');
        const a4Minus = document.getElementById('a4Minus');
        const a4Plus = document.getElementById('a4Plus');
        const transposition = document.getElementById('transposition');
        const focusSelector = 'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

        const getFocusable = () => {
            if (!settingsPanel) return [];
            return [...settingsPanel.querySelectorAll(focusSelector)]
                .filter((el) => !el.hasAttribute('disabled') && !el.hidden);
        };

        const closePanel = () => {
            if (!settingsPanel || !settingsOverlay || !this._isPanelOpen) return;
            this._isPanelOpen = false;
            settingsToggle?.setAttribute('aria-expanded', 'false');
            settingsPanel.classList.remove('visible');
            settingsOverlay.classList.remove('visible');
            const onEnd = () => {
                settingsPanel.setAttribute('hidden', '');
                settingsOverlay.setAttribute('hidden', '');
                settingsPanel.removeEventListener('transitionend', onEnd);
                this._lastFocusedElement?.focus?.();
            };
            settingsPanel.addEventListener('transitionend', onEnd, { once: true });
            window.setTimeout(onEnd, 450);
        };

        const openPanel = () => {
            if (!settingsPanel || !settingsOverlay || this._isPanelOpen) return;
            this._isPanelOpen = true;
            this._lastFocusedElement = document.activeElement;
            settingsToggle?.setAttribute('aria-expanded', 'true');
            settingsPanel.removeAttribute('hidden');
            settingsOverlay.removeAttribute('hidden');
            requestAnimationFrame(() => {
                settingsPanel.classList.add('visible');
                settingsOverlay.classList.add('visible');
                const focusable = getFocusable();
                (focusable[0] || settingsPanel).focus();
            });
        };

        const onDocumentKeydown = (event) => {
            if (!this._isPanelOpen || !settingsPanel) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                closePanel();
                return;
            }

            if (event.key !== 'Tab') return;

            const focusable = getFocusable();
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onDocumentKeydown);

        settingsToggle?.addEventListener('click', openPanel);
        settingsClose?.addEventListener('click', closePanel);
        settingsOverlay?.addEventListener('click', closePanel);

        const updateA4Display = (val) => {
            if (a4Input) a4Input.value = val;
        };

        a4Minus?.addEventListener('click', () => {
            const curr = this.get('a4Reference');
            if (curr > 430) {
                this.set('a4Reference', curr - 1);
                updateA4Display(curr - 1);
            }
        });

        a4Plus?.addEventListener('click', () => {
            const curr = this.get('a4Reference');
            if (curr < 450) {
                this.set('a4Reference', curr + 1);
                updateA4Display(curr + 1);
            }
        });

        if (a4Input) {
            a4Input.value = this.get('a4Reference');
            a4Input.addEventListener('change', () => {
                let val = parseInt(a4Input.value, 10);
                if (isNaN(val)) val = DEFAULTS.a4Reference;
                val = Math.max(430, Math.min(450, val));
                a4Input.value = val;
                this.set('a4Reference', val);
            });
        }

        const settingGroups = document.querySelectorAll('.setting-group');

        const findToggleGroup = (labelText) => {
            for (const group of settingGroups) {
                const label = group.querySelector('.setting-label');
                if (label && label.textContent.trim() === labelText) {
                    return group.querySelector('.setting-toggle');
                }
            }
            return null;
        };

        const wireToggleGroup = (labelText, settingKey) => {
            const toggle = findToggleGroup(labelText);
            if (!toggle) return;
            const btns = toggle.querySelectorAll('.setting-toggle__btn');

            const syncButtons = (value) => {
                btns.forEach((btn) => {
                    const isActive = btn.dataset.value === String(value);
                    btn.classList.toggle('active', isActive);
                    btn.setAttribute('aria-checked', String(isActive));
                });
            };

            syncButtons(this.get(settingKey));
            this.onChange(settingKey, syncButtons);

            btns.forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.set(settingKey, btn.dataset.value);
                });
            });
        };

        wireToggleGroup('Sensitivity', 'sensitivity');
        wireToggleGroup('Meter Style', 'meterStyle');
        wireToggleGroup('Notation', 'notation');

        if (transposition) {
            transposition.value = String(this.get('transposition'));
            transposition.addEventListener('change', () => {
                this.set('transposition', parseInt(transposition.value, 10));
            });
        }
    }
}
