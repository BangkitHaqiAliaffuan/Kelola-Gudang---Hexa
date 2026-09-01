# Fix v2: Remaining Bugs di Guard pasca Commit `2e2e67f`

Commit `2e2e67f` benar secara struktural, namun ada **2 remaining bug path** yang mengakibatkan
warning masih bisa muncul sebagai false positive.

## Akar Masalah Tersisa

### Bug 1 — `isSavingRef` guard return SEBELUM update `prevServerHashRef` (L85)

```ts
// L85 — guard ini return TERLALU DINI
if (!isDocChange && (isSavingRef.current || update.isPending)) return;
// prevServerHashRef TIDAK DIUPDATE saat guard ini aktif
```

**Timeline yang menyebabkan false positive:**

| Step | Event | prevServerHashRef | Efek |
|---|---|---|---|
| t0 | Lines resolve (actual_qty=null) | `null` | effect: `!prevHash → return`, set prevHash=`H0`=`{"101":""}` |
| t1 | User ketik "5" → silentSave → `isSavingRef=true` | `H0` | — |
| t2 | onMutate → optimistic setQueryData → lines berubah | `H0` | effect: `isSavingRef=true → return EARLY` (prevHash TIDAK diupdate) |
| t3 | User ketik "6" | `H0` (stale!) | records={101:"6"} |
| t4 | onSuccess → setQueryData(server response: actual=5) → lines berubah, isSavingRef=false | `H0` (stale!) | effect fires: `prevHash=H0 ≠ hash=H1={"101":"5"}` → **hasDirty=true** (records="6"≠"5") → **WARN! 🔥** |

### Bug 2 — [onMutate](file:///D:/Kelola-Gudang---Hexa/Frontend/src/hooks/use-persediaan.ts#141-166) optimistic setQueryData tidak memajukan prevServerHashRef (terkait Bug 1)

`isSavingRef` di-set `true` di L259 (sebelum `update.mutate()`), tapi [onMutate](file:///D:/Kelola-Gudang---Hexa/Frontend/src/hooks/use-persediaan.ts#141-166) dalam hook juga
memanggil `setQueryData` secara optimistic yang memicu re-render. Karena `isSavingRef=true`, effect
return early → prevServerHashRef tetap stale.

## Fix

**Satu patch kecil di L85**: update prevServerHashRef bahkan saat guard aktif.

```diff
  // don't clobber while saving
+ // Selalu update prevServerHashRef agar tidak stale saat guard dilewati
+ if (!isDocChange) {
+   const _sr = Object.fromEntries(
+     lines.map((l) => [l.id, l.actual_qty != null ? String(l.actual_qty) : ""]),
+   );
+   prevServerHashRef.current = JSON.stringify(_sr);
+ }
  if (!isDocChange && (isSavingRef.current || update.isPending)) return;
```

Atau alternatif yang **lebih hemat** — cukup track hash di awal, sebelum guard:

```diff
  useEffect(() => {
    const isDocChange = prevLinesRef.current !== docId;
    prevLinesRef.current = docId;

+   // Selalu majukan prevServerHashRef, bahkan saat guard aktif — cegah stale hash
+   if (!isDocChange) {
+     const earlyServerRecords = Object.fromEntries(
+       lines.map((l) => [l.id, l.actual_qty != null ? String(l.actual_qty) : ""]),
+     );
+     prevServerHashRef.current = JSON.stringify(earlyServerRecords);
+   }

    // don't clobber while saving
    if (!isDocChange && (isSavingRef.current || update.isPending)) return;
```

### Mengapa ini benar?

Update `prevServerHashRef` **sebelum** guard early-return memastikan:
- Saat guard aktif (saving), baseline hash tetap up-to-date dengan server
- Saat guard false (save selesai) → effect lanjut ke path normal, tapi `prevServerHashRef` sudah set
  ke hash terbaru di awal → `prevHash === hash` (sama) → tidak warn ✅
- Jika server benar-benar berubah (remote edit), hash akan berbeda di run berikutnya setelah guard
  tidak aktif → warn muncul dengan benar ✅

> **Catatan:** `prevServerHashRef` sekarang di-set di DUA tempat:
> 1. Atas effect (sebelum guard) — untuk menjaga baseline tetap segar
> 2. L150 (path normal) — untuk set baseline pertama kali dan update di-path normal
>
> Ini duplikat tapi tidak berbahaya. Bisa dikonsolidasi: hapus L150 assignment,
> cukup set di atas saja, dan di blok `isDocChange` reset ke `null`.

### Alternatif bersih (konsolidasi penuh):

```ts
useEffect(() => {
  const isDocChange = prevLinesRef.current !== docId;
  prevLinesRef.current = docId;

  // Hitung hash server sekarang
  const serverRecords = Object.fromEntries(
    lines.map((l) => [l.id, l.actual_qty != null ? String(l.actual_qty) : ""]),
  );
  const hash = JSON.stringify(serverRecords);

  if (isDocChange) {
    prevServerHashRef.current = null; // reset baseline
    // ... merge local, toast.info, setRevealed, return
  }

  // Untuk same-doc: SELALU update prevHash, bahkan sebelum guard
  const prevHash = prevServerHashRef.current;
  prevServerHashRef.current = hash; // update di sini, sebelum guard

  // don't clobber while saving
  if (isSavingRef.current || update.isPending) return;

  if (!prevHash) return;

  const hasDirty = lines.some(
    (l) => (recordsRef.current[l.id] ?? "") !== (l.actual_qty != null ? String(l.actual_qty) : ""),
  );

  if (prevHash !== hash && hasDirty && lines.some((l) => l.actual_qty != null)) {
    toast.warning("Data diperbarui di perangkat lain — muat ulang untuk lihat?", {
      id: `opname-conflict-${docId}`,
    });
    return;
  }

  if (hasDirty) return;
  setRecords(serverRecords);
}, [docId, lines, storageKey, lastSentStorageKey, session?.status]);
```

Perbedaan kunci dari commit `2e2e67f`:
- `serverRecords` + `hash` dihitung **di bagian atas** effect, sebelum guard
- `prevServerHashRef.current = hash` juga di atas, sebelum guard
- Guard `isSavingRef` tidak lagi perlu `!isDocChange` prefix (isDocChange path sudah `return` di atasnya)

## File yang Diubah

#### [MODIFY] [opname-count-page.tsx](file:///D:/Kelola-Gudang---Hexa/Frontend/src/components/wms/opname/opname-count-page.tsx)

Refactor effect L80–170: pindahkan kalkulasi `serverRecords`/`hash` dan assignment `prevServerHashRef`
ke **sebelum** guard `isSavingRef`. Tidak ada perubahan di [use-persediaan.ts](file:///D:/Kelola-Gudang---Hexa/Frontend/src/hooks/use-persediaan.ts).

## Verification Plan

### Skenario wajib test manual:
1. Ketik "5" → onBlur trigger silentSave → selama saving ketik "6" → save selesai → **tidak ada warning** ✅
2. F5 dengan draft → query resolve → **hanya toast.info draft dipulihkan**, tidak ada toast warning ✅
3. F5 lagi → **tidak ada toast sama sekali** ✅
4. *(Opsional)* Simulasi: buka tab baru → update via API → reload tab pertama → **warning muncul 1x** ✅
