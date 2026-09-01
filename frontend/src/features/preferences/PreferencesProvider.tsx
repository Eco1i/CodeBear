import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { messages, translate, translateError } from "./messages";
import {
  DEFAULT_PREFERENCES,
  readAppPreferences,
  writeLanguagePreference,
  writeThemePreference,
} from "./model";
import type { AppLanguage, AppPreferences, ThemeMode } from "./types";

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;
type ErrorText = (error: unknown, fallbackKey?: string) => string;

interface PreferencesContextValue extends AppPreferences {
  setThemeMode: (themeMode: ThemeMode) => void;
  setLanguage: (language: AppLanguage) => void;
  t: Translate;
  errorText: ErrorText;
}

const fallbackPreferences: PreferencesContextValue = {
  ...DEFAULT_PREFERENCES,
  setThemeMode: () => {},
  setLanguage: () => {},
  t: (key, params) => translate(DEFAULT_PREFERENCES.language, key, params),
  errorText: (error, fallbackKey) =>
    translateError(DEFAULT_PREFERENCES.language, error, fallbackKey),
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function AppPreferencesProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState<AppPreferences>(() =>
    readAppPreferences(),
  );

  const setThemeMode = useCallback((themeMode: ThemeMode) => {
    setPreferences((current) => {
      if (current.themeMode === themeMode) return current;
      writeThemePreference(themeMode);
      return { ...current, themeMode };
    });
  }, []);

  const setLanguage = useCallback((language: AppLanguage) => {
    setPreferences((current) => {
      if (current.language === language) return current;
      writeLanguagePreference(language);
      return { ...current, language };
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.themeMode;
    document.documentElement.lang = preferences.language;
    document.documentElement.style.colorScheme = preferences.themeMode;
    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (themeColor) {
      themeColor.content =
        preferences.themeMode === "dark" ? "#0b0d0f" : "#f4f7fb";
    }
    document.title = translate(preferences.language, "app.title");
  }, [preferences.language, preferences.themeMode]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...preferences,
      setThemeMode,
      setLanguage,
      t: (key, params) => translate(preferences.language, key, params),
      errorText: (error, fallbackKey) =>
        translateError(preferences.language, error, fallbackKey),
    }),
    [preferences, setLanguage, setThemeMode],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext) || fallbackPreferences;
}

export function useI18n(): Pick<
  PreferencesContextValue,
  "language" | "t" | "errorText"
> {
  const { language, t, errorText } = usePreferences();
  return { language, t, errorText };
}

export function hasTranslation(language: AppLanguage, key: string): boolean {
  return Boolean(messages[language][key]);
}
