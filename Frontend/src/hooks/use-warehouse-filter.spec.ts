import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ALL } from "@/components/wms/kit";
import { useWarehouseFilter } from "./use-warehouse-filter";

const { authState } = vi.hoisted(() => ({
  authState: { user: null as { id: number; default_warehouse_id: number | null } | null },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

const WAREHOUSES = [
  { id: 1, name: "Gudang Pusat Jakarta" },
  { id: 2, name: "Gudang Bekasi" },
  { id: 3, name: "Gudang Surabaya" },
];

const KEY = "kg-wh-filter:7";

beforeEach(() => {
  window.localStorage.clear();
  authState.user = { id: 7, default_warehouse_id: 2 };
});

describe("useWarehouseFilter", () => {
  it("tanpa pilihan tersimpan → memakai gudang default user", () => {
    const { result } = renderHook(() => useWarehouseFilter(WAREHOUSES));
    expect(result.current.value).toBe("Gudang Bekasi");
    expect(result.current.warehouseId).toBe(2);
  });

  it("pilihan tersimpan menang atas default user", () => {
    window.localStorage.setItem(KEY, "3");
    const { result } = renderHook(() => useWarehouseFilter(WAREHOUSES));
    expect(result.current.value).toBe("Gudang Surabaya");
    expect(result.current.warehouseId).toBe(3);
  });

  it('"Semua" eksplisit yang tersimpan dihormati (tidak jatuh ke default)', () => {
    window.localStorage.setItem(KEY, "all");
    const { result } = renderHook(() => useWarehouseFilter(WAREHOUSES));
    expect(result.current.value).toBe(ALL);
    expect(result.current.warehouseId).toBeNull();
  });

  it("id tersimpan yang sudah tidak ada → jatuh ke default", () => {
    window.localStorage.setItem(KEY, "99");
    const { result } = renderHook(() => useWarehouseFilter(WAREHOUSES));
    expect(result.current.value).toBe("Gudang Bekasi");
    expect(result.current.warehouseId).toBe(2);
  });

  it("tanpa default dan tanpa simpanan → Semua", () => {
    authState.user = { id: 7, default_warehouse_id: null };
    const { result } = renderHook(() => useWarehouseFilter(WAREHOUSES));
    expect(result.current.value).toBe(ALL);
    expect(result.current.warehouseId).toBeNull();
  });

  it("daftar gudang belum dimuat → Semua (belum resolve)", () => {
    const { result } = renderHook(() => useWarehouseFilter(undefined));
    expect(result.current.value).toBe(ALL);
    expect(result.current.warehouseId).toBeNull();
  });

  it("onChange menyimpan pilihan dan mengupdate nilai", () => {
    const { result } = renderHook(() => useWarehouseFilter(WAREHOUSES));
    act(() => result.current.onChange("Gudang Surabaya"));
    expect(window.localStorage.getItem(KEY)).toBe("3");
    expect(result.current.value).toBe("Gudang Surabaya");

    act(() => result.current.onChange(ALL));
    expect(window.localStorage.getItem(KEY)).toBe("all");
    expect(result.current.value).toBe(ALL);
  });

  it("reset menghapus simpanan dan kembali ke default", () => {
    window.localStorage.setItem(KEY, "1");
    const { result } = renderHook(() => useWarehouseFilter(WAREHOUSES));
    expect(result.current.value).toBe("Gudang Pusat Jakarta");

    act(() => result.current.reset());
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(result.current.value).toBe("Gudang Bekasi");
    expect(result.current.warehouseId).toBe(2);
  });

  it("kunci terpisah per user (tidak bocor antar akun)", () => {
    window.localStorage.setItem(KEY, "1");
    window.localStorage.setItem("kg-wh-filter:9", "3");
    authState.user = { id: 9, default_warehouse_id: null };
    const { result } = renderHook(() => useWarehouseFilter(WAREHOUSES));
    expect(result.current.value).toBe("Gudang Surabaya");
  });
});
