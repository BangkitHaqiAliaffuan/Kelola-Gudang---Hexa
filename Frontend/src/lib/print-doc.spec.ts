import { describe, expect, it } from "vitest";
import { buildPrintDoc, escPrintText, printDocCss } from "./print-doc";

describe("escPrintText", () => {
  it("meng-escape markup dan memakai em-dash untuk null", () => {
    expect(escPrintText("Kirim <cepat> & rapi")).toBe("Kirim &lt;cepat&gt; &amp; rapi");
    expect(escPrintText(null)).toBe("—");
    expect(escPrintText(undefined)).toBe("—");
  });
});

describe("buildPrintDoc", () => {
  it("membungkus judul ter-escape + kop + isi tanpa chrome aplikasi", () => {
    const html = buildPrintDoc({
      title: "PO/2026/0001 <x>",
      kopHtml: "<p>kop</p>",
      bodyHtml: "<h1>Isi</h1>",
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>PO/2026/0001 &lt;x&gt;</title>");
    expect(html).toContain("<p>kop</p>");
    expect(html).toContain("<h1>Isi</h1>");
    expect(html).toContain("KelolaGudang");
    expect(html).not.toContain("KelolaGudang Pro");
    expect(html).not.toMatch(/<aside|<header|<nav|sidebar|bottom-nav/i);
  });

  it("menyediakan kelas CSS yang dipakai seluruh builder", () => {
    const css = printDocCss();
    for (const cls of [".mono", ".muted", ".kop-logo", ".grid", ".field", ".foot", ".note"]) {
      expect(css).toContain(cls);
    }
  });
});
