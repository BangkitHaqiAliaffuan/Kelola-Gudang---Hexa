import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DataTable, type Column } from "./data-table";
import { ApiError, formatQueryError } from "@/lib/api";

type Row = { id: number; name: string };

const columns: Column<Row>[] = [{ key: "name", label: "Nama", render: (r) => r.name }];
const mobileCard = (r: Row) => <span>{r.name}</span>;

describe("DataTable error visibility", () => {
  it("menampilkan panel error (bukan empty state) saat query gagal", () => {
    const err = new ApiError(
      422,
      "The per page field must not be greater than 100.",
      "/api/master/items",
      "GET",
    );
    render(
      <DataTable columns={columns} rows={[]} mobileCard={mobileCard} loading={false} error={err} />,
    );
    expect(screen.queryByText("Data tidak ditemukan")).toBeNull();
    expect(screen.getByText("The per page field must not be greater than 100.")).toBeTruthy();
  });

  it("tombol Coba lagi memanggil onRetry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const err = new ApiError(0, "Tidak dapat terhubung.", "/api/master/items", "GET");
    render(
      <DataTable
        columns={columns}
        rows={[]}
        mobileCard={mobileCard}
        loading={false}
        error={err}
        onRetry={onRetry}
      />,
    );
    await user.click(screen.getByRole("button", { name: /coba lagi/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("tanpa error tetap menampilkan empty state lama", () => {
    render(<DataTable columns={columns} rows={[]} mobileCard={mobileCard} loading={false} />);
    expect(screen.getByText("Data tidak ditemukan")).toBeTruthy();
  });

  it("emptyDescription kustom dipakai saat baris kosong", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        mobileCard={mobileCard}
        loading={false}
        emptyDescription="Gudang: Semarang · ubah filter bila data seharusnya ada."
      />,
    );
    expect(screen.getByText(/Gudang: Semarang/)).toBeTruthy();
  });
});

describe("formatQueryError", () => {
  it("memetakan status umum ke judul ramah", () => {
    expect(formatQueryError(new ApiError(0, "x", "/api/a", "GET")).title).toMatch(/terhubung/i);
    expect(formatQueryError(new ApiError(401, "x", "/api/a", "GET")).title).toMatch(/login/i);
    expect(formatQueryError(new ApiError(403, "x", "/api/a", "GET")).title).toMatch(/ditolak/i);
    expect(formatQueryError(new ApiError(500, "x", "/api/a", "GET")).title).toMatch(/server/i);
  });

  it("422 memakai pesan validasi backend apa adanya", () => {
    const { title } = formatQueryError(
      new ApiError(422, "The per page field is invalid.", "/api/a", "GET"),
    );
    expect(title).toBe("The per page field is invalid.");
  });
});

describe("DataTable selection", () => {
  const selRows: Row[] = [
    { id: 1, name: "Dokumen A" },
    { id: 2, name: "Dokumen B" },
  ];

  function Harness({
    onRowClick,
    onToggleAll,
  }: {
    onRowClick?: (row: Row) => void;
    onToggleAll?: (ids: (string | number)[]) => void;
  }) {
    const [selected, setSelected] = useState<(string | number)[]>([]);
    return (
      <DataTable
        columns={columns}
        rows={selRows}
        mobileCard={mobileCard}
        {...(onRowClick ? { onRowClick } : {})}
        selection={{
          selected,
          onToggle: (id) =>
            setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
          onToggleAll: (ids) => {
            onToggleAll?.(ids);
            setSelected((p) => (ids.length > 0 && ids.every((id) => p.includes(id)) ? [] : ids));
          },
        }}
      />
    );
  }

  it("checkbox baris memilih tanpa memicu onRowClick", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<Harness onRowClick={onRowClick} />);
    const table = screen.getByRole("table");

    const row = within(table).getByText("Dokumen A").closest("tr")!;
    await user.click(within(row).getByRole("checkbox"));
    expect(within(row).getByRole("checkbox")).toBeChecked();
    expect(onRowClick).not.toHaveBeenCalled();

    await user.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("pilih-semua memakai seluruh scope rows", async () => {
    const user = userEvent.setup();
    const onToggleAll = vi.fn();
    render(<Harness onToggleAll={onToggleAll} />);
    const table = screen.getByRole("table");

    const header = within(table).getByRole("checkbox", { name: "Pilih semua" });
    await user.click(header);
    expect(onToggleAll).toHaveBeenCalledWith([1, 2]);
    const boxes = within(table).getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    boxes.forEach((c) => expect(c).toBeChecked());
  });

  it("tanpa selection tidak ada kolom checkbox", () => {
    render(<DataTable columns={columns} rows={selRows} mobileCard={mobileCard} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
