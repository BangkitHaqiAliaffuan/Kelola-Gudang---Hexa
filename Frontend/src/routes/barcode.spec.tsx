import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GridNumberInput } from "./barcode";
import { parseGridNumber } from "@/lib/barcode-label";

describe("parseGridNumber", () => {
  it("string kosong/blank belum valid (bukan 0, bukan NaN)", () => {
    expect(parseGridNumber("", true)).toBeNull();
    expect(parseGridNumber("   ", true)).toBeNull();
    expect(parseGridNumber("", false)).toBeNull();
  });

  it("integer hanya menerima digit bulat", () => {
    expect(parseGridNumber("12", true)).toBe(12);
    expect(parseGridNumber("0", true)).toBe(0);
    expect(parseGridNumber("12abc", true)).toBeNull();
    expect(parseGridNumber("1.5", true)).toBeNull();
    expect(parseGridNumber("e", true)).toBeNull();
  });

  it("desimal menerima pecahan langkah 0.5", () => {
    expect(parseGridNumber("0.5", false)).toBe(0.5);
    expect(parseGridNumber("2", false)).toBe(2);
    expect(parseGridNumber("abc", false)).toBeNull();
  });
});

describe("GridNumberInput", () => {
  it("digit tunggal bisa dikosongkan via keyboard tanpa snap-back", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <GridNumberInput
        ariaLabel="Jumlah kolom"
        unit="kolom"
        value={1}
        integer
        onCommit={onCommit}
      />,
    );
    const input = screen.getByLabelText("Jumlah kolom");
    expect(input).toHaveValue(1);

    await user.clear(input);
    // Field boleh kosong (teks diterima) dan tidak commit nilai rusak.
    expect(input).toHaveValue(null);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ketikan valid tetap di-commit dan blur mengembalikan nilai terakhir", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <GridNumberInput
        ariaLabel="Jumlah kolom"
        unit="kolom"
        value={3}
        integer
        onCommit={onCommit}
      />,
    );
    const input = screen.getByLabelText("Jumlah kolom");

    await user.clear(input);
    await user.type(input, "12");
    expect(onCommit).toHaveBeenLastCalledWith(12);
    expect(input).toHaveValue(12);

    await user.clear(input);
    await user.tab();
    // Blur mengembalikan tampilan ke nilai prop terakhir (di pemakaian nyata
    // prop sudah ikut ter-commit menjadi 12; di sini prop tetap 3).
    expect(input).toHaveValue(3);
  });

  it("nilai eksternal (pilih preset) me-reset teks lokal", () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <GridNumberInput
        ariaLabel="Margin kertas (mm)"
        unit="margin"
        value={10}
        onCommit={onCommit}
      />,
    );
    expect(screen.getByLabelText("Margin kertas (mm)")).toHaveValue(10);
    rerender(
      <GridNumberInput
        ariaLabel="Margin kertas (mm)"
        unit="margin"
        value={5}
        onCommit={onCommit}
      />,
    );
    expect(screen.getByLabelText("Margin kertas (mm)")).toHaveValue(5);
  });
});
