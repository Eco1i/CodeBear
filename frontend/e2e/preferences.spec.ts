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

test("preference popover arrow stays connected to its surface", async ({
  page,
}) => {
  await page.setViewportSize({ width: 454, height: 311 });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1.6";
  });

  const trigger = page.locator(".brand-preferences-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();

  const popover = page.locator(".preferences-popover");
  await expect(popover).toBeVisible();
  await expect
    .poll(() =>
      popover.evaluate(
        (root) => !root.classList.contains("ant-zoom-big-appear-active"),
      ),
    )
    .toBe(true);

  const geometry = await popover.evaluate((root) => {
    const arrow = root.querySelector<HTMLElement>(".preferences-popover-arrow");
    const container = root.querySelector<HTMLElement>(".ant-popover-container");
    const triggerElement = document.querySelector<HTMLElement>(
      ".brand-preferences-trigger",
    );
    if (!arrow || !container || !triggerElement) {
      throw new Error("偏好设置弹层的箭头结构不完整");
    }

    const arrowRect = arrow.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const arrowSurface = getComputedStyle(arrow, "::before");
    const transform = arrowSurface.transform;
    const scaleY =
      transform === "none" ? 1 : new DOMMatrixReadOnly(transform).d;

    return {
      arrowBottom: arrowRect.bottom,
      containerTop: containerRect.top,
      arrowScaleY: scaleY,
      containerBorderTopWidth: getComputedStyle(container).borderTopWidth,
      arrowBackground: arrowSurface.backgroundColor,
      containerBackground: getComputedStyle(container).backgroundColor,
    };
  });

  const arrowOverlap = geometry.arrowBottom - geometry.containerTop;
  expect(arrowOverlap).toBeGreaterThanOrEqual(0);
  expect(arrowOverlap).toBeLessThan(2);
  expect(geometry.arrowScaleY).toBeCloseTo(1, 1);
  expect(geometry.containerBorderTopWidth).toBe("0px");
  expect(geometry.arrowBackground).toBe(geometry.containerBackground);

  await page.getByText("暗夜", { exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe("dark");
  const darkSurface = await popover.evaluate((root) => {
    const arrow = root.querySelector<HTMLElement>(".preferences-popover-arrow");
    const container = root.querySelector<HTMLElement>(".ant-popover-container");
    if (!arrow || !container) {
      throw new Error("偏好设置弹层的表面结构不完整");
    }

    return {
      arrowBackground: getComputedStyle(arrow, "::before").backgroundColor,
      containerBackground: getComputedStyle(container).backgroundColor,
    };
  });
  expect(darkSurface.arrowBackground).toBe(darkSurface.containerBackground);
});
