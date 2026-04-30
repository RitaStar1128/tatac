import { test, expect } from "@playwright/test";
import { rm } from "node:fs/promises";
import path from "node:path";

const syncNodeDataFile = path.resolve(process.cwd(), "sync-node", "data", "playwright-node-store.json");
const syncNodeUrl = "http://127.0.0.1:4110";
const passphrase = "correct horse battery";
const userId = `u_e2e_sync_${Date.now()}`;
const salt = "c3luYy10ZXN0LXNhbHQhIQ==";

async function configureSync(page: import("@playwright/test").Page, deviceName: string) {
  await page.goto("/sync-settings");
  await page.getByLabel("sync-user-id").fill(userId);
  await page.getByLabel("sync-node-url").fill(syncNodeUrl);
  await page.getByLabel("sync-passphrase").fill(passphrase);
  await page.getByRole("button", { name: "ADVANCED" }).click();
  await page.getByLabel("sync-device-name").fill(deviceName);
  await page.getByLabel("sync-salt").fill(salt);
  await page.getByRole("button", { name: "SAVE SETTINGS" }).click();
}

async function syncNow(page: import("@playwright/test").Page) {
  await page.goto("/sync-settings");
  await page.getByRole("button", { name: "SYNC NOW" }).click();
  await expect(page.getByText("Cursor")).toBeVisible({ timeout: 20_000 });
}

async function createNote(page: import("@playwright/test").Page, value: string) {
  await page.goto("/");
  await page.locator("textarea").fill(value);
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("textarea")).toHaveValue("");
}

async function updateNote(page: import("@playwright/test").Page, updatedValue: string) {
  await page.goto("/history");
  await page.locator('[data-note-title="Alpha note"]').first().click();
  await page.locator("textarea").fill(updatedValue);
  await page.keyboard.press("Control+Enter");
  await page.waitForURL("**/history");
  await expect(page.locator('[data-note-title="Alpha note"]').first()).toBeVisible();
}

async function deleteNoteBySwipe(page: import("@playwright/test").Page) {
  await page.goto("/history");
  const card = page.locator('[data-note-title="Alpha note"]').first();
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  if (!box) {
    throw new Error("History note card bounding box was not available.");
  }

  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(card).toHaveCount(0, { timeout: 10_000 });
}

test.beforeEach(async () => {
  await rm(syncNodeDataFile, { force: true });
});

test("syncs create, update, and delete across two browser contexts", async ({ browser }) => {
  const deviceOne = await browser.newContext();
  const deviceTwo = await browser.newContext();
  const pageOne = await deviceOne.newPage();
  const pageTwo = await deviceTwo.newPage();

  await configureSync(pageOne, "Playwright Device One");
  await configureSync(pageTwo, "Playwright Device Two");

  await createNote(pageOne, "Alpha note\nCreated on device one");
  await syncNow(pageOne);

  await syncNow(pageTwo);
  await pageTwo.goto("/history");
  await expect(pageTwo.locator('[data-note-title="Alpha note"]').first()).toBeVisible();

  await updateNote(pageTwo, "Alpha note\nUpdated on device two");
  await syncNow(pageTwo);

  await syncNow(pageOne);
  await pageOne.goto("/history");
  await expect(pageOne.getByText("Updated on device two")).toBeVisible();

  await deleteNoteBySwipe(pageTwo);
  await syncNow(pageTwo);

  await syncNow(pageOne);
  await pageOne.goto("/history");
  await expect(pageOne.getByText("Alpha note")).toHaveCount(0);

  await deviceOne.close();
  await deviceTwo.close();
});

test("exports and imports a .tatacsync file across two browser contexts", async ({ browser }) => {
  const deviceOne = await browser.newContext();
  const deviceTwo = await browser.newContext();
  const pageOne = await deviceOne.newPage();
  const pageTwo = await deviceTwo.newPage();

  await configureSync(pageOne, "Playwright Export Device");
  await configureSync(pageTwo, "Playwright Import Device");

  await createNote(pageOne, "Manual sync note\nCreated for file fallback");

  await pageOne.goto("/manual-sync");
  const downloadPromise = pageOne.waitForEvent("download");
  await pageOne.getByRole("button", { name: "EXPORT `.tatacsync`" }).click();
  const download = await downloadPromise;
  const exportedFilePath = await download.path();
  if (!exportedFilePath) {
    throw new Error("The exported .tatacsync file path was not available.");
  }

  await pageTwo.goto("/manual-sync");
  await pageTwo.locator('input[type="file"]').setInputFiles(exportedFilePath);
  await expect(pageTwo.getByText("IMPORT RESULT")).toBeVisible();

  await pageTwo.goto("/history");
  await expect(pageTwo.locator('[data-note-title="Manual sync note"]').first()).toBeVisible();

  await deviceOne.close();
  await deviceTwo.close();
});
