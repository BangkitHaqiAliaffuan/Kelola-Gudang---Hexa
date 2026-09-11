import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { selectionState, useRowSelection } from "./use-row-selection";

describe("useRowSelection", () => {
  it("toggle menambah dan menghapus ID", () => {
    const { result } = renderHook(() => useRowSelection("scope-a"));
    act(() => result.current.toggle(1));
    expect(result.current.selected).toEqual([1]);
    act(() => result.current.toggle(2));
    expect(result.current.selected).toEqual([1, 2]);
    act(() => result.current.toggle(1));
    expect(result.current.selected).toEqual([2]);
  });

  it("toggleAll memilih semua lalu mengosongkan", () => {
    const { result } = renderHook(() => useRowSelection("scope-a"));
    act(() => result.current.toggleAll([1, 2, 3]));
    expect(result.current.selected).toEqual([1, 2, 3]);
    act(() => result.current.toggleAll([1, 2, 3]));
    expect(result.current.selected).toEqual([]);
  });

  it("mengosongkan seleksi saat resetKey berubah", () => {
    const { result, rerender } = renderHook(({ key }) => useRowSelection(key), {
      initialProps: { key: "scope-a" },
    });
    act(() => result.current.toggleAll([1, 2]));
    expect(result.current.selected).toEqual([1, 2]);
    rerender({ key: "scope-b" });
    expect(result.current.selected).toEqual([]);
  });

  it("clear mengosongkan tanpa mengubah scope", () => {
    const { result } = renderHook(() => useRowSelection("scope-a"));
    act(() => result.current.toggle(9));
    act(() => result.current.clear());
    expect(result.current.selected).toEqual([]);
  });
});

describe("selectionState", () => {
  it("all bila semua tercakup, some bila sebagian", () => {
    expect(selectionState([1, 2], [1, 2])).toEqual({ all: true, some: false });
    expect(selectionState([1], [1, 2])).toEqual({ all: false, some: true });
    expect(selectionState([], [1, 2])).toEqual({ all: false, some: false });
    expect(selectionState([1], [])).toEqual({ all: false, some: true });
  });
});
