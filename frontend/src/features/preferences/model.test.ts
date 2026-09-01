import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  LANGUAGE_PREFERENCE_KEY,
  THEME_PREFERENCE_KEY,
  readAppPreferences,
  readLanguagePreference,
  readThemePreference,
  writeLanguagePreference,
  writeThemePreference,
} from "./model";
import { translate, translateError } from "./messages";

describe("app preferences", () => {
  it("uses light Chinese defaults when storage is empty or invalid", () => {
    const storage = window.localStorage;
    storage.clear();
    expect(readAppPreferences(storage)).toEqual(DEFAULT_PREFERENCES);

    storage.setItem(THEME_PREFERENCE_KEY, "sepia");
    storage.setItem(LANGUAGE_PREFERENCE_KEY, "ja-JP");
    expect(readThemePreference(storage)).toBe("light");
    expect(readLanguagePreference(storage)).toBe("zh-CN");
  });

  it("persists supported theme and language choices", () => {
    const storage = window.localStorage;
    writeThemePreference("dark", storage);
    writeLanguagePreference("en-US", storage);

    expect(readAppPreferences(storage)).toEqual({
      themeMode: "dark",
      language: "en-US",
    });
  });

  it("translates labels and interpolates values", () => {
    expect(translate("zh-CN", "table.selected", { count: 2 })).toBe(
      "已选择 2 张表",
    );
    expect(translate("en-US", "table.selected", { count: 2 })).toBe(
      "2 selected",
    );
  });

  it("maps API error codes in both languages", () => {
    expect(
      translateError("zh-CN", {
        code: "project_not_found",
        message: "项目不存在",
      }),
    ).toBe("项目不存在");
    expect(
      translateError("en-US", {
        code: "project_not_found",
        message: "项目不存在",
      }),
    ).toBe("The project was not found.");
  });
});
