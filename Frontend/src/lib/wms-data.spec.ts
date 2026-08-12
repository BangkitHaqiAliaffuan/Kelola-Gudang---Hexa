import { describe, expect, it } from "vitest";
import {
  activities,
  formatNumber,
  items,
  lowStock,
  monthly,
  opnameSessions,
  outStock,
  totalValue,
  transactions,
  warehouses,
} from "./wms-data";

describe("wms-data dashboard invariants", () => {
  it("lowStock: stok > 0 dan <= min; outStock: stok === 0; saling eksklusif", () => {
    expect(lowStock.length).toBeGreaterThan(0);
    for (const i of lowStock) {
      expect(i.stock).toBeGreaterThan(0);
      expect(i.stock).toBeLessThanOrEqual(i.min);
    }
    for (const i of outStock) {
      expect(i.stock).toBe(0);
    }

    const lowIds = new Set(lowStock.map((i) => i.id));
    for (const i of outStock) {
      expect(lowIds.has(i.id)).toBe(false);
    }
  });

  it("totalValue sama dengan sum(stock * cost)", () => {
    const expected = items.reduce((a, b) => a + b.stock * b.cost, 0);
    expect(totalValue).toBe(expected);
  });

  it("monthly: 12 bulan dengan nilai positif untuk masuk/keluar/saldo/nilai", () => {
    expect(monthly).toHaveLength(12);
    for (const m of monthly) {
      expect(m.masuk).toBeGreaterThan(0);
      expect(m.keluar).toBeGreaterThan(0);
      expect(m.saldo).toBeGreaterThan(0);
      expect(m.nilai).toBeGreaterThan(0);
    }
  });

  it("activities: 14 item turunan dari transaksi terbaru", () => {
    expect(activities).toHaveLength(14);
    expect(activities[0]?.id).toBe(transactions[0]?.id);
    for (const a of activities) {
      expect(a.type).toBeTruthy();
      expect(a.no).toBeTruthy();
      expect(a.pic).toBeTruthy();
    }
  });

  it("transactions terurut tanggal terbaru dulu", () => {
    expect(transactions.length).toBeGreaterThan(1);
    for (let i = 1; i < transactions.length; i++) {
      expect(+new Date(transactions[i - 1]!.date)).toBeGreaterThanOrEqual(
        +new Date(transactions[i]!.date),
      );
    }
  });

  it("opnameSessions: 5 sesi, tepat 2 Berjalan (penopang stat dashboard)", () => {
    expect(opnameSessions).toHaveLength(5);
    expect(opnameSessions.filter((o) => o.status === "Berjalan")).toHaveLength(2);
    for (const s of opnameSessions) {
      expect(s.checked).toBeGreaterThan(0);
      expect(s.checked).toBeLessThanOrEqual(s.total);
    }
  });

  it("warehouses: 8 entri (penopang stat Total Gudang)", () => {
    expect(warehouses).toHaveLength(8);
  });

  it("formatNumber memakai pengelompokan id-ID", () => {
    expect(formatNumber(300)).toBe("300");
    expect(formatNumber(145837)).toBe("145.837");
  });
});
