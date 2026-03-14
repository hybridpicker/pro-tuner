const STORAGE_KEY = 'pro-tuner-settings';

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
        this.load();
    }

    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;

            for (const key of Object.keys(DEFAULTS)) {
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
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
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
        // Settings open/close
        const settingsToggle = document.getElementById('settingsToggle');
        const settingsClose = document.getElementById('settingsClose');
        const settingsPanel = document.getElementById('settingsPanel');
        const settingsOverlay = document.getElementById('settingsOverlay');

        const openPanel = () => {
            if (!settingsPanel || !settingsOverlay) return;
            settingsPanel.removeAttribute('hidden');
            settingsOverlay.removeAttribute('hidden');
            requestAnimationFrame(() => {
                settingsPanel.classList.add('visible');
                settingsOverlay.classList.add('visible');
            });
        };

        const closePanel = () => {
            if (!settingsPanel || !settingsOverlay) return;
            settingsPanel.classList.remove('visible');
            settingsOverlay.classList.remove('visible');
            const onEnd = () => {
                settingsPanel.setAttribute('hidden', '');
                settingsOverlay.setAttribute('hidden', '');
                settingsPanel.removeEventListener('transitionend', onEnd);
            };
            settingsPanel.addEventListener('transitionend', onEnd);
        };

        if (settingsToggle) settingsToggle.addEventListener('click', openPanel);
        if (settingsClose) settingsClose.addEventListener('click', closePanel);
        if (settingsOverlay) settingsOverlay.addEventListener('click', closePanel);

        // A4 Reference
        const a4Input = document.getElementById('a4Input');
        const a4Minus = document.getElementById('a4Minus');
        const a4Plus = document.getElementById('a4Plus');

        const updateA4Display = (val) => {
            if (a4Input) a4Input.value = val;
        };

        if (a4Minus) {
            a4Minus.addEventListener('click', () => {
                const curr = this.get('a4Reference');
                if (curr > 430) {
                    this.set('a4Reference', curr - 1);
                    updateA4Display(curr - 1);
                }
            });
        }

        if (a4Plus) {
            a4Plus.addEventListener('click', () => {
                const curr = this.get('a4Reference');
                if (curr < 450) {
                    this.set('a4Reference', curr + 1);
                    updateA4Display(curr + 1);
                }
            });
        }

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

        // Setting toggle groups
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

            // Set initial active state from stored value
            const current = this.get(settingKey);
            btns.forEach(btn => {
                const isActive = btn.dataset.value === String(current);
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-checked', String(isActive));
            });

            btns.forEach(btn => {
                btn.addEventListener('click', () => {
                    btns.forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-checked', 'false');
                    });
                    btn.classList.add('active');
                    btn.setAttribute('aria-checked', 'true');
                    this.set(settingKey, btn.dataset.value);
                });
            });
        };

        // Sensitivity
        wireToggleGroup('Sensitivity', 'sensitivity');

        // Notation
        wireToggleGroup('Notation', 'notation');

        // Transposition
        const transposition = document.getElementById('transposition');
        if (transposition) {
            transposition.value = String(this.get('transposition'));
            transposition.addEventListener('change', () => {
                this.set('transposition', parseInt(transposition.value, 10));
            });
        }
    }
}
