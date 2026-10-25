import { json, request } from "../../shared/api/client";

export interface StartupSettings {
  supported: boolean;
  enabled: boolean;
}

const STARTUP_SETTINGS_ENDPOINT = "/api/settings/startup";

export function getStartupSettings(): Promise<StartupSettings> {
  return request<StartupSettings>(STARTUP_SETTINGS_ENDPOINT);
}

export function setStartupEnabled(enabled: boolean): Promise<StartupSettings> {
  return request<StartupSettings>(
    STARTUP_SETTINGS_ENDPOINT,
    json("PUT", { enabled }),
  );
}
