const THEME_STORAGE_KEY = 'lhamacorp-proxy-theme';
const THEME_LIGHT = 'light';
const THEME_DARK = 'dark';

class ThemeManager {
  constructor() {
    this.currentTheme = this.getStoredTheme();
    this.init();
  }

  init() {
    this.applyTheme(this.currentTheme);
    this.updateToggleButton(this.currentTheme);
  }

  getStoredTheme() {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored && (stored === THEME_LIGHT || stored === THEME_DARK) ? stored : THEME_LIGHT;
    } catch (error) {
      return THEME_LIGHT;
    }
  }

  storeTheme(theme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {}
  }

  applyTheme(theme) {
    if (theme === THEME_DARK) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    this.currentTheme = theme;
  }

  toggleTheme() {
    const previousTheme = this.currentTheme;
    const newTheme = previousTheme === THEME_LIGHT ? THEME_DARK : THEME_LIGHT;
    this.applyTheme(newTheme);
    this.storeTheme(newTheme);
    this.updateToggleButton(newTheme);

    document.dispatchEvent(new CustomEvent('themeChanged', {
      detail: { theme: newTheme, previousTheme }
    }));
  }

  updateToggleButton(theme) {
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
      toggleBtn.innerHTML = theme === THEME_DARK ? '☀️' : '🌙';
      toggleBtn.title = theme === THEME_DARK ? 'Switch to light mode' : 'Switch to dark mode';
    }
  }

  setupToggleButton() {
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleTheme());
    }
  }

  getCurrentTheme() {
    return this.currentTheme;
  }

  setTheme(theme) {
    if (theme === THEME_LIGHT || theme === THEME_DARK) {
      this.applyTheme(theme);
      this.storeTheme(theme);
      this.updateToggleButton(theme);
    }
  }

  isDarkTheme() {
    return this.currentTheme === THEME_DARK;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThemeManager, THEME_LIGHT, THEME_DARK };
}

window.themeManager = new ThemeManager();
