import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type { StockValuationApi } from "@/lib/persediaan-types";
import { useStockValuation } from "./use-persediaan";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function row(id: number): StockValuationApi {
  return {
    id,
    item_id: id,
    sku: `SKU-${id}`,
    name: `Item ${id}`,
    unit: "pcs",
    category: "Umum",
    min: 0,
    max: 100,
    cost: 1000,
    stock: 10,
    reserved: 0,
    available: 10,
    unit_cost_fifo: 1000,
    unit_cost_avg: 1000,
    unit_cost_max: 1000,
    nilai_fifo: 10000,
    nilai_avg: 10000,
    nilai_max: 10000,
    last_move_at: null,
    moving: "Fast",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useStockValuation", () => {
  it("menggabungkan seluruh halaman (W4: tidak terpotong di 500 item)", async () => {
    const page1 = {
      data: [row(1), row(2)],
      meta: { current_page: 1, last_page: 2, per_page: 100, total: 3, from: 1, to: 2 },
    };
    const page2 = {
      data: [row(3)],
      meta: { current_page: 2, last_page: 2, per_page: 100, total: 3, from: 3, to: 3 },
    };
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      return Response.json(u.includes("page=2") ? page2 : page1) as Response;
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useStockValuation({}), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.data?.data.map((r) => r.item_id)).toEqual([1, 2, 3]);
  });
});
