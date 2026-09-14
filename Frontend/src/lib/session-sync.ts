/**
 * Jembatan resync sesi.
 *
 * Peta `access` di AuthSession adalah snapshot saat login/boot (`me()`) dan
 * bisa basi setelah matriks hak akses role diubah (lihat RoleController@update
 * — delete + reinsert wholesale). Akibat basi: UI ter-gate dari map lama tetap
 * tampil, query-nya 403 di backend, lalu toast global "Akses ditolak…".
 *
 * QueryCache (router.tsx) hidup di luar tree React sehingga tidak bisa memanggil
 * useAuth(); AuthProvider mendaftarkan handler refresh-nya ke sini.
 * File ini sengaja tanpa dependensi agar tidak circular import.
 */

/** True bila peta akses benar-benar berubah akibat refresh. */
export type SessionResyncHandler = () => Promise<boolean>;

let handler: SessionResyncHandler | null = null;

export function setResyncHandler(next: SessionResyncHandler | null): void {
  handler = next;
}

/**
 * Minta refresh sesi via GET /auth/me. Resolve false bila tidak ada handler
 * terdaftar (SSR/test) atau refresh gagal — pemanggil harus memperlakukannya
 * sebagai "tidak berubah": jangan me-retry query yang gagal.
 */
export function requestResync(): Promise<boolean> {
  if (!handler) return Promise.resolve(false);
  try {
    return Promise.resolve(handler()).then(
      (changed) => changed,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}
