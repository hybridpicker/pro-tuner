// string-display.js — Renders and manages interactive string cards for Pro Tuner

export class StringDisplay {
    constructor(container) {
        this.container = container;
        this.strings = [];
        this.activeIndex = -1;
        this.lockedIndex = -1;
        this.onStringClick = null;
        this._longPressTimer = null;
        this._longPressDelay = 500;
    }

    render(tuning) {
        this.container.innerHTML = '';
        this.strings = tuning.strings || [];
        this.activeIndex = -1;
        this.lockedIndex = -1;

        this.strings.forEach((str, i) => {
            const card = document.createElement('div');
            card.className = 'string-card';
            card.dataset.index = i;
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `String ${str.stringNum}, ${str.note}, ${str.freq} Hz`);

            card.innerHTML =
                `<div class="string-card__name">String ${str.stringNum}</div>` +
                `<div class="string-card__note">${str.note}</div>` +
                `<div class="string-card__freq">${str.freq} Hz</div>`;

            this._bindCardEvents(card, str, i);
            this.container.appendChild(card);
        });
    }

    _bindCardEvents(card, str, index) {
        // Single click
        card.addEventListener('click', () => {
            if (this.onStringClick) {
                this.onStringClick(str, index);
            }
        });

        // Double-click toggles lock
        card.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this.toggleLock(index);
        });

        // Long-press toggles lock (touch devices)
        card.addEventListener('touchstart', (e) => {
            this._longPressTimer = setTimeout(() => {
                e.preventDefault();
                this.toggleLock(index);
            }, this._longPressDelay);
        }, { passive: true });

        card.addEventListener('touchend', () => {
            clearTimeout(this._longPressTimer);
        });

        card.addEventListener('touchmove', () => {
            clearTimeout(this._longPressTimer);
        });

        // Keyboard: Enter/Space
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (this.onStringClick) {
                    this.onStringClick(str, index);
                }
            }
        });
    }

    setActive(stringIndex) {
        const cards = this.container.children;

        if (this.activeIndex >= 0 && this.activeIndex < cards.length) {
            cards[this.activeIndex].classList.remove('active');
        }

        this.activeIndex = stringIndex;

        if (stringIndex >= 0 && stringIndex < cards.length) {
            cards[stringIndex].classList.add('active');
        }
    }

    toggleLock(stringIndex) {
        const cards = this.container.children;

        // Unlock current
        if (this.lockedIndex >= 0 && this.lockedIndex < cards.length) {
            cards[this.lockedIndex].classList.remove('locked');
        }

        if (this.lockedIndex === stringIndex) {
            this.lockedIndex = -1;
        } else {
            this.lockedIndex = stringIndex;
            if (stringIndex >= 0 && stringIndex < cards.length) {
                cards[stringIndex].classList.add('locked');
            }
        }
    }

    getLockedIndex() {
        return this.lockedIndex;
    }

    onClick(callback) {
        this.onStringClick = callback;
    }

    reset() {
        this.container.innerHTML = '';
        this.strings = [];
        this.activeIndex = -1;
        this.lockedIndex = -1;
        // Intentionally preserve onStringClick callback across resets
    }
}
