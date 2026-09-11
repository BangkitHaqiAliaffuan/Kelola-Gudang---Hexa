import { describe, expect, it } from "vitest";
import {
  AUTO_CREATABLE_PREFIXES,
  isRowFatalError,
  normalizeHeaderKey,
  numberAmbiguityWarning,
  parseLocalizedNumber,
  REQUIRED_CSV_HEADERS,
  resolveImportRowStatus,
} from "./import-parse";

describe("parseLocalizedNumber", () => {
  it("kosong → null", () => {
    expect(parseLocalizedNumber(undefined)).toBeNull();
    expect(parseLocalizedNumber("")).toBeNull();
    expect(parseLocalizedNumber("   ")).toBeNull();
  });

  it("ribuan Indonesia dan spasi", () => {
    expect(parseLocalizedNumber("50000")).toBe(50000);
    expect(parseLocalizedNumber("50.000")).toBe(50000);
    expect(parseLocalizedNumber("50 000")).toBe(50000);
    expect(parseLocalizedNumber("1.234.567")).toBe(1234567);
  });

  it("desimal koma dan titik", () => {
    expect(parseLocalizedNumber("1,5")).toBe(1.5);
    expect(parseLocalizedNumber("0.5", "weight")).toBe(0.5);
    expect(parseLocalizedNumber("2.75", "weight")).toBe(2.75);
    expect(parseLocalizedNumber("12.50", "money")).toBe(12.5);
  });

  it("dua pemisah: yang terakhir desimal", () => {
    expect(parseLocalizedNumber("1.234.567,89")).toBe(1234567.89);
    expect(parseLocalizedNumber("1,234.56")).toBe(1234.56);
  });

  it("ambiguitas satu-titik-3-digit: ribuan untuk money/int, desimal untuk weight", () => {
    expect(parseLocalizedNumber("1.234", "money")).toBe(1234);
    expect(parseLocalizedNumber("1.234", "int")).toBe(1234);
    expect(parseLocalizedNumber("1.234", "weight")).toBe(1.234);
  });

  it("koma-3-digit selalu ribuan", () => {
    expect(parseLocalizedNumber("1,234", "money")).toBe(1234);
    expect(parseLocalizedNumber("1,234", "weight")).toBe(1234);
  });

  it("sampah → null", () => {
    expect(parseLocalizedNumber("abc")).toBeNull();
    expect(parseLocalizedNumber("12abc")).toBeNull();
  });
});

describe("numberAmbiguityWarning", () => {
  it("hanya pola satu-pemisah-3-digit yang diperingatkan", () => {
    expect(numberAmbiguityWarning("1.234", "money")).toBe("Angka '1.234' dibaca sebagai ribuan");
    expect(numberAmbiguityWarning("1.234", "weight")).toBe("Angka '1.234' dibaca sebagai desimal");
    expect(numberAmbiguityWarning("1,234", "weight")).toBe("Angka '1,234' dibaca sebagai ribuan");
    expect(numberAmbiguityWarning("50.000", "money")).toBe("Angka '50.000' dibaca sebagai ribuan");
    expect(numberAmbiguityWarning("0.5", "weight")).toBeNull();
    expect(numberAmbiguityWarning("1,5", "money")).toBeNull();
    expect(numberAmbiguityWarning("50000", "money")).toBeNull();
  });
});

describe("isRowFatalError", () => {
  it("unknown auto-creatable saja → tidak fatal", () => {
    expect(isRowFatalError(["Kategori 'X' tidak ditemukan"])).toBe(false);
    expect(isRowFatalError(["Merk 'Y' tidak ditemukan", "Satuan 'Z' tidak ditemukan"])).toBe(false);
    expect(isRowFatalError([])).toBe(false);
  });

  it("duplikat SKU dan unknown tanpa jalur auto-create → fatal", () => {
    expect(isRowFatalError(["SKU 'A' duplikat di file dengan database"])).toBe(true);
    expect(isRowFatalError(["Supplier 'S' tidak ditemukan"])).toBe(true);
    expect(isRowFatalError(["Gudang 'G' tidak ditemukan"])).toBe(true);
    expect(isRowFatalError(["Rak 'R' tidak ditemukan"])).toBe(true);
    expect(isRowFatalError(["Bin 'B' tidak ditemukan"])).toBe(true);
    expect(isRowFatalError(["Nama Barang wajib diisi"])).toBe(true);
    expect(isRowFatalError(["Harga Pokok minimal Rp 100"])).toBe(true);
  });

  it("campuran: satu fatal menulari baris", () => {
    expect(isRowFatalError(["Kategori 'X' tidak ditemukan", "Gudang 'G' tidak ditemukan"])).toBe(
      true,
    );
  });

  it("daftar prefix auto-creatable", () => {
    expect(AUTO_CREATABLE_PREFIXES).toEqual(["Kategori '", "Merk '", "Satuan '"]);
  });
});

describe("normalizeHeaderKey", () => {
  const known = ["SKU", "Nama Barang", "Harga Pokok"];
  it("strip BOM, trim, case-insensitive", () => {
    expect(normalizeHeaderKey("\uFEFFSKU", known)).toBe("SKU");
    expect(normalizeHeaderKey("  sku  ", known)).toBe("SKU");
    expect(normalizeHeaderKey("nama barang", known)).toBe("Nama Barang");
    expect(normalizeHeaderKey("HARGA POKOK", known)).toBe("Harga Pokok");
  });

  it("header tak dikenal diteruskan apa adanya", () => {
    expect(normalizeHeaderKey("Kode Internal", known)).toBe("Kode Internal");
  });

  it("header wajib", () => {
    expect(REQUIRED_CSV_HEADERS).toEqual(["Nama Barang", "Kategori", "Harga Pokok", "Harga Jual"]);
  });
});

describe("resolveImportRowStatus", () => {
  it("error bila fatal", () => {
    expect(
      resolveImportRowStatus({
        errors: ["Gudang 'G' tidak ditemukan"],
        autoCreateCat: { name: "X", checked: true },
      }),
    ).toBe("error");
  });

  it("auto_create bila ada entry checked", () => {
    expect(
      resolveImportRowStatus({
        errors: ["Kategori 'X' tidak ditemukan"],
        autoCreateCat: { name: "X", checked: true },
      }),
    ).toBe("auto_create");
  });

  it("skipped bila entry ada tapi semua unchecked", () => {
    expect(
      resolveImportRowStatus({
        errors: ["Kategori 'X' tidak ditemukan"],
        autoCreateCat: { name: "X", checked: false },
        autoCreateMerk: { name: "Y", checked: false },
      }),
    ).toBe("skipped");
  });

  it("valid bila tanpa error dan tanpa entry", () => {
    expect(resolveImportRowStatus({ errors: [] })).toBe("valid");
  });
});
