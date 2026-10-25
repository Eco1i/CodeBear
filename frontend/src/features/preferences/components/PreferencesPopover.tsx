import {
  GlobalOutlined,
  LoginOutlined,
  MoonOutlined,
  SettingOutlined,
  SunOutlined,
} from "@ant-design/icons";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button, Divider, Popover, Segmented, Switch } from "antd";
import { usePreferences } from "../PreferencesProvider";
import { getStartupSettings, setStartupEnabled } from "../startup";
import type { StartupSettings } from "../startup";
import type { AppLanguage, ThemeMode } from "../types";

type PreferencesPopoverProps = {
  children?: ReactNode;
};

export function PreferencesPopover({ children }: PreferencesPopoverProps) {
  const { language, themeMode, setLanguage, setThemeMode, t, errorText } =
    usePreferences();
  const [open, setOpen] = useState(false);
  const [startupSettings, setStartupSettings] =
    useState<StartupSettings | null>(null);
  const [startupLoading, setStartupLoading] = useState(false);
  const [startupSaving, setStartupSaving] = useState(false);
  const [startupError, setStartupError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setStartupLoading(true);
    setStartupError("");
    void getStartupSettings()
      .then((settings) => {
        if (active) setStartupSettings(settings);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStartupSettings(null);
        setStartupError(errorText(error));
      })
      .finally(() => {
        if (active) setStartupLoading(false);
      });
    return () => {
      active = false;
    };
  }, [errorText, open]);

  const handleStartupChange = async (enabled: boolean) => {
    setStartupSaving(true);
    setStartupError("");
    try {
      setStartupSettings(await setStartupEnabled(enabled));
    } catch (error) {
      setStartupError(errorText(error));
    } finally {
      setStartupSaving(false);
    }
  };

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
      <Divider />
      <div className="preferences-startup-setting">
        <div className="preferences-startup-copy">
          <span className="preferences-setting-label">
            <LoginOutlined aria-hidden="true" />
            {t("preferences.startup")}
          </span>
          {startupError && (
            <span className="preferences-startup-hint is-error" role="alert">
              {startupError}
            </span>
          )}
        </div>
        <Switch
          size="small"
          checked={startupSettings?.enabled ?? false}
          loading={startupLoading || startupSaving}
          disabled={
            !startupSettings?.supported || startupLoading || startupSaving
          }
          aria-label={t("preferences.startup")}
          onChange={(enabled) => void handleStartupChange(enabled)}
        />
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      arrow={{ pointAtCenter: true }}
      classNames={{
        root: "preferences-popover",
        arrow: "preferences-popover-arrow",
      }}
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
