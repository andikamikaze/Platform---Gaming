/* Shared light/dark theme preferences for both pages. */
import { setIcon } from "./icons.js";

const STORAGE_THEME = "gamespace_theme";
const VALID = ["light", "dark", "system"];
const DARK_META = "#14171f";
const LIGHT_META = "#f7f8fa";

export function getThemePreference() {
  let value = "";
  try {
    value = localStorage.getItem(STORAGE_THEME) || "";
  } catch (_) {
    return "system";
  }
  return VALID.includes(value) ? value : "system";
}

export function systemPrefersDark() {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function effectiveTheme(preference = getThemePreference()) {
  return preference === "system"
    ? (systemPrefersDark() ? "dark" : "light")
    : preference;
}

export function applyTheme(preference = getThemePreference()) {
  const theme = effectiveTheme(preference);
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? DARK_META : LIGHT_META);
  syncThemeButtons(theme);
  return theme;
}

export function setThemePreference(preference) {
  const value = VALID.includes(preference) ? preference : "system";
  try {
    localStorage.setItem(STORAGE_THEME, value);
  } catch (_) {
    /* Storage can be unavailable in private mode — still apply in-memory. */
  }
  return applyTheme(value);
}

export function toggleTheme() {
  return setThemePreference(effectiveTheme() === "dark" ? "light" : "dark");
}

function syncThemeButtons(theme = effectiveTheme()) {
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  document.querySelectorAll("[data-action='toggle-theme']").forEach((button) => {
    const icon = button.querySelector(".theme-icon");
    setIcon(icon, theme === "dark" ? "sun" : "moon");
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.setAttribute("aria-pressed", String(theme === "dark"));
  });
}

/* Wires every navbar theme button and keeps it in sync with stored/system value. */
export function initThemeButtons() {
  document.querySelectorAll("[data-action='toggle-theme']").forEach((button) => {
    if (button.dataset.themeWired === "true") return;
    button.dataset.themeWired = "true";
    button.addEventListener("click", () => toggleTheme());
  });
  if (typeof window.matchMedia === "function") {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getThemePreference() === "system") applyTheme("system");
    };
    if (typeof query.addEventListener === "function") query.addEventListener("change", onChange);
    else if (typeof query.addListener === "function") query.addListener(onChange);
  }
  return syncThemeButtons();
}

export { STORAGE_THEME };
