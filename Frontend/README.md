# Kelola Gudang Pro

Buat sebuah aplikasi web responsive bernama <strong>Kelola</strong>Gudang.

Aplikasi ini merupakan sistem manajemen gudang (Warehouse Management System/WMS) yang bersifat generik, sehingga dapat digunakan untuk berbagai jenis usaha seperti distributor, toko, retail, manufaktur, kontraktor, bengkel, farmasi, percetakan, sparepart, makanan, elektronik, hingga UMKM.

Fokus saat ini hanya pada UI/UX.

Jangan membuat backend, database, authentication, API, ataupun logic bisnis yang sebenarnya. Gunakan dummy data yang realistis.

Design Style

Gunakan design system modern dengan karakter berikut:

 Premium

 Clean

 Elegant

 Soft

 Dinamis

 Profesional

 Enterprise SaaS

 Minimalis

 Mudah dipahami operator gudang

Tema warna:

 Sediakan pilihan beberapa pastel theme

 Sky Blue

 Mint

 Emerald

 Lavender

 Peach

 Soft Orange

 Slate

 Light Gray

Gunakan:

 rounded-xl

 shadow halus

 spacing lega

 icon konsisten

 card modern

 animasi ringan

 loading skeleton

 hover effect

 transition halus

Typography

 Inter

 Plus Jakarta Sans

 atau Manrope

Ukuran font nyaman untuk penggunaan harian operator gudang.

Layout

Responsive

Desktop:

 Sidebar kiri

 Header atas

 Workspace lebar

Tablet:

 Sidebar collapse

Mobile:

 Bottom navigation

 Floating action button

 Responsive table menjadi card

Branding

Logo:

KelolaGudang

dimana tulisan Kelola menggunakan font bold, sedangkan Gudang regular.

Tambahkan icon warehouse minimalis.

Dashboard

Dashboard operator gudang harus dapat dipahami dalam beberapa detik.

Widget:

 Total Item

 Total SKU

 Total Gudang

 Barang Masuk Hari Ini

 Barang Keluar Hari Ini

 Stock Menipis

 Stock Habis

 Nilai Persediaan

 Pending Approval

 Stock Opname Berjalan

Grafik:

 Barang Masuk per Bulan

 Barang Keluar per Bulan

 Pergerakan Stock

 Nilai Persediaan

Activity Timeline

 Barang masuk

 Barang keluar

 Penyesuaian stok

 Transfer gudang

 Stock opname

Quick Action

 Barang Masuk

 Barang Keluar

 Transfer

 Stock Opname

 Cetak Barcode

 Tambah Barang

Sidebar Menu

Dashboard

Master Data

 Barang

 Kategori

 Sub Kategori

 Merk

 Satuan

 Gudang

 Rak

 Bin Location

 Supplier

 Customer

 Vendor

 Departemen

 Proyek

 User

 Role

Persediaan

 Stock Saat Ini

 Kartu Stock

 Mutasi Stock

 Stock Minimum

 Stock Adjustment

 Nilai Persediaan

Transaksi

 Barang Masuk

 Barang Keluar

 Transfer Gudang

 Retur Pembelian

 Retur Penjualan

 Peminjaman Barang

 Pengembalian Barang

Stock Opname

 Jadwal

 Proses

 Hasil

 Selisih

Barcode

 Generate Barcode

 Generate QR Code

 Print Label

Laporan

 Stock

 Barang Masuk

 Barang Keluar

 Mutasi

 Kartu Stock

 Nilai Persediaan

 Stock Minimum

 Stock Opname

 Barang Tidak Bergerak (Dead Stock)

 Fast Moving Item

Pengaturan

Master Barang

Halaman data barang modern.

Table:

 Foto

 SKU

 Barcode

 Nama Barang

 Kategori

 Merk

 Gudang Default

 Stock

 Satuan

 Harga Pokok

 Harga Jual

 Status

Filter:

 Gudang

 Kategori

 Merk

 Supplier

 Stock

 Status

Search

Bulk Action

Export

Import

Detail Barang

Tab:

Informasi

Stock

Kartu Stock

Barcode

Riwayat

Lampiran

Informasi:

 SKU

 Barcode

 QR Code

 Nama

 Merk

 Kategori

 Supplier

 Satuan

 Berat

 Dimensi

 Minimum Stock

 Maximum Stock

 Lead Time

Preview foto besar.

Barang Masuk

Halaman transaksi modern.

Filter:

 Gudang

 Supplier

 Tanggal

 Status

Form:

Nomor Transaksi

Tanggal

Gudang

Supplier

Referensi

Catatan

Daftar Barang

Table:

Barcode

Nama

Qty

Satuan

Harga

Subtotal

Grand Total

Button:

Scan Barcode

Tambah Barang

Simpan Draft

Simpan

Cetak

Barang Keluar

Mirip Barang Masuk.

Tambahkan:

Tujuan

Customer

Departemen

Proyek

Keperluan

Transfer Gudang

Source Warehouse

Destination Warehouse

Daftar Barang

Qty

Status Transfer

Timeline

Stock Saat Ini

Table besar.

Kolom:

Barang

SKU

Gudang

Rak

Bin

Qty

Reserved

Available

Minimum

Maximum

Nilai Stock

Status

Gunakan badge warna.

Kartu Stock

Timeline modern.

Kolom:

Tanggal

Nomor

Jenis

Masuk

Keluar

Saldo

PIC

Catatan

Expandable detail.

Stock Opname

Dashboard kecil:

Sedang Berjalan

Belum Dicek

Sudah Dicek

Selisih

Progress Bar

Form opname:

Scan Barcode

Input Qty Fisik

Selisih otomatis

Status

Catatan

Nilai Persediaan

Buat halaman analisis.

Ringkasan:

Total Nilai Stock

Barang Termahal

Barang Murah

Dead Stock

Fast Moving

Sediakan pilihan metode perhitungan:

 FIFO

 Average

 Maximum Cost

Tampilkan perubahan tampilan nilai persediaan secara visual (dummy data) saat metode dipilih.

Barcode & QR Code

Halaman khusus.

Generate:

Barcode

QR Code

Preview Label

Ukuran label:

30x20

50x30

100x50

A4 Multiple

Button:

Generate

Download

Print

Reporting

Semua laporan memiliki:

Filter

Export Excel

Export PDF

Print

Chart

Summary Card

Search

Global Search di Header.

Dapat mencari:

Barang

SKU

Barcode

Supplier

Gudang

Nomor Transaksi

Notification

Notification Center.

Contoh:

Stock hampir habis

Barang masuk

Transfer selesai

Opname selesai

Approval

UI Components

Gunakan komponen reusable:

Cards

Modern Tables

Data Grid

Tabs

Accordion

Drawer

Modal

Popover

Toast

Badge

Avatar

Timeline

Progress

Charts

Kanban (untuk proses opname)

Stepper

Command Palette

Search Dialog

Empty State

Loading Skeleton

Pagination

UX

Operator gudang harus bisa:

 menemukan barang dalam beberapa detik

 melihat stok tanpa membuka banyak halaman

 membuat transaksi dengan langkah sesedikit mungkin

 nyaman digunakan sepanjang hari

 tidak merasa aplikasi rumit

 fokus pada pekerjaan operasional

Minimalkan jumlah klik.

Selalu tampilkan aksi utama pada area yang mudah dijangkau.

Responsive

Pastikan seluruh halaman:

 responsive

 mobile friendly

 tablet friendly

 desktop optimal

Table berubah menjadi card pada mobile.

Sidebar menjadi drawer.

Quick Action menjadi Floating Button.

Dummy Data

Isi seluruh halaman dengan data realistis:

 ±300 barang

 15 kategori

 8 gudang

 120 supplier

 40 customer

 2.000 transaksi

 barcode

 QR Code

 foto barang

 grafik

 laporan

 timeline

 aktivitas

Agar seluruh UI terlihat hidup dan siap dipresentasikan.

Goal

Hasil akhir harus terlihat seperti aplikasi Warehouse Management System kelas enterprise yang modern, premium, elegan, dan siap digunakan oleh operator gudang. Fokus utama adalah pengalaman pengguna yang cepat, efisien, intuitif, dan nyaman, dengan visual yang bersih serta konsisten di seluruh halaman. Seluruh implementasi saat ini hanya berupa UI menggunakan dummy data tanpa backend atau logika bisnis.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4c0a13a4-6399-40c5-a47d-aba717102fc6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
