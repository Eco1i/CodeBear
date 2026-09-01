import {
  GlobalOutlined,
  MoonOutlined,
  SettingOutlined,
  SunOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
import { Button, Divider, Popover, Segmented } from "antd";
import { usePreferences } from "../PreferencesProvider";
import type { AppLanguage, ThemeMode } from "../types";

type PreferencesPopoverProps = {
  children?: ReactNode;
};

export function PreferencesPopover({ children }: PreferencesPopoverProps) {
  const { language, themeMode, setLanguage, setThemeMode, t } =
    usePreferences();

  const content = (
    <div className="preferences-popover-content">
      <div className="preferences-popover-title">{t("preferences.title")}</div>
      <div className="preferences-setting">
        <span className="preferences-setting-label">
          <SunOutlined aria-hidden="true" />
          {t("preferences.theme")}
        </span>
        <Segmented
          size="small"
          value={themeMode}
          aria-label={t("preferences.switchTheme")}
          options={[
            { label: t("preferences.theme.light"), value: "light" },
            {
              label: t("preferences.theme.dark"),
              value: "dark",
              icon: <MoonOutlined />,
            },
          ]}
          onChange={(value) => setThemeMode(value as ThemeMode)}
        />
      </div>
      <Divider />
      <div className="preferences-setting">
        <span className="preferences-setting-label">
          <GlobalOutlined aria-hidden="true" />
          {t("preferences.language")}
        </span>
        <Segmented
          size="small"
          value={language}
          aria-label={t("preferences.switchLanguage")}
          options={[
            { label: t("preferences.language.zhCN"), value: "zh-CN" },
            { label: t("preferences.language.enUS"), value: "en-US" },
          ]}
          onChange={(value) => setLanguage(value as AppLanguage)}
        />
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomLeft"
      arrow={{ pointAtCenter: true }}
      classNames={{ root: "preferences-popover" }}
    >
      {children || (
        <Button
          type="text"
          size="small"
          icon={<SettingOutlined />}
          aria-label={t("preferences.open")}
          title={t("preferences.open")}
          className="preferences-trigger"
        />
      )}
    </Popover>
  );
}
