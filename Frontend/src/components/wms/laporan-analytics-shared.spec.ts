import { describe, expect, it } from "vitest";
import { ALL } from "./kit";
import { matchPihak, pihakKeyOf } from "./laporan-analytics-shared";

describe("pihakKeyOf", () => {
  it("memakai id bila tertaut, nama bila tidak", () => {
    expect(pihakKeyOf("supplier", 7, "CV Alat Ukur Jaya")).toBe("supplier:7");
    expect(pihakKeyOf("supplier", null, "cv alat ukur jaya")).toBe("supplier:cv alat ukur jaya");
  });
});

describe("matchPihak", () => {
  it("ALL meloloskan semua baris", () => {
    expect(matchPihak(ALL, "supplier", 7, "CV Alat Ukur Jaya")).toBe(true);
    expect(matchPihak(ALL, "lainnya", null, "X")).toBe(true);
  });

  it("format kanonis 2 segmen cocok persis", () => {
    expect(matchPihak("supplier:7", "supplier", 7, "CV Alat Ukur Jaya")).toBe(true);
    expect(matchPihak("supplier:8", "supplier", 7, "CV Alat Ukur Jaya")).toBe(false);
    expect(matchPihak("customer:7", "supplier", 7, "CV Alat Ukur Jaya")).toBe(false);
  });

  it("format master 3 segmen cocok via id", () => {
    expect(matchPihak("supplier:7:CV Alat Ukur Jaya", "supplier", 7, "CV ALAT UKUR JAYA")).toBe(
      true,
    );
    expect(matchPihak("supplier:8:CV Lain", "supplier", 7, "CV Alat Ukur Jaya")).toBe(false);
  });

  it("fallback nama case-insensitive bila baris tak tertaut", () => {
    expect(matchPihak("supplier:7:CV Alat Ukur Jaya", "supplier", null, "cv alat ukur jaya")).toBe(
      true,
    );
    expect(
      matchPihak("supplier:7:CV Alat Ukur Jaya", "supplier", null, "  CV ALAT UKUR JAYA  "),
    ).toBe(true);
    expect(matchPihak("supplier:7:CV Alat Ukur Jaya", "supplier", null, "Toko Lain")).toBe(false);
  });

  it("beda jenis selalu ditolak", () => {
    expect(matchPihak("supplier:7:CV Alat Ukur Jaya", "customer", 7, "CV Alat Ukur Jaya")).toBe(
      false,
    );
  });
});
