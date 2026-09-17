import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { buildTableQuery, useServerTable } from "./use-server-table";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const PAGE = {
  data: [{ id: 1 }, { id: 2 }],
  meta: { current_page: 2, last_page: 9, per_page: 12, total: 105, from: 13, to: 24 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildTableQuery", () => {
  it("menyusun page/per_page/search + filter, menghilangkan nilai kosong", () => {
    expect(
      buildTableQuery({
        page: 2,
        perPage: 12,
        search: "ban",
        filters: { warehouse_id: 3, type: null, status: undefined, note: "" },
      }),
    ).toBe("page=2&per_page=12&search=ban&warehouse_id=3");
  });

  it("tanpa search/filter → hanya page & per_page", () => {
    expect(buildTableQuery({ page: 1, perPage: 12 })).toBe("page=1&per_page=12");
  });
});

describe("useServerTable", () => {
  it("meminta halaman server dan menurunkan rows/total/lastPage", async () => {
    const fetchMock = vi.fn(async () => Response.json(PAGE) as Response);
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { result } = renderHook(
      () =>
        useServerTable<{ id: number }>(["master", "items"], "/master/items", {
          page: 2,
          perPage: 12,
          search: "ban",
          filters: { warehouse_id: 3 },
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toBe("/api/master/items?page=2&per_page=12&search=ban&warehouse_id=3");
    expect(result.current.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.current.total).toBe(105);
    expect(result.current.lastPage).toBe(9);
  });
});
