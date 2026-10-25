import { expect, test } from "@playwright/test";

test("shows the current-user login startup setting for this runtime", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "打开偏好设置" }),
  ).toBeVisible();

  const response = await page.request.get("/api/settings/startup");
  expect(response.ok()).toBeTruthy();
  const startup = (await response.json()) as {
    supported: boolean;
    enabled: boolean;
  };

  await page.getByRole("button", { name: "打开偏好设置" }).click();
  const startupSwitch = page.getByRole("switch", { name: "开机自启" });
  await expect(startupSwitch).toBeVisible();
  await expect(startupSwitch).toHaveAttribute(
    "aria-checked",
    String(startup.enabled),
  );
  if (startup.supported) {
    await expect(startupSwitch).toBeEnabled();
  } else {
    await expect(startupSwitch).toBeDisabled();
  }

  const preferencePopover = page.locator(".preferences-popover");
  await expect(preferencePopover).toBeVisible();
  await expect(preferencePopover).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: testInfo.outputPath("startup-preferences.png"),
    animations: "disabled",
  });

  await page.evaluate(() => {
    window.localStorage.setItem("codebear.theme-mode.v1", "dark");
  });
  await page.setViewportSize({ width: 480, height: 640 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "打开偏好设置" }).click();
  await expect(page.getByRole("switch", { name: "开机自启" })).toBeVisible();
  await expect(preferencePopover).toBeVisible();
  await expect(preferencePopover).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: testInfo.outputPath("startup-preferences-dark-narrow.png"),
    animations: "disabled",
  });
});
