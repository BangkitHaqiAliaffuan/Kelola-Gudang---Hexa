# Fix: Guard Toast "Data diperbarui di perangkat lain" Loop Selamanya

Perbaikan bug di [opname-count-page.tsx](file:///D:/Kelola-Gudang---Hexa/Frontend/src/components/wms/opname/opname-count-page.tsx) di mana toast konflik remote muncul secara terus-menerus
(loop F5) akibat inkonsistensi format hash antara *reader* dan *writer*, serta logic `hasDirty`
yang tidak membedakan *local-unsynced* dari *remote-edit*.

## Akar Masalah

| Masalah | Lokasi | Dampak |
|---|---|---|
| **Hash mismatch**: reader pakai `JSON.stringify(serverRecords)` (object), writer pakai `JSON.stringify(payload.map(...))` (array) | L144 vs L238–244 | `lastSentRef === hash` aldrich never true → dedup mati |
| **`hasDirty` false positive**: `hash !== JSON.stringify(recordsRef.current)` deteksi lokal-unsynced bukan remote-edit | L151 | toast warn meski server tidak berubah |
| **`prevServerHashRef` tidak ada**: tidak ada baseline "hash server sebelumnya" → mustahil bedakan apakah server berubah antar render | — | loop sampai `silentSave.onSuccess` clear draft |
| **`setRevealed(false)` di `isDocChange`**: reset blind-reveal tiap F5 ke dokumen yang sama | L136 | user kehilangan state "Tampilkan Sistem" tiap reload |

## Proposed Changes

### [opname-count-page.tsx](file:///D:/Kelola-Gudang---Hexa/Frontend/src/components/wms/opname/opname-count-page.tsx)

#### [MODIFY] [opname-count-page.tsx](file:///D:/Kelola-Gudang---Hexa/Frontend/src/components/wms/opname/opname-count-page.tsx)

**Perubahan 1 — Tambah `prevServerHashRef` (L212, setelah `lastSentRef`)**

```diff
  const lastSentRef = useRef<string | null>(null);
+ const prevServerHashRef = useRef<string | null>(null);
```

`lastSentRef` tetap dipakai *hanya* oleh Writer (dedup PUT). `prevServerHashRef` adalah baseline
baru khusus untuk Reader agar bisa deteksi "server hash berubah antar render" (= remote edit).

---

**Perubahan 2 — Reset baseline saat doc berganti (L120, dalam blok `isDocChange`)**

```diff
  if (isDocChange) {
+   prevServerHashRef.current = null; // reset baseline untuk doc baru
    if (local && Object.keys(local).length > 0) {
```

Tanpa ini, baseline doc lama dipakai untuk doc baru → false detect.

---

**Perubahan 3 — Hapus `setRevealed(false)` + `removeItem revealed` di blok `isDocChange` (L136–140)**

```diff
      setRecords(merged);
      toast.info("Draft lokal dipulihkan — simpan untuk sinkron ke server");
    } else {
      setRecords(serverRecords);
    }
-   setRevealed(false);
-   try {
-     if (typeof window !== "undefined")
-       window.localStorage.removeItem(`kg-opname-revealed-${docId}`);
-   } catch {}
    return;
```

`revealed` sudah hydrate dari `kg-opname-revealed-${docId}` di `useState` initializer (L33–43).
Reset manual tidak diperlukan dan merusak persistensi blind-reveal saat hard reload ke doc yang sama.

---

**Perubahan 4 — Ganti guard "same doc" (L143–155) dengan logik `prevServerHashRef`**

```diff
- const hash = JSON.stringify(serverRecords);
- if (lastSentRef.current === hash) return;
- const hasDirty = lines.some(
-   (l) =>
-     (recordsRef.current[l.id] ?? "") !== (l.actual_qty != null ? String(l.actual_qty) : ""),
- );
- if (hasDirty) {
-   if (lines.some((l) => l.actual_qty != null) && hash !== JSON.stringify(recordsRef.current)) {
-     toast.warning("Data diperbarui di perangkat lain — muat ulang untuk lihat?");
-   }
-   return;
- }

+ const hash = JSON.stringify(serverRecords);
+ const prevHash = prevServerHashRef.current;
+ prevServerHashRef.current = hash; // selalu update setelah baca
+
+ if (!prevHash) return; // render pertama sejak mount/doc-change — belum ada baseline
+
+ const hasDirty = lines.some(
+   (l) =>
+     (recordsRef.current[l.id] ?? "") !== (l.actual_qty != null ? String(l.actual_qty) : ""),
+ );
+
+ // Remote edit: server hash berubah DAN user ada input local belum sinkron
+ if (prevHash !== hash && hasDirty && lines.some((l) => l.actual_qty != null)) {
+   toast.warning("Data diperbarui di perangkat lain — muat ulang untuk lihat?", {
+     id: `opname-conflict-${docId}`, // sonner dedup — tidak spam meski effect fire berulang
+   });
+   return; // preserve local
+ }
+
+ if (hasDirty) return; // local-unsynced tapi server TIDAK berubah — jangan overwrite, jangan warn
```

**Mengapa lebih baik**: kondisi `prevHash !== hash` hanya true bila server benar-benar mengirim
data berbeda antar dua render cycle. F5 ke dokumen yang sama = server hash sama = `prevHash === hash`
→ tidak warn.

---

### [use-persediaan.ts](file:///D:/Kelola-Gudang---Hexa/Frontend/src/hooks/use-persediaan.ts) — Tidak ada perubahan

[useUpdateStockDocument](file:///D:/Kelola-Gudang---Hexa/Frontend/src/hooks/use-persediaan.ts#136-180) (L136–178) sudah benar:
- [onMutate](file:///D:/Kelola-Gudang---Hexa/Frontend/src/hooks/use-persediaan.ts#141-166): optimistic `setQueryData` ✅
- [onError](file:///D:/Kelola-Gudang---Hexa/Frontend/src/components/wms/opname/opname-count-page.tsx#430-431): rollback ✅
- [onSuccess](file:///D:/Kelola-Gudang---Hexa/Frontend/src/hooks/use-persediaan.ts#195-196): `setQueryData(data)` tanpa invalidate detail ✅ (cegah kedipan)
- [onSettled](file:///D:/Kelola-Gudang---Hexa/Frontend/src/hooks/use-persediaan.ts#173-178): hanya invalidate `list` + `summary` ✅

## Skenario Test

| Skenario | Sebelum fix | Setelah fix |
|---|---|---|
| Ketik "5" → F5 sebelum debounce 1.5s fire | Loop toast warning selamanya | `prevHash=null` → `return`, tidak warn ✅ |
| F5 lagi (draft masih ada, server masih `""`) | Loop berlanjut | `prevHash=serverHash=hash` → equal → tidak warn ✅ |
| `onBlur` → `silentSave` berhasil → `setQueryData` | Warn lagi karena hash !== lastSent | `prevHash === newHash` (server akui nilai) → tidak warn ✅ |
| Perangkat lain ubah ke "7" → staleTime expire → refetch | (sama: loop) | `prevHash≠hash` + `hasDirty` → warn 1x (sonner dedup by id) ✅ |
| Non-Draft (Selesai) | Warn false positive | `local=null` (cleared L109–114) → `!hasDirty` → `setRecords(serverRecords)` ✅ |
| Blind count → F5 | Revealed reset ke false | `setRevealed(false)` dihapus → localStorage hydrate benar ✅ |

## Verification Plan

### Automated
- `npx tsc --noEmit` di `Frontend/` — tidak boleh ada error baru
- `npm test` — single spec `src/routes/index.spec.tsx` harus pass

### Manual
1. Buka halaman opname count, ketik angka pada satu baris
2. Hard reload sebelum debounce 1.5s → harus muncul **"Draft lokal dipulihkan"** tapi **TIDAK** muncul "Data diperbarui di perangkat lain"
3. F5 lagi → tidak ada toast sama sekali
4. Biarkan debounce fire (atau klik field lain untuk trigger onBlur) → silentSave berhasil → F5 → tidak ada toast
5. *(Simulasi remote edit)* Lewat API langsung update actual_qty → tunggu 30s staleTime expire / window focus refetch → harus muncul **1 toast** warning, tidak lebih
