import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider, theme as antdTheme } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource-variable/noto-sans-sc/wght.css";
import App from "./App";
import { useSmoothWheelScroll } from "./useSmoothWheelScroll";
import {
  AppPreferencesProvider,
  usePreferences,
} from "./features/preferences/PreferencesProvider";
import "./styles/index.css";

function ConfiguredApp() {
  useSmoothWheelScroll();
  const { language, themeMode } = usePreferences();
  const dark = themeMode === "dark";

  return (
    <ConfigProvider
      locale={language === "en-US" ? enUS : zhCN}
      button={{ autoInsertSpace: false }}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: dark ? "#5b8983" : "#347ee8",
          colorInfo: dark ? "#8eaaa6" : "#347ee8",
          colorSuccess: dark ? "#4fd1a7" : "#23b99a",
          colorWarning: "#d9972d",
          colorText: dark ? "#f1f3f5" : "#20314d",
          colorTextSecondary: dark ? "#b8c0ca" : "#6d7f9d",
          colorBorder: dark ? "#2c333b" : "#dbe5f1",
          colorBgBase: dark ? "#0b0d0f" : "#ffffff",
          colorBgContainer: dark ? "#14171b" : "#ffffff",
          borderRadius: 7,
          fontFamily:
            '"JetBrains Mono", "Noto Sans SC Variable", "Noto Sans SC", "Microsoft YaHei UI", sans-serif',
          controlHeight: 34,
        },
        components: {
          Button: { fontWeight: 600 },
          Tree: {
            nodeHoverBg: dark ? "#252a30" : "#f0f6ff",
            nodeSelectedBg: dark ? "#2a3036" : "#e7f1ff",
          },
          Input: {
            activeShadow: dark
              ? "0 0 0 2px rgba(193, 199, 206, 0.18)"
              : "0 0 0 2px rgba(52,126,232,.18)",
          },
        },
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppPreferencesProvider>
      <ConfiguredApp />
    </AppPreferencesProvider>
  </React.StrictMode>,
);
