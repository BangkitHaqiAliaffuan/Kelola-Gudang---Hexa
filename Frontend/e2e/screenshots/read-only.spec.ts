import { expect, test } from "@playwright/test";

// Read-only: hanya GET + screenshot, tidak POST/PUT/DELETE (data aman)

const pages: { name: string; url: string; waitFor: RegExp; heading: RegExp }[] = [
  { name: "opname-jadwal", url: "/opname/jadwal", waitFor: /stock-documents/, heading: /Jadwal Opname/i },
  { name: "opname-proses", url: "/opname/proses", waitFor: /stock-documents/, heading: /Proses Opname|Daftar Sesi/i },
  { name: "persediaan-stock", url: "/persediaan/stock", waitFor: /stock/, heading: /Stock Saat Ini|Persediaan/i },
  { name: "persediaan-kartu-stock", url: "/persediaan/kartu-stock", waitFor: /stock-card|stock/, heading: /Kartu Stock/i },
  { name: "transaksi-retur-penjualan", url: "/transaksi/retur-penjualan", waitFor: /stock-documents/, heading: /Retur Penjualan/i },
  { name: "master-proyek", url: "/master/proyek", waitFor: /projects/, heading: /Proyek/i },
  { name: "transaksi-keluar", url: "/transaksi/keluar", waitFor: /stock-documents/, heading: /Barang Keluar/i },
];

for (const p of pages) {
  test(`${p.name} read-only`, async ({ page }, testInfo) => {
    await page.goto(p.url);
    await page.waitForResponse((r) => p.waitFor.test(r.url()) && r.status() === 200, { timeout: 15_000 }).catch(() => null);
    await expect(page.getByRole("heading", { name: p.heading }).first()).toBeVisible({ timeout: 10_000 }).catch(async () => {
      await expect(page.locator("body")).toContainText(p.heading, { timeout: 5_000 });
    });
    await page.waitForTimeout(600);
    const viewport = testInfo.project.name; // desktop / mobile
    await page.screenshot({ path: `test-results/screenshots/${viewport}/${p.name}.png`, fullPage: true });
  });
}
