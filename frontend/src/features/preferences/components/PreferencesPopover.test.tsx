import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStartupSettings, setStartupEnabled } from "../startup";
import { PreferencesPopover } from "./PreferencesPopover";

vi.mock("../startup", () => ({
  getStartupSettings: vi.fn(),
  setStartupEnabled: vi.fn(),
}));

const getStartupSettingsMock = vi.mocked(getStartupSettings);
const setStartupEnabledMock = vi.mocked(setStartupEnabled);

beforeEach(() => {
  getStartupSettingsMock.mockResolvedValue({ supported: true, enabled: false });
  setStartupEnabledMock.mockResolvedValue({ supported: true, enabled: true });
});

describe("preferences login startup control", () => {
  it("loads and updates the current-user startup setting", async () => {
    const user = userEvent.setup();
    render(
      <AntApp>
        <PreferencesPopover />
      </AntApp>,
    );

    await user.click(screen.getByRole("button", { name: "打开偏好设置" }));
    const startupSwitch = await screen.findByRole("switch", {
      name: "开机自启",
    });
    expect(startupSwitch).toBeEnabled();
    await user.click(startupSwitch);

    await waitFor(() =>
      expect(setStartupEnabledMock).toHaveBeenCalledWith(true),
    );
    expect(getStartupSettingsMock).toHaveBeenCalledOnce();
  });

  it("keeps the control disabled when the current runtime is unsupported", async () => {
    getStartupSettingsMock.mockResolvedValue({
      supported: false,
      enabled: false,
    });
    const user = userEvent.setup();
    render(
      <AntApp>
        <PreferencesPopover />
      </AntApp>,
    );

    await user.click(screen.getByRole("button", { name: "打开偏好设置" }));
    expect(screen.getByRole("switch", { name: "开机自启" })).toBeDisabled();
  });
});
