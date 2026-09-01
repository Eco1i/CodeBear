import { chromium, expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Buffer } from "node:buffer";

interface WheelAcceptanceState {
  prevented: boolean;
  reachedTarget: boolean;
  samples: Array<{ time: number; scrollTop: number }>;
}

function buildScrollablePdm(tableCount: number): string {
  const tables = Array.from({ length: tableCount }, (_, index) => {
    const number = index + 1;
    return `<o:Table Id="t${number}">
      <a:Name>滚动验收表${String(number).padStart(2, "0")}</a:Name>
      <a:Code>t_scroll_${String(number).padStart(2, "0")}</a:Code>
      <a:Comment>滚动验收表${number}</a:Comment>
      <c:Columns>
        <o:Column Id="c${number}">
          <a:Name>编号</a:Name><a:Code>id_${number}</a:Code><a:DataType>NUMBER</a:DataType>
        </o:Column>
      </c:Columns>
    </o:Table>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Model xmlns:a="attribute" xmlns:c="collection" xmlns:o="object">
  <o:RootObject Id="root"><c:Children><o:Model Id="model">
    <a:Name>滚动验收模型</a:Name><c:Tables>${tables}</c:Tables>
  </o:Model></c:Children></o:RootObject>
</Model>`;
}

async function prepareTable(page: Page, initialScrollTop = 0) {
  await page.goto("/");
  await expect(page.locator("#root")).toBeVisible();

  const tableBody = page.locator(".table-grid-body");
  await expect(tableBody).toBeVisible();
  const tableBodyBox = await tableBody.boundingBox();
  if (!tableBodyBox) throw new Error("表格滚动容器没有布局尺寸");

  await page.evaluate((startingPosition) => {
    const body = document.querySelector<HTMLElement>(".table-grid-body");
    if (!body) throw new Error("表格滚动容器不存在");

    const virtualSpace = document.createElement("div");
    virtualSpace.className = "table-virtual-space";
    virtualSpace.style.height = "2560px";
    for (let index = 0; index < 80; index += 1) {
      const row = document.createElement("div");
      row.className = "data-grid-row";
      row.style.top = `${index * 32}px`;
      row.textContent = String(index + 1);
      virtualSpace.append(row);
    }
    body.replaceChildren(virtualSpace);
    body.scrollTop = startingPosition;

    const state: WheelAcceptanceState = {
      prevented: false,
      reachedTarget: false,
      samples: [],
    };
    (
      window as unknown as { wheelAcceptance?: WheelAcceptanceState }
    ).wheelAcceptance = state;
    body.addEventListener("wheel", () => {
      state.reachedTarget = true;
    });
    document.addEventListener(
      "wheel",
      (event) => {
        if (event.target instanceof Node && body.contains(event.target)) {
          state.prevented = event.defaultPrevented;
        }
      },
      { capture: true },
    );
    const startedAt = performance.now();
    const sample = (timestamp: number) => {
      state.samples.push({
        time: timestamp - startedAt,
        scrollTop: body.scrollTop,
      });
      if (timestamp - startedAt < 700) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, initialScrollTop);

  await page.mouse.move(
    tableBodyBox.x + tableBodyBox.width / 2,
    tableBodyBox.y + tableBodyBox.height / 2,
  );
}

async function readResult(page: Page) {
  return page.evaluate(() => {
    const body = document.querySelector<HTMLElement>(".table-grid-body");
    const state = (
      window as unknown as { wheelAcceptance: WheelAcceptanceState }
    ).wheelAcceptance;
    if (!body) throw new Error("表格滚动容器不存在");
    const values = state.samples.map((sample) => sample.scrollTop);
    const frameDeltas = values
      .slice(1)
      .map((value, index) => Math.abs(value - values[index]));
    return {
      prevented: state.prevented,
      reachedTarget: state.reachedTarget,
      final: body.scrollTop,
      firstVisibleRow: Math.floor(body.scrollTop / 32) + 1,
      rowRemainder: body.scrollTop % 32,
      uniqueValues: [...new Set(values)],
      maxFrameDelta: Math.max(0, ...frameDeltas),
    };
  });
}

async function prepareRealVirtualTable(page: Page) {
  const projectName = `滚动验收-${Date.now()}-${Math.random()}`;
  const fileName = "scroll-acceptance.pdm";
  const createResponse = await page.request.post("/api/projects", {
    data: { name: projectName },
  });
  expect(createResponse.ok()).toBe(true);
  const project = (await createResponse.json()) as { id: string };
  const importResponse = await page.request.post("/api/import", {
    multipart: {
      project_id: project.id,
      parent_path: "",
      overwrite: "false",
      files: {
        name: fileName,
        mimeType: "application/xml",
        buffer: Buffer.from(buildScrollablePdm(80), "utf8"),
      },
    },
  });
  expect(importResponse.ok()).toBe(true);

  await page.goto("/");
  const projectNode = page
    .getByRole("treeitem")
    .filter({ hasText: projectName });
  await expect(projectNode).toBeVisible();
  await projectNode.locator(".ant-tree-switcher").click();
  const pdmNode = page.getByRole("treeitem").filter({ hasText: fileName });
  await expect(pdmNode).toBeVisible();
  await pdmNode.click();

  const tableBody = page.locator(".table-grid-body");
  await expect(tableBody.locator(".data-grid-row").first()).toBeVisible();
  return tableBody;
}

test("one mouse-wheel notch advances exactly one complete table row", async ({
  page,
}) => {
  await prepareTable(page);

  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(800);

  const result = await readResult(page);
  expect(result.prevented).toBe(true);
  expect(result.reachedTarget).toBe(true);
  expect(result.final).toBe(32);
  expect(result.firstVisibleRow).toBe(2);
  expect(result.rowRemainder).toBe(0);
  expect(result.uniqueValues.some((value) => value > 0 && value < 32)).toBe(
    true,
  );
  expect(result.maxFrameDelta).toBeLessThanOrEqual(5);
});

test("repeated wheel notches continue one row at a time in both directions", async ({
  page,
}) => {
  await prepareTable(page);

  for (const expected of [32, 64, 96, 128]) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(260);
    const result = await readResult(page);
    expect(result.final).toBe(expected);
    expect(result.rowRemainder).toBe(0);
  }

  for (const expected of [96, 64]) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(260);
    const result = await readResult(page);
    expect(result.final).toBe(expected);
    expect(result.rowRemainder).toBe(0);
  }
});

test("wheel notches received during an active animation are not lost", async ({
  page,
}) => {
  await prepareTable(page);

  await page.mouse.wheel(0, 120);
  await page.mouse.wheel(0, 120);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(800);

  const result = await readResult(page);
  expect(result.final).toBe(96);
  expect(result.firstVisibleRow).toBe(4);
  expect(result.rowRemainder).toBe(0);
});

test("repeated wheel notches keep working through the real React virtual table", async ({
  page,
}) => {
  test.setTimeout(30_000);
  const tableBody = await prepareRealVirtualTable(page);
  const tableBodyBox = await tableBody.boundingBox();
  if (!tableBodyBox) throw new Error("真实表格滚动容器没有布局尺寸");
  await page.mouse.move(
    tableBodyBox.x + tableBodyBox.width / 2,
    tableBodyBox.y + tableBodyBox.height / 2,
  );

  for (const expected of [32, 64, 96, 128]) {
    await page.mouse.wheel(0, 120);
    await expect
      .poll(() => tableBody.evaluate((element) => element.scrollTop))
      .toBe(expected);
  }
  await expect
    .poll(() => tableBody.evaluate((element) => element.scrollTop % 32))
    .toBe(0);
});

test("non-default browser zoom keeps repeated real-table wheel steps moving", async ({
  page,
}) => {
  const forcedScale = process.env.CODEBEAR_E2E_DEVICE_SCALE_FACTOR;
  test.skip(
    forcedScale === undefined,
    "Run with CODEBEAR_E2E_DEVICE_SCALE_FACTOR set",
  );
  test.setTimeout(30_000);
  const tableBody = await prepareRealVirtualTable(page);
  const quantizedBoundary = await tableBody.evaluate((element) => {
    element.scrollTop = 32;
    const actual = element.scrollTop;
    element.scrollTop = 0;
    return actual;
  });
  if (forcedScale === "0.8") expect(quantizedBoundary).not.toBe(32);

  const tableBodyBox = await tableBody.boundingBox();
  if (!tableBodyBox) throw new Error("80% 缩放表格没有布局尺寸");
  await page.mouse.move(
    tableBodyBox.x + tableBodyBox.width / 2,
    tableBodyBox.y + tableBodyBox.height / 2,
  );

  const expectedBoundaries = [
    32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 288, 256, 224, 192,
  ];
  const actualPositions: number[] = [];
  for (const [index, expected] of expectedBoundaries.entries()) {
    await page.mouse.wheel(0, index < 10 ? 120 : -120);
    await page.waitForTimeout(260);
    const actual = await tableBody.evaluate((element) => element.scrollTop);
    actualPositions.push(actual);
    expect(Math.round(actual / 32)).toBe(expected / 32);
  }
  expect(actualPositions.map((position) => Math.round(position / 32))).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6,
  ]);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await tableBody.evaluate((element) => {
    element.scrollTop = 0;
  });
  const reducedMotionPositions: number[] = [];
  for (const expected of [32, 64, 96, 128]) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(100);
    const actual = await tableBody.evaluate((element) => element.scrollTop);
    reducedMotionPositions.push(actual);
    expect(Math.round(actual / 32)).toBe(expected / 32);
  }
  expect(
    reducedMotionPositions.map((position) => Math.round(position / 32)),
  ).toEqual([1, 2, 3, 4]);
  console.info(
    `${Number(forcedScale) * 100}% zoom scroll sequence: ${actualPositions.join(", ")}; reduced motion: ${reducedMotionPositions.join(", ")}`,
  );
});

test("all Chromium-supported zoom levels preserve logical row scrolling", async () => {
  test.skip(
    process.env.CODEBEAR_E2E_ALL_ZOOM_LEVELS !== "1",
    "Run with CODEBEAR_E2E_ALL_ZOOM_LEVELS=1",
  );
  test.setTimeout(180_000);
  const scales = [
    0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3,
    4, 5,
  ];
  const expectedRows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6];
  const verifiedPercentages: number[] = [];

  for (const scale of scales) {
    const browser = await chromium.launch({
      headless: true,
      args: [`--force-device-scale-factor=${scale}`],
    });
    try {
      const context = await browser.newContext({
        baseURL: "http://127.0.0.1:5173",
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();
      const tableBody = await prepareRealVirtualTable(page);
      const tableBodyBox = await tableBody.boundingBox();
      if (!tableBodyBox) throw new Error(`${scale * 100}% 表格没有布局尺寸`);
      await page.mouse.move(
        tableBodyBox.x + tableBodyBox.width / 2,
        tableBodyBox.y + tableBodyBox.height / 2,
      );

      const actualRows: number[] = [];
      for (let index = 0; index < expectedRows.length; index += 1) {
        await page.mouse.wheel(0, index < 10 ? 120 : -120);
        await page.waitForTimeout(240);
        actualRows.push(
          await tableBody.evaluate((element) =>
            Math.round(element.scrollTop / 32),
          ),
        );
      }
      expect(actualRows).toEqual(expectedRows);

      await page.emulateMedia({ reducedMotion: "reduce" });
      await tableBody.evaluate((element) => {
        element.scrollTop = 0;
      });
      const reducedRows: number[] = [];
      for (let index = 0; index < 4; index += 1) {
        await page.mouse.wheel(0, 120);
        await page.waitForTimeout(50);
        reducedRows.push(
          await tableBody.evaluate((element) =>
            Math.round(element.scrollTop / 32),
          ),
        );
      }
      expect(reducedRows).toEqual([1, 2, 3, 4]);
      verifiedPercentages.push(Math.round(scale * 100));
      await context.close();
    } finally {
      await browser.close();
    }
  }

  console.info(
    `Verified browser zoom levels: ${verifiedPercentages.join("%, ")}%`,
  );
});

test("reduced motion still enforces one whole row instead of native multi-row scrolling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareTable(page, 16);

  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(100);

  const result = await readResult(page);
  expect(result.prevented).toBe(true);
  expect(result.final).toBe(32);
  expect(result.firstVisibleRow).toBe(2);
  expect(result.rowRemainder).toBe(0);
});
