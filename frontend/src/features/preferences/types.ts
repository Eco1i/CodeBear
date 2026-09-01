export type ThemeMode = "light" | "dark";
export type AppLanguage = "zh-CN" | "en-US";

export interface AppPreferences {
  themeMode: ThemeMode;
  language: AppLanguage;
}
