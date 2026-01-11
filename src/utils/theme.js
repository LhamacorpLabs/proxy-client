/**
 * Theme utility module for handling dark/light theme switching and persistence
 */

const THEME_STORAGE_KEY = 'lhamacorp-proxy-theme';
const THEME_LIGHT = 'light';
const THEME_DARK = 'dark';

/**
 * Theme Manager class to handle theme switching and persistence
 */
class ThemeManager {
  constructor() {
    this.currentTheme = this.getStoredTheme();
    this.init();
  }

  /**
   * Initialize theme system
   */
  init() {
    this.applyTheme(this.currentTheme);
    this.updateToggleButton(this.currentTheme);
  }

  /**
   * Get the currently stored theme preference
   * @returns {string} The stored theme or default to light
   */
  getStoredTheme() {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored && (stored === THEME_LIGHT || stored === THEME_DARK) ? stored : THEME_LIGHT;
    } catch (error) {
      console.warn('Could not access localStorage for theme preference:', error);
      return THEME_LIGHT;
    }
  }

  /**
   * Store the theme preference in localStorage
   * @param {string} theme - The theme to store
   */
  storeTheme(theme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      console.warn('Could not store theme preference in localStorage:', error);
    }
  }

  /**
   * Apply the theme to the document
   * @param {string} theme - The theme to apply
   */
  applyTheme(theme) {
    const root = document.documentElement;

    if (theme === THEME_DARK) {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }

    this.currentTheme = theme;
  }

  /**
   * Toggle between light and dark themes
   */
  toggleTheme() {
    const newTheme = this.currentTheme === THEME_LIGHT ? THEME_DARK : THEME_LIGHT;
    this.applyTheme(newTheme);
    this.storeTheme(newTheme);
    this.updateToggleButton(newTheme);

    // Dispatch custom event for other parts of the app to listen to
    const event = new CustomEvent('themeChanged', {
      detail: { theme: newTheme, previousTheme: this.currentTheme }
    });
    document.dispatchEvent(event);
  }

  /**
   * Update the theme toggle button appearance
   * @param {string} theme - Current theme
   */
  updateToggleButton(theme) {
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
      if (theme === THEME_DARK) {
        toggleBtn.innerHTML = '☀️';
        toggleBtn.title = 'Switch to light mode';
      } else {
        toggleBtn.innerHTML = '🌙';
        toggleBtn.title = 'Switch to dark mode';
      }
    }
  }

  /**
   * Setup theme toggle button event listener
   */
  setupToggleButton() {
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.toggleTheme();
      });
    }
  }

  /**
   * Get current theme
   * @returns {string} Current theme
   */
  getCurrentTheme() {
    return this.currentTheme;
  }

  /**
   * Set theme programmatically
   * @param {string} theme - Theme to set
   */
  setTheme(theme) {
    if (theme === THEME_LIGHT || theme === THEME_DARK) {
      this.applyTheme(theme);
      this.storeTheme(theme);
      this.updateToggleButton(theme);
    }
  }

  /**
   * Check if current theme is dark
   * @returns {boolean} True if dark theme is active
   */
  isDarkTheme() {
    return this.currentTheme === THEME_DARK;
  }

  /**
   * Check if current theme is light
   * @returns {boolean} True if light theme is active
   */
  isLightTheme() {
    return this.currentTheme === THEME_LIGHT;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThemeManager, THEME_LIGHT, THEME_DARK };
}

// Global instance for direct use in scripts
window.themeManager = new ThemeManager();