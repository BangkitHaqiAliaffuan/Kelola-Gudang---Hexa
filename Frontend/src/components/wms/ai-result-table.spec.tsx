import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  AiResultTable,
  AiResultTables,
  extractTable,
  formatCell,
  labelFor,
  tableTitleFor,
} from "./ai-result-table";

describe("extractTable", () => {
  it("mengekstrak bentuk analisis_data (columns + rows)", () => {
    const t = extractTable({
      columns: ["name", "stock", "min_stock"],
      rows: [{ name: "Baut M8", stock: 3, min_stock: 10 }],
      row_count: 1,
    });
    expect(t).not.toBeNull();
    expect(t?.columns).toEqual(["name", "stock", "min_stock"]);
    expect(t?.rows).toHaveLength(1);
  });

  it("mengekstrak bentuk cari_barang (key items)", () => {
    const t = extractTable({
      count: 1,
      items: [{ id: 1, sku: "SKU-1", nama: "Baut", stok_total: 5, stok_minimum: 2 }],
    });
    expect(t?.sourceKey).toBe("items");
    expect(t?.columns).toContain("stok_minimum");
  });

  it("mengekstrak bentuk daftar_gudang (key warehouses)", () => {
    const t = extractTable({
      count: 1,
      warehouses: [{ id: 1, code: "G1", nama: "Gudang A", kota: "Bekasi" }],
    });
    expect(t?.sourceKey).toBe("warehouses");
    expect(t?.columns).toEqual(["id", "code", "nama", "kota"]);
  });

  it("menggabungkan kunci baris yang tidak seragam (union, urut kemunculan)", () => {
    const t = extractTable({ rows: [{ a: 1 }, { b: 2 }, { a: 3, c: 4 }] });
    expect(t?.columns).toEqual(["a", "b", "c"]);
  });

  it("mengembalikan null untuk hasil bukan tabel (mis. error)", () => {
    expect(extractTable({ error: "Tabel 'users' tidak diizinkan" })).toBeNull();
    expect(extractTable("teks")).toBeNull();
    expect(extractTable(null)).toBeNull();
    expect(extractTable({ count: 0, items: [] })).toBeNull();
  });
});

describe("labelFor / formatCell", () => {
  it("menerjemahkan nama kolom Inggris ke label Indonesia", () => {
    expect(labelFor("min_stock")).toBe("Stok Min");
    expect(labelFor("stok_minimum")).toBe("Stok Min");
    expect(labelFor("nama")).toBe("Nama");
    expect(labelFor("partner")).toBe("Rekanan");
  });

  it("fallback ke Title Case untuk kolom tak dikenal", () => {
    expect(labelFor("total_nilai_stok")).toBe("Total Nilai Stok");
  });

  it("memformat nilai sel dengan aman", () => {
    expect(formatCell(null)).toBe("—");
    expect(formatCell(true)).toBe("Ya");
    expect(formatCell(false)).toBe("Tidak");
    expect(formatCell(1234)).toBe("1.234");
    expect(formatCell("Gudang A")).toBe("Gudang A");
    expect(formatCell([1, 2])).toBe("[2]");
    expect(formatCell({ x: 1 })).toBe("{…}");
  });
});

describe("tableTitleFor", () => {
  it("memberi judul ramah per tool", () => {
    expect(tableTitleFor("cari_barang")).toBe("Daftar Barang");
    expect(tableTitleFor("analisis_data")).toBe("Hasil Analitik");
    expect(tableTitleFor("tak_dikenal")).toBe("Hasil data");
  });
});

describe("AiResultTable / AiResultTables", () => {
  it("merender header & baris dalam Bahasa Indonesia", () => {
    render(
      <AiResultTable
        table={{
          sourceKey: "items",
          columns: ["nama", "stok_total", "stok_minimum"],
          rows: [{ nama: "Baut M8", stok_total: 3, stok_minimum: 10 }],
        }}
      />,
    );
    expect(screen.getByText("Nama")).toBeTruthy();
    expect(screen.getByText("Stok Min")).toBeTruthy();
    expect(screen.getByText("Baut M8")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("menyembunyikan tabel bila hasil bukan bentuk tabel", () => {
    const { container } = render(
      <AiResultTables results={[{ tool: "analisis_data", result: { error: "ditolak" } }]} />,
    );
    expect(container.querySelector("table")).toBeNull();
  });

  it("hasil terakhir tampil penuh, hasil antara terlipat di Proses analisis", async () => {
    const user = userEvent.setup();
    render(
      <AiResultTables
        results={[
          { tool: "cari_barang", result: { items: [{ id: 1, nama: "A" }] } },
          { tool: "daftar_gudang", result: { warehouses: [{ id: 1, nama: "G" }] } },
        ]}
      />,
    );
    // Final (terakhir) langsung terlihat; sebelumnya terlipat.
    expect(screen.getByText("Daftar Gudang")).toBeTruthy();
    expect(screen.queryByText("Daftar Barang")).toBeNull();
    expect(screen.getByText(/Proses analisis \(1\)/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Proses analisis/ }));
    expect(screen.getByText("Daftar Barang")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Sembunyikan proses analisis/ }));
    expect(screen.queryByText("Daftar Barang")).toBeNull();
    // Final tetap terlihat.
    expect(screen.getByText("Daftar Gudang")).toBeTruthy();
  });

  it("satu hasil tampil penuh tanpa lipatan", () => {
    render(
      <AiResultTables
        results={[{ tool: "daftar_gudang", result: { warehouses: [{ id: 1, nama: "G" }] } }]}
      />,
    );
    expect(screen.getByText("Daftar Gudang")).toBeTruthy();
    expect(screen.queryByText(/Proses analisis/)).toBeNull();
  });

  it("bentuk insiden: 3 probing + 1 final → final penuh, 3 terlipat", async () => {
    const user = userEvent.setup();
    const probe = (no: string) => ({
      tool: "analisis_data",
      result: { columns: ["no"], rows: [{ no }] },
    });
    render(
      <AiResultTables
        results={[
          probe("BM/2026/00001"),
          probe("BM/2026/00002"),
          probe("BM/2026/00003"),
          {
            tool: "analisis_data",
            result: { columns: ["sku", "total"], rows: [{ sku: "NUT-M5", total: 500 }] },
          },
        ]}
      />,
    );
    expect(screen.getByText("NUT-M5")).toBeTruthy();
    expect(screen.queryByText("BM/2026/00001")).toBeNull();
    expect(screen.getByText(/Proses analisis \(3\)/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Proses analisis/ }));
    expect(screen.getByText("BM/2026/00001")).toBeTruthy();
    expect(screen.getByText("BM/2026/00003")).toBeTruthy();
  });

  it("tidak merender HTML dari nilai sel (inert)", () => {
    const { container } = render(
      <AiResultTable
        table={{
          sourceKey: "rows",
          columns: ["nama"],
          rows: [{ nama: '<img src=x onerror="alert(1)">' }],
        }}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/onerror/, { exact: false })).toBeTruthy();
  });
});
