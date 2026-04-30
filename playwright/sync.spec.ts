import { test, expect } from "@playwright/test";
import { rm } from "node:fs/promises";
import path from "node:path";

const syncNodeDataFile = path.resolve(process.cwd(), "sync-node", "data", "playwright-node-store.json");
const syncNodeUrl = "http://127.0.0.1:4110";

function encodeUrlForPairing(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function primeEnglish(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("tatac_language", "en");
  });
}

async function enableSyncOnPc(page: import("@playwright/test").Page) {
  await page.goto("/sync-settings");
  await page.getByRole("button", { name: /enable sync on this pc/i }).click();
  const addPhoneButton = page.getByRole("button", { name: /add phone/i });

  try {
    await expect(addPhoneButton).toBeVisible({ timeout: 5_000 });
    return;
  } catch {
    const fallbackInput = page.getByLabel("sync-node-url").first();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(fallbackInput).toBeVisible({ timeout: 5_000 });
      await fallbackInput.fill(syncNodeUrl);
      await page.getByRole("button", { name: /enable with this url/i }).click();

      try {
        await expect(addPhoneButton).toBeVisible({ timeout: 5_000 });
        return;
      } catch {
        // Retry the fallback path once more before failing the test.
      }
    }
  }
  await expect(addPhoneButton).toBeVisible({ timeout: 20_000 });
}

async function openPairingUrl(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/sync-settings");
  await page.getByRole("button", { name: /add phone/i }).click();
  await expect(page.getByTestId("pairing-url")).toBeVisible({ timeout: 10_000 });
  return (await page.getByTestId("pairing-url").textContent())?.trim() ?? "";
}

async function forceCatchUp(page: import("@playwright/test").Page) {
  await page.goto("/sync-settings");
  await page.getByRole("button", { name: /force catch-up/i }).click();
  await expect(page.getByText(/latest catch-up/i)).toBeVisible({ timeout: 20_000 });
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

test("pairs a phone with a one-time QR link and live-syncs create/update/delete while both apps stay open", async ({ browser }) => {
  const deviceOne = await browser.newContext();
  const deviceTwo = await browser.newContext();
  const pageOne = await deviceOne.newPage();
  const pageTwo = await deviceTwo.newPage();

  await primeEnglish(pageOne);
  await primeEnglish(pageTwo);

  await enableSyncOnPc(pageOne);
  const pairingUrl = await openPairingUrl(pageOne);
  expect(pairingUrl).toContain("/sync-pair");

  await pageTwo.goto(pairingUrl);
  await pageTwo.waitForURL("**/history", { timeout: 20_000 });

  await createNote(pageOne, "Alpha note\nCreated on device one");
  await expect(pageTwo.locator('[data-note-title="Alpha note"]').first()).toBeVisible();

  await updateNote(pageTwo, "Alpha note\nUpdated on device two");
  await pageOne.goto("/history");
  await expect(pageOne.getByText("Updated on device two")).toBeVisible({ timeout: 20_000 });

  await deleteNoteBySwipe(pageTwo);
  await expect(pageOne.getByText("Alpha note")).toHaveCount(0, { timeout: 20_000 });

  const deviceThree = await browser.newContext();
  const pageThree = await deviceThree.newPage();
  await primeEnglish(pageThree);
  await pageThree.goto(pairingUrl);
  await expect(pageThree.getByTestId("pairing-error")).toHaveAttribute("data-pairing-error", "already-used");

  await deviceThree.close();
  await deviceOne.close();
  await deviceTwo.close();
});

test("catches up from relay when a paired device comes back online", async ({ browser }) => {
  const pc = await browser.newContext();
  const phone = await browser.newContext();
  const pageOne = await pc.newPage();
  const pageTwo = await phone.newPage();

  await primeEnglish(pageOne);
  await primeEnglish(pageTwo);

  await enableSyncOnPc(pageOne);
  const pairingUrl = await openPairingUrl(pageOne);
  await pageTwo.goto(pairingUrl);
  await pageTwo.waitForURL("**/history", { timeout: 20_000 });

  await pageTwo.close();
  await createNote(pageOne, "Relay catch-up note\nCreated while phone was away");

  const pageTwoReturn = await phone.newPage();
  await pageTwoReturn.goto("/history");
  await expect(pageTwoReturn.locator('[data-note-title="Relay catch-up note"]').first()).toBeVisible({
    timeout: 20_000,
  });

  await pc.close();
  await phone.close();
});

test("blocks pairing on a non-empty device until the user resets local data", async ({ browser }) => {
  const pc = await browser.newContext();
  const phone = await browser.newContext();
  const pageOne = await pc.newPage();
  const pageTwo = await phone.newPage();

  await primeEnglish(pageOne);
  await primeEnglish(pageTwo);

  await enableSyncOnPc(pageOne);
  await createNote(pageOne, "Remote note\nCreated on the PC");
  await forceCatchUp(pageOne);

  await createNote(pageTwo, "Local only note\nShould be cleared before join");
  const pairingUrl = await openPairingUrl(pageOne);

  await pageTwo.goto(pairingUrl);
  await expect(pageTwo.getByTestId("pairing-error")).toHaveAttribute("data-pairing-error", "non-empty-device");

  await pageTwo.getByRole("button", { name: /reset local data and join/i }).click();
  await pageTwo.waitForURL("**/history", { timeout: 20_000 });
  await expect(pageTwo.locator('[data-note-title="Remote note"]').first()).toBeVisible();
  await expect(pageTwo.locator('[data-note-title="Local only note"]')).toHaveCount(0);

  await pc.close();
  await phone.close();
});

test("shows a node unreachable error when the pairing node cannot be reached", async ({ browser }) => {
  const pc = await browser.newContext();
  const phone = await browser.newContext();
  const pageOne = await pc.newPage();
  const pageTwo = await phone.newPage();

  await primeEnglish(pageOne);
  await primeEnglish(pageTwo);

  await enableSyncOnPc(pageOne);
  const pairingUrl = await openPairingUrl(pageOne);
  const invalidUrl = new URL(pairingUrl);
  invalidUrl.searchParams.set("node", encodeUrlForPairing("http://127.0.0.1:4999"));

  await pageTwo.goto(invalidUrl.toString());
  await expect(pageTwo.getByTestId("pairing-error")).toHaveAttribute("data-pairing-error", "node-unreachable");

  await pc.close();
  await phone.close();
});

test("exports and imports a .tatacsync file after QR pairing", async ({ browser }) => {
  const deviceOne = await browser.newContext();
  const deviceTwo = await browser.newContext();
  const pageOne = await deviceOne.newPage();
  const pageTwo = await deviceTwo.newPage();

  await primeEnglish(pageOne);
  await primeEnglish(pageTwo);

  await enableSyncOnPc(pageOne);
  const pairingUrl = await openPairingUrl(pageOne);
  await pageTwo.goto(pairingUrl);
  await pageTwo.waitForURL("**/history", { timeout: 20_000 });

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
