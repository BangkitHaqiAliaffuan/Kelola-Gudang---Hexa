import { expect, test, type Page } from "@playwright/test";

// Read-only: hanya GET + element screenshot logo, tidak POST/PUT/DELETE.
// Logo = komponen Logo (kit.tsx): ikon gudang + teks "Kelola"+"Gudang".
// Teks "Gudang" terbelah di span dalam, jadi targetkan wrapper div-nya
// (2 level di atas span) agar ikon ikut tercapture.

async function shootLogo(page: Page, outPath: string) {
  await page.evaluate(() => document.fonts.ready);
  const text = page.locator("span.font-normal:visible", { hasText: "Gudang" }).first();
  await expect(text).toBeVisible({ timeout: 10_000 });
  const logo = text.locator("xpath=ancestor::div[2]");
  await expect(logo).toBeVisible({ timeout: 10_000 });
  await logo.screenshot({ path: outPath, animations: "disabled" });
}

test("logo halaman login", async ({ page }, testInfo) => {
  await page.goto("/login");
  await shootLogo(page, `test-results/screenshots/${testInfo.project.name}/logo-login.png`);
});

test("logo sidebar dashboard", async ({ page }, testInfo) => {
  await page.goto("/");
  await shootLogo(page, `test-results/screenshots/${testInfo.project.name}/logo-sidebar.png`);
});
