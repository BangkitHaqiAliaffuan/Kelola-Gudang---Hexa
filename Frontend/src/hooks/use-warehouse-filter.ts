import { useCallback, useEffect, useMemo, useState } from "react";

import { ALL } from "@/components/wms/kit";
import { useAuth } from "@/hooks/use-auth";
import type { Warehouse } from "@/lib/master-types";

/**
 * Filter gudang bersama untuk halaman daftar + form.
 *
 * Rantai resolusi (prioritas tertinggi dulu):
 *   1. Pilihan eksplisit user — disimpan per user di localStorage
 *      (`kg-wh-filter:<userId>`, bertahan setelah browser ditutup).
 *      Nilai "Semua" yang dipilih manual juga disimpan dan dihormati.
 *   2. Gudang default user (`user.default_warehouse_id` dari server).
 *   3. "Semua" (null) — user tanpa default / gudang sudah tidak ada.
 *
 * Aturan anti-konflik:
 * - Halaman DAFTAR boleh membaca + menulis (via `onChange` / `reset`).
 * - FORM hanya boleh MEMBACA (`warehouseId`) untuk inisialisasi kolom Gudang —
 *   perubahan di form tidak boleh menulis balik ke session.
 * - `reset()` menghapus pilihan tersimpan (= kembali ke rantai default),
 *   dipakai oleh tombol "Hapus Filter".
 */
export function useWarehouseFilter(
  warehouses: ReadonlyArray<Pick<Warehouse, "id" | "name">> | undefined,
) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Pilihan tersimpan: undefined = belum dimuat / tidak ada key yang usable,
  // { kind: "all" } = "Semua" eksplisit, { kind: "id", id } = gudang pilihan.
  const [stored, setStored] = useState<{ kind: "all" } | { kind: "id"; id: number } | undefined>(
    undefined,
  );

  // Muat pilihan tersimpan setiap kali user (id) tersedia/berganti.
  useEffect(() => {
    if (typeof window === "undefined" || userId == null) return;
    setStored(readStored(userId));
  }, [userId]);

  // Sinkron antar-tab: perubahan di tab lain ikut berlaku di tab ini.
  useEffect(() => {
    if (typeof window === "undefined" || userId == null) return;
    const key = keyFor(userId);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setStored(parseStored(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  const list = warehouses;

  // Id yang valid (masih ada di daftar gudang) atau null.
  const validDefaultId = useMemoValidId(list, user?.default_warehouse_id ?? null);
  const validStoredId = useMemoValidId(
    list,
    stored !== undefined && stored.kind === "id" ? stored.id : null,
  );

  // Selama daftar gudang belum dimuat, belum bisa resolve nama/id —
  // tahan di "Semua" agar perilaku sama seperti sebelum fitur ini
  // (query jalan tanpa filter dulu, lalu menyempit setelah data siap).
  // Id yatim (tersimpan tapi tak ada di daftar) dianggap tak ada → default.
  const warehouseId =
    list === undefined
      ? null
      : stored !== undefined && stored.kind === "all"
        ? null
        : validStoredId !== null
          ? validStoredId
          : validDefaultId;
  const warehouseName =
    list === undefined || warehouseId == null
      ? null
      : (list.find((w) => w.id === warehouseId)?.name ?? null);

  const onChange = useCallback(
    (v: string) => {
      if (userId == null || typeof window === "undefined") return;
      if (v === ALL) {
        try {
          window.localStorage.setItem(keyFor(userId), STORED_ALL);
        } catch {
          /* abaikan — filter tetap berlaku untuk sesi ini */
        }
        setStored({ kind: "all" });
        return;
      }
      const id = list?.find((w) => w.name === v)?.id ?? null;
      // Nama tidak dikenal → abaikan (jangan simpan sampah).
      if (id == null) return;
      try {
        window.localStorage.setItem(keyFor(userId), String(id));
      } catch {
        /* abaikan — filter tetap berlaku untuk sesi ini */
      }
      setStored({ kind: "id", id });
    },
    [list, userId],
  );

  const reset = useCallback(() => {
    if (typeof window !== "undefined" && userId != null) {
      try {
        window.localStorage.removeItem(keyFor(userId));
      } catch {
        /* abaikan */
      }
    }
    // Kembali ke rantai default: hapus simpanan + state (resolve ulang
    // otomatis dari default; bila daftar belum dimuat, tetap "Semua" dulu).
    setStored(undefined);
  }, [userId]);

  return {
    /** Nama gudang untuk FilterSelect + filter client-side, atau ALL ("Semua"). */
    value: warehouseName ?? ALL,
    /** Id gudang untuk query server + inisialisasi form, atau null ("Semua"). */
    warehouseId,
    /** Handler langsung untuk FilterSelect (`value`/`onChange`). */
    onChange,
    /** Hapus pilihan tersimpan → kembali ke rantai default. */
    reset,
  };
}

const STORED_ALL = "all";

function keyFor(userId: number): string {
  return `kg-wh-filter:${userId}`;
}

/** "all" → Semua eksplisit; angka valid → gudang pilihan; lainnya → tak ada. */
function parseStored(raw: string | null): { kind: "all" } | { kind: "id"; id: number } | undefined {
  if (raw == null) return undefined;
  if (raw === STORED_ALL) return { kind: "all" };
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? { kind: "id", id: n } : undefined;
}

function readStored(userId: number): { kind: "all" } | { kind: "id"; id: number } | undefined {
  try {
    return parseStored(window.localStorage.getItem(keyFor(userId)));
  } catch {
    return undefined;
  }
}

/** Kembalikan id bila ada di daftar, atau null (termasuk input null/undefined). */
function useMemoValidId(
  list: ReadonlyArray<Pick<Warehouse, "id" | "name">> | undefined,
  id: number | null,
): number | null {
  return useMemo(() => {
    if (list === undefined || id == null) return null;
    return list.some((w) => w.id === id) ? id : null;
  }, [list, id]);
}
