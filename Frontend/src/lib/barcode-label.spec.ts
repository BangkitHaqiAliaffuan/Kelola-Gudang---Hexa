import { describe, expect, it } from "vitest";
import {
  MAX_LABELS,
  buildCodeSvg,
  buildPrintHtml,
  buildSheetSvg,
  computeSheetLayout,
  eanChecksumOk,
  encodeItem,
  findItemByCode,
  findMatchesByCode,
  matchSourceOf,
  normalizeCode,
  slugFilename,
} from "./barcode-label";

const item = {
  sku: "SKU-10001-001",
  barcode: "8990000000001",
  internal_barcode: "BRG-001",
};

describe("encodeItem", () => {
  it("prioritas barcode internal lalu barcode produk lalu SKU", () => {
    expect(encodeItem(item)).toBe("BRG-001");
    expect(encodeItem({ sku: "SKU-1", barcode: "8991", internal_barcode: null })).toBe("8991");
    expect(encodeItem({ sku: "SKU-1", barcode: null, internal_barcode: null })).toBe("SKU-1");
  });

  it("string kosong dianggap kosong dan di-skip", () => {
    expect(encodeItem({ sku: "SKU-1", barcode: "8991", internal_barcode: "" })).toBe("8991");
    expect(encodeItem({ sku: "SKU-1", barcode: "", internal_barcode: "" })).toBe("SKU-1");
  });
});

describe("computeSheetLayout", () => {
  it("ukuran 30x20 muat 6 kolom x 13 baris (78/sheet)", () => {
    const l = computeSheetLayout("30x20");
    expect(l).toEqual({ wMm: 30, hMm: 20, cols: 6, rows: 13, perSheet: 78 });
  });

  it("ukuran 50x30 muat 3x9 (27/sheet)", () => {
    const l = computeSheetLayout("50x30");
    expect(l).toEqual({ wMm: 50, hMm: 30, cols: 3, rows: 9, perSheet: 27 });
  });

  it("ukuran 100x50 muat 1x5 (5/sheet)", () => {
    const l = computeSheetLayout("100x50");
    expect(l).toEqual({ wMm: 100, hMm: 50, cols: 1, rows: 5, perSheet: 5 });
  });

  it("A4 penuh = satu label seukuran lembar", () => {
    const l = computeSheetLayout("A4");
    expect(l).toEqual({ wMm: 190, hMm: 277, cols: 1, rows: 1, perSheet: 1 });
  });

  it("seluruh ukuran tidak melebihi area A4 yang terpakai", () => {
    for (const s of ["30x20", "50x30", "100x50", "A4"] as const) {
      const l = computeSheetLayout(s);
      expect(l.wMm * l.cols).toBeLessThanOrEqual(190);
      expect(l.hMm * l.rows).toBeLessThanOrEqual(277);
    }
  });
});

describe("buildCodeSvg", () => {
  it("menghasilkan SVG untuk barcode (CODE128)", () => {
    const svg = buildCodeSvg("8990000000001", "Barcode");
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("menghasilkan SVG untuk QR Code", () => {
    const svg = buildCodeSvg("8990000000001", "QR Code");
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("menolak nilai kosong", () => {
    expect(() => buildCodeSvg("   ", "Barcode")).toThrow();
    expect(() => buildCodeSvg("", "QR Code")).toThrow();
  });
});

describe("buildPrintHtml", () => {
  it("memuat @page A4 dan dimensi label dalam mm", () => {
    const html = buildPrintHtml({
      size: "50x30",
      labels: [
        {
          svg: "<svg></svg>",
          name: "Bearing 6205",
          meta: "SKU-10001-001 · Rp 125.000",
          kind: "Barcode",
        },
      ],
    });
    expect(html).toContain("@page { size: A4");
    expect(html).toContain("width: 50mm");
    expect(html).toContain("height: 30mm");
    expect(html).toContain("Bearing 6205");
  });

  it("meloloskan karakter khusus di teks label", () => {
    const html = buildPrintHtml({
      size: "A4",
      labels: [{ svg: "<svg></svg>", name: "A & B <C>", meta: '"D"', kind: "Barcode" }],
    });
    expect(html).toContain("A &amp; B &lt;C&gt;");
    expect(html).toContain("&quot;D&quot;");
  });

  it("membatasi jumlah label pada MAX_LABELS", () => {
    const labels = Array.from({ length: MAX_LABELS + 20 }, (_, i) => ({
      svg: "<svg></svg>",
      name: `Item ${i}`,
      meta: "m",
      kind: "Barcode" as const,
    }));
    const html = buildPrintHtml({ size: "30x20", labels });
    expect(html.match(/class="label/g)?.length).toBe(MAX_LABELS);
  });
});

describe("buildSheetSvg", () => {
  it("menyusun grid label dalam satu SVG induk", () => {
    const sheet = buildSheetSvg({
      size: "30x20",
      labels: Array.from({ length: 78 }, (_, i) => ({
        svg: '<svg viewBox="0 0 1 1"></svg>',
        name: `I${i}`,
        meta: "m",
        kind: "Barcode" as const,
      })),
    });
    expect(sheet.startsWith("<svg")).toBe(true);
    expect(sheet.match(/<svg/g)?.length).toBe(1 + 78);
  });
});

describe("normalizeCode", () => {
  it("trim, buang CR/LF, lower-case", () => {
    expect(normalizeCode("  BRG-001 \r\n")).toBe("brg-001");
    expect(normalizeCode("SKU-10001-001")).toBe("sku-10001-001");
    expect(normalizeCode("  ")).toBe("");
  });
});

describe("findItemByCode", () => {
  const items = [
    { id: 1, sku: "SKU-10001-001", barcode: "8990000000001", internal_barcode: "BRG-001" },
    { id: 2, sku: "SKU-10001-002", barcode: null, internal_barcode: null },
    { id: 3, sku: "SKU-10001-003", barcode: "8990000000003", internal_barcode: "" },
  ] as const;

  it("cocok internal/barcode/sku tanpa memperhatikan besar-kecil huruf & spasi", () => {
    expect(findItemByCode([...items], "brg-001")?.id).toBe(1);
    expect(findItemByCode([...items], " BRG-001\r\n")?.id).toBe(1);
    expect(findItemByCode([...items], "8990000000001")?.id).toBe(1);
    expect(findItemByCode([...items], "SKU-10001-002")?.id).toBe(2);
    expect(findItemByCode([...items], "sku-10001-002")?.id).toBe(2);
  });

  it("fallback sku bila barcode kosong", () => {
    expect(findItemByCode([...items], "8990000000003")?.id).toBe(3);
    expect(findItemByCode([...items], "sku-10001-003")?.id).toBe(3);
  });

  it("tidak ada kecocokan -> undefined", () => {
    expect(findItemByCode([...items], "TIDAK-ADA")).toBeUndefined();
    expect(findItemByCode([...items], "  ")).toBeUndefined();
  });
});

describe("findMatchesByCode (barcode kemasan bersama)", () => {
  const items = [
    { id: 1, sku: "SKU-10001-001", barcode: "BERSAMA-1", internal_barcode: "IB-001" },
    { id: 2, sku: "SKU-10001-002", barcode: "BERSAMA-1", internal_barcode: "IB-002" },
    { id: 3, sku: "BERSAMA-1", barcode: null, internal_barcode: null },
  ];

  it("satu kode -> banyak calon terurut internal > produk > sku", () => {
    const got = findMatchesByCode([...items], "bersama-1");
    expect(got.map((m) => m.item.id)).toEqual([1, 2, 3]);
    expect(got.map((m) => m.source)).toEqual(["produk", "produk", "sku"]);
  });

  it("internal selalu menang walau urutan input terbalik", () => {
    const got = findMatchesByCode([items[1]!, items[0]!], "IB-001");
    expect(got).toHaveLength(1);
    expect(got[0]!.item.id).toBe(1);
    expect(got[0]!.source).toBe("internal");
  });

  it("matchSourceOf mengenali tiap sumber dan null bila tak cocok", () => {
    expect(matchSourceOf(items[0]!, "IB-001")).toBe("internal");
    expect(matchSourceOf(items[0]!, "bersama-1")).toBe("produk");
    expect(matchSourceOf(items[2]!, "BERSAMA-1")).toBe("sku");
    expect(matchSourceOf(items[0]!, "TIDAK-ADA")).toBeNull();
    expect(matchSourceOf(items[0]!, "  ")).toBeNull();
  });

  it("findItemByCode tetap kompatibel (cocok pertama = prioritas tertinggi)", () => {
    expect(findItemByCode([...items], "BERSAMA-1")?.id).toBe(1);
  });
});

describe("eanChecksumOk", () => {
  it("EAN-13 valid dan salah digit cek", () => {
    expect(eanChecksumOk("5901234123457")).toBe(true);
    expect(eanChecksumOk("5901234123450")).toBe(false);
  });

  it("UPC-A (12 digit) dan EAN-8", () => {
    expect(eanChecksumOk("123456789012")).toBe(true);
    expect(eanChecksumOk("123456789013")).toBe(false);
    expect(eanChecksumOk("96385074")).toBe(true);
    expect(eanChecksumOk("96385075")).toBe(false);
  });

  it("null untuk non-digit atau panjang non-EAN (mis. CODE128 internal)", () => {
    expect(eanChecksumOk("BRG-001")).toBeNull();
    expect(eanChecksumOk("IB-123")).toBeNull();
    expect(eanChecksumOk("12345")).toBeNull();
    expect(eanChecksumOk("")).toBeNull();
  });
});

describe("slugFilename", () => {
  it("membersihkan karakter ilegal untuk nama file", () => {
    expect(slugFilename("SKU-10001/001")).toBe("SKU-10001_001");
    expect(slugFilename("a/b:c*d")).toBe("a_b_c_d");
    expect(slugFilename("  __label__  ")).toBe("label");
    expect(slugFilename("")).toBe("label");
  });

  it("mengganti spasi dan karakter khusus", () => {
    expect(slugFilename("BRG 001")).toBe("BRG_001");
    expect(slugFilename("label-50x30")).toBe("label-50x30");
  });
});
