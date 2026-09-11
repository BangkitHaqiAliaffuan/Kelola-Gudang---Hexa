import { useCallback, useEffect, useState } from "react";

export type RowId = string | number;

export type RowSelection = {
  /** ID terpilih (selalu subset dari scope terakhir; dikosongkan saat resetKey berubah). */
  selected: RowId[];
  toggle: (id: RowId) => void;
  /** Pilih semua bila belum semua terpilih, kosongkan bila sudah semua. */
  toggleAll: (allIds: RowId[]) => void;
  clear: () => void;
};

/**
 * Seleksi baris tabel (checkbox) — primitif shared untuk tabel yang butuh aksi
 * atas baris terpilih (export/print terpilih di laporan, bulk-op di master).
 *
 * `resetKey` WAJIB berubah setiap scope berubah (filter/tipe/periode) agar ID
 * basi tidak bertahan lintas filter — cacat yang ada di pola lama halaman
 * barang. Panggil dengan string stabil, mis. JSON dari nilai filter.
 */
export function useRowSelection(resetKey: string): RowSelection {
  const [selected, setSelected] = useState<RowId[]>([]);

  useEffect(() => {
    setSelected([]);
  }, [resetKey]);

  const toggle = useCallback((id: RowId) => {
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }, []);

  const toggleAll = useCallback((allIds: RowId[]) => {
    setSelected((p) =>
      allIds.length > 0 && allIds.every((id) => p.includes(id)) ? [] : [...allIds],
    );
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  return { selected, toggle, toggleAll, clear };
}

/** Status header checkbox untuk scope ID tertentu. */
export function selectionState(
  selected: RowId[],
  allIds: RowId[],
): { all: boolean; some: boolean } {
  const all = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  return { all, some: selected.length > 0 && !all };
}
