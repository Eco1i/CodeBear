import type { AppLanguage, AppPreferences, ThemeMode } from "./types";

export const THEME_PREFERENCE_KEY = "codebear.theme-mode.v1";
export const LANGUAGE_PREFERENCE_KEY = "codebear.language.v1";

export const DEFAULT_PREFERENCES: AppPreferences = {
  themeMode: "light",
  language: "zh-CN",
};

function storageOrNull(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "zh-CN" || value === "en-US";
}

export function readThemePreference(storage?: Storage): ThemeMode {
  const target = storageOrNull(storage);
  if (!target) return DEFAULT_PREFERENCES.themeMode;
  try {
    const value = target.getItem(THEME_PREFERENCE_KEY);
    return isThemeMode(value) ? value : DEFAULT_PREFERENCES.themeMode;
  } catch {
    return DEFAULT_PREFERENCES.themeMode;
  }
}

export function writeThemePreference(
  themeMode: ThemeMode,
  storage?: Storage,
): void {
  const target = storageOrNull(storage);
  if (!target) return;
  try {
    target.setItem(THEME_PREFERENCE_KEY, themeMode);
  } catch {
    // Preferences are optional and must not interrupt the workspace.
  }
}

export function readLanguagePreference(storage?: Storage): AppLanguage {
  const target = storageOrNull(storage);
  if (!target) return DEFAULT_PREFERENCES.language;
  try {
    const value = target.getItem(LANGUAGE_PREFERENCE_KEY);
    return isAppLanguage(value) ? value : DEFAULT_PREFERENCES.language;
  } catch {
    return DEFAULT_PREFERENCES.language;
  }
}

export function writeLanguagePreference(
  language: AppLanguage,
  storage?: Storage,
): void {
  const target = storageOrNull(storage);
  if (!target) return;
  try {
    target.setItem(LANGUAGE_PREFERENCE_KEY, language);
  } catch {
    // Preferences are optional and must not interrupt the workspace.
  }
}

export function readAppPreferences(storage?: Storage): AppPreferences {
  return {
    themeMode: readThemePreference(storage),
    language: readLanguagePreference(storage),
  };
}
