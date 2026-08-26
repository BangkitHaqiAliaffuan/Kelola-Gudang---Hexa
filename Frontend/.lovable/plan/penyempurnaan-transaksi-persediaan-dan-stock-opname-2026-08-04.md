# Penyempurnaan Transaksi, Persediaan, dan Stock Opname

## 1. Detail transaksi lewat panel geser (slide-over)

- Komponen baru `TrxDetailSheet`: panel dari kanan, full height, lebar besar di desktop dan hampir penuh di mobile.
- Isi read-only: header (nomor, tanggal, jenis, status, gudang/tujuan, partner, referensi, PIC, catatan), tabel baris barang (barang, SKU, qty, unit, harga, subtotal), ringkasan total qty & nilai, timeline status.
- Tombol di panel: Cetak dan Edit (Edit menavigasi ke halaman form, bukan dialog).
- Dipakai di semua menu Transaksi: Barang Masuk, Barang Keluar, Transfer Gudang, Retur Pembelian, Retur Penjualan. Kolom Nomor menjadi link pembuka panel.

## 2. Form Tambah & Edit pindah ke halaman penuh

- Dialog form transaksi dihapus. Tombol "Buat ..." menavigasi ke halaman form.
- Rute baru:
  - `/transaksi/entri/$section` — form tambah
  - `/transaksi/entri/$section/$id` — form edit (memuat data transaksi terkait)
- Halaman form berisi header, tautan kembali ke daftar, seluruh field, tabel baris barang, dan aksi Simpan Draft / Cetak / Simpan pada bar bawah yang sticky.

## 3. Barang Keluar: tujuan produksi

- Pilihan Tujuan: Customer, Departemen, Produksi, Gudang Lain.
- Saat Produksi dipilih, tampil field Proyek dan Work Order (nomor WO, deskripsi, target selesai).
- Master baru Work Order ditambahkan (menu Master Data + dummy data: no WO, proyek, produk, qty target, tanggal mulai/selesai, status).
- Kolom "Tujuan" pada daftar Barang Keluar menampilkan proyek/WO untuk transaksi produksi.

## 4. Persediaan: kolom Unit di semua menu

- Stock Saat Ini: kolom Satuan setelah SKU; Qty/Reserved/Available/Min/Max tampil dengan satuannya di kartu mobile.
- Stock Minimum, Stock Adjustment, Mutasi Stock, Nilai Persediaan: tambahkan kolom Satuan.
- Kartu Stock: satuan ditampilkan pada kolom masuk/keluar/saldo.

## 5. Kartu Stock & Mutasi Stock: nomor bisa diklik

- Kolom Nomor pada Kartu Stock dan Mutasi Stock menjadi link yang membuka slide-over detail read-only yang sama seperti di Transaksi (lengkap dengan tombol Cetak).

## 6. Kartu Stock: pergerakan & nilai FIFO / Average / Max

- Panel ringkasan baru: saldo awal, total masuk, total keluar, saldo akhir (dengan satuan).
- Tiga kartu nilai persediaan: FIFO, Average, Maximum Cost — nilai saldo akhir dan harga rata-rata per metode.
- Tabel kartu stock mendapat kolom nilai sesuai metode terpilih (toggle FIFO/Average/Max) plus mini chart pergerakan saldo.

## 7. Stock Opname diringkas jadi 3 menu

- Menu: Jadwal, Proses, Laporan (Hasil dan Selisih dihapus dari navigasi).
- Jadwal: daftar rencana opname (tanggal, gudang, PIC, cakupan, status Dijadwalkan/Berjalan/Selesai) + aksi buat jadwal.
- Proses: daftar record opname, aktivitas mulai → pencatatan (scan + input qty fisik + selisih) → selesai, dengan progress bar.
- Laporan: summary per sesi opname (total item, tercatat, selisih plus/minus, nilai selisih) dan detail per barang.

## 8. Sembunyikan menu

- Peminjaman Barang dan Pengembalian Barang dihapus dari navigasi (rutenya tetap ada agar tautan lama tidak rusak).

## Catatan teknis

- Slide-over memakai komponen `sheet` (`side="right"`, tinggi penuh, konten scrollable).
- Rute form baru mengikuti konvensi TanStack: `src/routes/transaksi.entri.$section.tsx` dan `src/routes/transaksi.entri.$section.$id.tsx`, masing-masing dengan `head()` sendiri.
- Data Work Order dan detail opname ditambahkan ke `src/lib/wms-data.ts` sebagai dummy data; helper nilai FIFO/Average/Max memakai `valuationFactor` yang sudah ada.
- Semua tetap UI-only tanpa backend.
