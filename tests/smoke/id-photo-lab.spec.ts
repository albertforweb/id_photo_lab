import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontFacingPortrait = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test-fixtures/portraits/front-facing-portrait.svg",
);

async function uploadPortrait(page: import("@playwright/test").Page) {
  await page.setInputFiles('input[type="file"]', frontFacingPortrait);
  await expect(page.locator(".status-pill").getByText("Photo loaded")).toBeVisible();
  await expect(page.getByLabel("Photo crop preview")).toHaveClass(/loaded/);
}

test("uploads a portrait, previews split mode, and downloads the free-edit result", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ID Photo Lab" })).toBeVisible();

  await uploadPortrait(page);
  await expect(page.getByRole("option", { name: /Free edit/ })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: /Split/ }).click();
  await expect(page.locator(".split-preview-overlay")).toBeVisible();

  await page.getByRole("button", { name: "Download current edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Photo Export" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Free edit", { exact: true })).toBeVisible();
  await expect(dialog.getByText("900 x 1200")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("front-facing-portrait-edited.jpg");
});

test("runs document selection, local face-detection command, and document export preview", async ({ page }) => {
  await page.goto("/");
  await uploadPortrait(page);

  await page.getByRole("option", { name: /United States\s+Passport photo/ }).click();
  await expect(page.getByRole("heading", { name: "Passport photo" })).toBeVisible();

  await page.getByRole("button", { name: "Detect face" }).click();
  await expect(page.getByText(/Face detected|No face detected/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[role="alert"]')).toHaveCount(0);

  await page.getByRole("button", { name: /Auto-align|Detect & align/ }).click();
  await expect(page.getByText(/Auto-aligned|Face detected|No face detected/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[role="alert"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Download photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Photo Export" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("United States - Passport photo")).toBeVisible();
  await expect(dialog.getByText("600 x 600")).toBeVisible();
});
