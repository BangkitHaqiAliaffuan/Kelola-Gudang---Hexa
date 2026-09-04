<?php

namespace App\Support;

/**
 * Helper agregasi murni untuk analitik laporan transaksi.
 *
 * TODO (dedupe follow-up): logika yang sama masih duplikat di
 * LaporanController::keluarAnalytics (sengaja tidak disentuh agar panel
 * Barang Keluar yang sudah stabil nol risiko regresi). Saat follow-up,
 * migrasikan keluarAnalytics memakai helper ini + pin dengan
 * LaporanKeluarAnalyticsTest yang sudah ada.
 */
class TransaksiAnalytics
{
    /**
     * Lengkapi baris agregat dengan share + share kumulatif (Pareto).
     * Input harus sudah terurut descending menurut $valueKey.
     *
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<int, array<string, mixed>>
     */
    public static function pareto(array $rows, string $valueKey, float $total): array
    {
        $kum = 0.0;

        return array_map(function ($r) use ($valueKey, $total, &$kum) {
            $v = (float) ($r[$valueKey] ?? 0);
            $kum = round($kum + $v, 2);
            $r['share'] = $total > 0 ? round($v / $total * 100, 1) : 0;
            $r['share_kumulatif'] = $total > 0 ? round($kum / $total * 100, 1) : 0;

            return $r;
        }, array_values($rows));
    }

    /**
     * Dekomposisi MoM dua bulan terakhir: pendorong volume (qty) vs nilai.
     *
     * @param  array<int, array{bulan: string, qty: int|float, nilai: int|float}>  $perBulan  terurut asc
     */
    public static function mom(array $perBulan): ?array
    {
        if (count($perBulan) < 2) {
            return null;
        }
        $last = $perBulan[count($perBulan) - 1];
        $prev = $perBulan[count($perBulan) - 2];

        return [
            'bulan' => $last['bulan'],
            'bulan_lalu' => $prev['bulan'],
            'nilai' => $last['nilai'],
            'nilai_lalu' => $prev['nilai'],
            'pct' => $prev['nilai'] > 0 ? round(($last['nilai'] - $prev['nilai']) / $prev['nilai'] * 100, 1) : null,
            'qty' => $last['qty'],
            'qty_lalu' => $prev['qty'],
            'qty_pct' => $prev['qty'] > 0 ? round(($last['qty'] - $prev['qty']) / $prev['qty'] * 100, 1) : null,
        ];
    }

    /**
     * Ambil alasan retur dari prefix deterministik "Alasan: X" di note
     * (ditulis form retur; lihat retur-penjualan-form / retur-pembelian-form).
     */
    public static function parseAlasan(?string $note): string
    {
        if ($note !== null && preg_match('/^Alasan:\s*([^\r\n;]+)/m', $note, $m)) {
            return trim($m[1]);
        }

        return 'Tanpa Alasan';
    }

    /**
     * Bucket aging dokumen tertahan (hari dihitung vs akhir periode).
     */
    public static function agingBucket(int $days): string
    {
        return $days <= 7 ? '0-7 hari' : ($days <= 30 ? '8-30 hari' : '>30 hari');
    }

    /**
     * Kunci identitas pihak agregat. Id null untuk klasifikasi tanpa FK
     * (mis. supplier via name-match memakai nama sebagai identitas tampilan;
     * id diisi bila cocok master).
     */
    public static function pihakKey(string $jenis, int|string|null $id, string $nama): string
    {
        return $jenis.'|'.($id ?? 'null').'|'.$nama;
    }
}
