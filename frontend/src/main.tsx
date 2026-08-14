import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource-variable/noto-sans-sc/wght.css";
import App from "./App";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#347ee8",
          colorInfo: "#347ee8",
          colorSuccess: "#23b99a",
          colorWarning: "#d9972d",
          colorText: "#20314d",
          colorTextSecondary: "#6d7f9d",
          colorBorder: "#dbe5f1",
          borderRadius: 7,
          fontFamily:
            '"JetBrains Mono", "Noto Sans SC Variable", "Noto Sans SC", "Microsoft YaHei UI", sans-serif',
          controlHeight: 34,
        },
        components: {
          Button: { fontWeight: 600 },
          Tree: { nodeHoverBg: "#f0f6ff", nodeSelectedBg: "#e7f1ff" },
          Input: { activeShadow: "0 0 0 2px rgba(52,126,232,.12)" },
        },
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
