import { expect, test, type Locator, type Page } from "@playwright/test";
import { reviewScreenshot } from "../fixtures/review-screenshot";

type Geometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function isSupabaseTableWrite(
  response: Awaited<ReturnType<Page["waitForResponse"]>>,
  table: "boards" | "board_nodes",
  method: "POST" | "PATCH" | "DELETE",
) {
  return response.url().includes(`/rest/v1/${table}`) && response.request().method() === method;
}

async function expectSaved(page: Page) {
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-save-state", "saved");
}

async function waitForDebouncedNodeSave(page: Page, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse((response) =>
    isSupabaseTableWrite(response, "board_nodes", "PATCH"),
  );

  await action();
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBeTruthy();
  await expectSaved(page);
}

async function readGeometry(node: Locator): Promise<Geometry> {
  const values = await Promise.all([
    node.getAttribute("data-position-x"),
    node.getAttribute("data-position-y"),
    node.getAttribute("data-width"),
    node.getAttribute("data-height"),
  ]);

  const geometry = values.map((value) => Number(value));
  expect(geometry.every(Number.isFinite)).toBeTruthy();
  return { x: geometry[0], y: geometry[1], width: geometry[2], height: geometry[3] };
}

async function dragNodeBy(page: Page, node: Locator, deltaX: number, deltaY: number) {
  const handle = node.getByTestId("node-drag-handle");
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 });
  await page.mouse.up();
}

async function resizeNodeBy(page: Page, node: Locator, deltaX: number, deltaY: number) {
  const handle = node.locator(".node-resize-handle.bottom.right");
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 });
  await page.mouse.up();
}

function expectGeometryRestored(actual: Geometry, expected: Geometry) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(2);
}

test("Day 1 board content and layout survive a production refresh", async ({ page, request }) => {
  const boardTitle = `Day 1 acceptance ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const sampleCode = [
    "export function AuditButton() {",
    '  return <button data-state="persisted">Ship review</button>;',
    "}",
  ].join("\n");

  await test.step("verify production dependencies", async () => {
    const health = await request.get("/api/health");
    expect(health.status(), await health.text()).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      database: true,
      storage: true,
    });
  });

  await test.step("create and open a uniquely named board", async () => {
    await page.goto("/boards");
    await expect(page.getByTestId("board-title-input")).toBeEnabled();
    await page.getByTestId("board-title-input").fill(boardTitle);

    const createResponse = page.waitForResponse((response) =>
      isSupabaseTableWrite(response, "boards", "POST"),
    );
    await page.getByTestId("create-board-button").click();
    expect((await createResponse).ok()).toBeTruthy();

    const boardRow = page.getByTestId("board-row").filter({ hasText: boardTitle });
    await expect(boardRow).toBeVisible();
    await boardRow.getByTestId("open-board-link").click();
    await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("board-workspace")).toBeVisible();
    await expectSaved(page);
  });

  const boardUrl = page.url();

  await test.step("create and edit a code node", async () => {
    const createResponse = page.waitForResponse((response) =>
      isSupabaseTableWrite(response, "board_nodes", "POST"),
    );
    await page.getByTestId("add-code-node").click();
    expect((await createResponse).ok()).toBeTruthy();
    await expect(page.getByTestId("code-node")).toHaveCount(1);
    await expectSaved(page);

    await waitForDebouncedNodeSave(page, async () => {
      await page.getByTestId("code-node-title").fill("Audited implementation");
      await page.getByTestId("code-filename").fill("audit-button.tsx");
      await page.getByTestId("code-language").selectOption("typescript");
      await page.getByTestId("code-editor").fill(sampleCode);
    });
  });

  await test.step("create an image node and upload the fixture", async () => {
    const createResponse = page.waitForResponse((response) =>
      isSupabaseTableWrite(response, "board_nodes", "POST"),
    );
    await page.getByTestId("add-image-node").click();
    expect((await createResponse).ok()).toBeTruthy();
    await expect(page.getByTestId("image-node")).toHaveCount(1);
    await expectSaved(page);

    const storageResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/storage/v1/object/") && response.request().method() === "POST",
    );
    const nodeResponse = page.waitForResponse((response) =>
      isSupabaseTableWrite(response, "board_nodes", "PATCH"),
    );
    await page.getByTestId("image-file-input").setInputFiles(reviewScreenshot);

    expect((await storageResponse).ok()).toBeTruthy();
    expect((await nodeResponse).ok()).toBeTruthy();
    await expect(page.getByTestId("image-preview")).toBeVisible();
    await expectSaved(page);
  });

  await test.step("move and resize both nodes", async () => {
    const codeNode = page.getByTestId("code-node");
    const imageNode = page.getByTestId("image-node");
    const codeStart = await readGeometry(codeNode);
    const imageStart = await readGeometry(imageNode);

    await waitForDebouncedNodeSave(page, () => dragNodeBy(page, codeNode, -140, 250));
    await waitForDebouncedNodeSave(page, () => dragNodeBy(page, imageNode, 500, -80));
    await codeNode.getByTestId("node-drag-handle").click();
    await expectSaved(page);
    await waitForDebouncedNodeSave(page, () => resizeNodeBy(page, codeNode, 100, 70));
    await imageNode.getByTestId("node-drag-handle").click();
    await expectSaved(page);
    await waitForDebouncedNodeSave(page, () => resizeNodeBy(page, imageNode, 80, 60));

    const codeMoved = await readGeometry(codeNode);
    const imageMoved = await readGeometry(imageNode);
    expect(Math.abs(codeMoved.x - codeStart.x)).toBeGreaterThan(50);
    expect(Math.abs(codeMoved.y - codeStart.y)).toBeGreaterThan(30);
    expect(Math.abs(imageMoved.x - imageStart.x)).toBeGreaterThan(50);
    expect(Math.abs(imageMoved.y - imageStart.y)).toBeGreaterThan(30);
    expect(codeMoved.width).toBeGreaterThan(codeStart.width + 50);
    expect(codeMoved.height).toBeGreaterThan(codeStart.height + 30);
    expect(imageMoved.width).toBeGreaterThan(imageStart.width + 40);
    expect(imageMoved.height).toBeGreaterThan(imageStart.height + 25);
  });

  const codeGeometry = await readGeometry(page.getByTestId("code-node"));
  const imageGeometry = await readGeometry(page.getByTestId("image-node"));

  await test.step("reload and verify durable content and geometry", async () => {
    await page.reload();
    await expect(page.getByTestId("board-workspace")).toBeVisible();
    await expectSaved(page);
    await expect(page.getByTestId("code-node")).toHaveCount(1);
    await expect(page.getByTestId("image-node")).toHaveCount(1);
    await expect(page.getByTestId("code-editor")).toHaveValue(sampleCode);
    await expect(page.getByTestId("code-filename")).toHaveValue("audit-button.tsx");
    await expect(page.getByTestId("image-preview")).toBeVisible();

    expectGeometryRestored(await readGeometry(page.getByTestId("code-node")), codeGeometry);
    expectGeometryRestored(await readGeometry(page.getByTestId("image-node")), imageGeometry);
  });

  await test.step("open the saved board by its direct URL", async () => {
    await page.goto(boardUrl);
    await expect(page.getByTestId("board-workspace")).toBeVisible();
    await expect(page.getByTestId("code-node")).toHaveCount(1);
    await expect(page.getByTestId("image-node")).toHaveCount(1);
  });

  await test.step("surface a failed save and recover", async () => {
    await page.route("**/rest/v1/board_nodes*", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Intentional acceptance-test failure" }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByTestId("code-editor").fill(`${sampleCode}\n// failure probe`);
    await expect(page.getByTestId("save-state")).toHaveAttribute("data-save-state", "failed");
    await expect(page.getByTestId("save-error")).toBeVisible();
    await page.unroute("**/rest/v1/board_nodes*");

    await waitForDebouncedNodeSave(page, async () => {
      await page.getByTestId("code-editor").fill(`${sampleCode}\n// recovered`);
    });
  });

  await test.step("delete a node permanently", async () => {
    await page.getByTestId("image-node").click({ position: { x: 18, y: 18 } });
    const deleteResponse = page.waitForResponse((response) =>
      isSupabaseTableWrite(response, "board_nodes", "DELETE"),
    );
    await page.getByTestId("delete-node").click();
    expect((await deleteResponse).ok()).toBeTruthy();
    await expectSaved(page);
    await expect(page.getByTestId("image-node")).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("board-workspace")).toBeVisible();
    await expect(page.getByTestId("image-node")).toHaveCount(0);
    await expect(page.getByTestId("code-node")).toHaveCount(1);
  });
});
