import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
