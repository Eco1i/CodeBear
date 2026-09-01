import { expect, test } from "@playwright/test";

test("switches theme and interface language and persists both choices", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1392, height: 900 });
  await page.goto("/");

  await expect(page.locator(".brand-preferences-trigger")).toBeVisible();
  await expect(
    page.locator(".header-actions .preferences-trigger"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "打开偏好设置" }).click();
  await page.getByText("暗夜", { exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe("dark");
  await expect(page.locator(".app-root")).toHaveCSS(
    "background-color",
    "rgb(11, 13, 15)",
  );

  await page.getByText("English", { exact: true }).click();
  await expect(page.getByText("Projects", { exact: true })).toBeVisible();
  await expect(page.locator(".table-panel-header strong")).toHaveText("Tables");
  await expect(page).toHaveTitle("CodeBear · PDM Data Dictionary Workbench");

  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        language: document.documentElement.lang,
      })),
    )
    .toEqual({ theme: "dark", language: "en-US" });
  await expect(page.getByText("Projects", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open preferences" }).click();
  await expect(page.getByText("Light", { exact: true })).toBeVisible();
  await expect(page.getByText("Dark", { exact: true })).toBeVisible();
});
