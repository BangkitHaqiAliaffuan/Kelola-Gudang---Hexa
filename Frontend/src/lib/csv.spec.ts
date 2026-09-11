import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsv, toCsv } from "./csv";

const HEADERS = [
  { key: "nama", label: "Barang" },
  { key: "qty", label: "Qty" },
];

describe("toCsv", () => {
  it("header + baris digabung CRLF", () => {
    const out = toCsv(
      [
        { nama: "Bearing", qty: 10 },
        { nama: "Oli", qty: 5 },
      ],
      HEADERS,
    );
    expect(out).toBe("Barang,Qty\r\nBearing,10\r\nOli,5");
  });

  it("koma, petik, newline di-quote ganda", () => {
    const out = toCsv([{ nama: 'Oli "prime", 1L\nbaru', qty: 1 }], HEADERS);
    expect(out).toContain('"Oli ""prime"", 1L\nbaru"');
  });

  it("sel string diawali = + - @ diberi prefiks apostrof (anti formula-injection)", () => {
    const out = toCsv(
      [
        { nama: "=SUM(A1)", qty: 1 },
        { nama: "+62812", qty: 2 },
        { nama: "-5", qty: 3 },
        { nama: "@x", qty: 4 },
      ],
      HEADERS,
    );
    expect(out).toContain("'=SUM(A1)");
    expect(out).toContain("'+62812");
    expect(out).toContain("'-5");
    expect(out).toContain("'@x");
  });

  it("sel numerik berawalan formula dibiarkan apa adanya (tetap angka Excel)", () => {
    const out = toCsv([{ nama: "X", qty: -5 }], HEADERS);
    expect(out).toContain(",-5");
  });

  it("null/undefined menjadi sel kosong", () => {
    const out = toCsv([{ nama: null, qty: undefined }], HEADERS);
    expect(out).toBe("Barang,Qty\r\n,");
  });
});

describe("downloadCsv", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mengunduh Blob CSV ber-BOM dengan nama file benar lalu revoke URL", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createElement = vi.spyOn(document, "createElement");

    downloadCsv("laporan-x-2026-09-11.csv", "Barang,Qty\r\nA,1");

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]![0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain("text/csv");
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(text).toBe("Barang,Qty\r\nA,1");
    // FileReader mengupas BOM saat decode: verifikasi via ukuran
    // (isi 15 byte ASCII + BOM UTF-8 3 byte = 18).
    expect(blob.size).toBe(18);
    const anchor = createElement.mock.results[0]!.value as HTMLAnchorElement;
    expect(anchor.download).toBe("laporan-x-2026-09-11.csv");
    expect(anchor.href).toBe("blob:mock");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
