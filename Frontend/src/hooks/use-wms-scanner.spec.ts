import { fireEvent, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWmsScanner } from "./use-wms-scanner";

const { mockError, mockSuccess } = vi.hoisted(() => ({
  mockError: vi.fn(),
  mockSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: mockError, success: mockSuccess },
}));

const items = [
  {
    id: 1,
    sku: "SKU-1",
    barcode: "8990000000001",
    internal_barcode: "IB-001",
    name: "Barang Satu",
  },
];

/** Simulasikan burst scanner wedge: karakter cepat + Enter. */
function wedgeScan(code: string) {
  for (const ch of code) fireEvent.keyDown(window, { key: ch });
  fireEvent.keyDown(window, { key: "Enter" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useWmsScanner onUnknown", () => {
  it("kode asing memanggil onUnknown (bukan toast error)", () => {
    const onUnknown = vi.fn();
    const onPick = vi.fn();
    renderHook(() => useWmsScanner({ items, onPick, onUnknown }));

    wedgeScan("8999990000099");

    expect(onUnknown).toHaveBeenCalledWith("8999990000099");
    expect(onPick).not.toHaveBeenCalled();
    expect(mockError).not.toHaveBeenCalled();
  });

  it("tanpa onUnknown, kode asing tetap toast error (perilaku lama)", () => {
    const onPick = vi.fn();
    renderHook(() => useWmsScanner({ items, onPick }));

    wedgeScan("8999990000099");

    expect(onPick).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining("tidak ditemukan"));
  });

  it("kode dikenal tetap memilih barang (regresi)", () => {
    const onUnknown = vi.fn();
    const onPick = vi.fn();
    renderHook(() => useWmsScanner({ items, onPick, onUnknown }));

    wedgeScan("IB-001");

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(onUnknown).not.toHaveBeenCalled();
    expect(mockSuccess).toHaveBeenCalled();
  });
});

describe("useWmsScanner resolveScan (input manual)", () => {
  it("mengekspos resolveScan untuk jalur ketik/tempel manual", () => {
    const onUnknown = vi.fn();
    const onPick = vi.fn();
    const { result } = renderHook(() => useWmsScanner({ items, onPick, onUnknown }));

    expect(result.current.resolveScan("  588191429331 ")).toBe(true);

    expect(onUnknown).toHaveBeenCalledWith("588191429331");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("resolveScan kode dikenal memilih barang tanpa kamera", () => {
    const onUnknown = vi.fn();
    const onPick = vi.fn();
    const { result } = renderHook(() => useWmsScanner({ items, onPick, onUnknown }));

    expect(result.current.resolveScan("8990000000001")).toBe(true);

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(onUnknown).not.toHaveBeenCalled();
  });
});
