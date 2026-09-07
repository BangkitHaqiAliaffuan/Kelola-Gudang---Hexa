<?php

namespace Tests\Unit;

use App\Support\TransaksiAnalytics;
use PHPUnit\Framework\TestCase;

class TransaksiAnalyticsTest extends TestCase
{
    public function test_pareto_menghitung_share_dan_kumulatif(): void
    {
        $out = TransaksiAnalytics::pareto([
            ['nama' => 'A', 'nilai' => 600],
            ['nama' => 'B', 'nilai' => 300],
            ['nama' => 'C', 'nilai' => 100],
        ], 'nilai', 1000);

        $this->assertSame(60.0, $out[0]['share']);
        $this->assertSame(60.0, $out[0]['share_kumulatif']);
        $this->assertSame(30.0, $out[1]['share']);
        $this->assertSame(90.0, $out[1]['share_kumulatif']);
        $this->assertSame(100.0, $out[2]['share_kumulatif']);
    }

    public function test_pareto_total_nol_aman(): void
    {
        $out = TransaksiAnalytics::pareto([['nama' => 'A', 'nilai' => 0]], 'nilai', 0);

        $this->assertSame(0, $out[0]['share']);
        $this->assertSame(0, $out[0]['share_kumulatif']);
    }

    public function test_mom_mendekomposisi_nilai_dan_qty(): void
    {
        $mom = TransaksiAnalytics::mom([
            ['bulan' => '2026-06', 'qty' => 10, 'nilai' => 1000],
            ['bulan' => '2026-07', 'qty' => 20, 'nilai' => 1500],
        ]);

        $this->assertSame('2026-07', $mom['bulan']);
        $this->assertSame(50.0, $mom['pct']);
        $this->assertSame(100.0, $mom['qty_pct']);
    }

    public function test_mom_butuh_dua_bulan(): void
    {
        $this->assertNull(TransaksiAnalytics::mom([['bulan' => '2026-07', 'qty' => 1, 'nilai' => 1]]));
        $this->assertNull(TransaksiAnalytics::mom([]));
    }

    public function test_parse_alasan(): void
    {
        $this->assertSame('Cacat', TransaksiAnalytics::parseAlasan("Alasan: Cacat\nPecah di jalan"));
        $this->assertSame('Kelebihan Kirim', TransaksiAnalytics::parseAlasan('Alasan: Kelebihan Kirim'));
        $this->assertSame('Tanpa Alasan', TransaksiAnalytics::parseAlasan('Catatan bebas tanpa prefix'));
        $this->assertSame('Tanpa Alasan', TransaksiAnalytics::parseAlasan(null));
    }

    public function test_aging_bucket(): void
    {
        $this->assertSame('0-7 hari', TransaksiAnalytics::agingBucket(0));
        $this->assertSame('0-7 hari', TransaksiAnalytics::agingBucket(7));
        $this->assertSame('8-30 hari', TransaksiAnalytics::agingBucket(8));
        $this->assertSame('8-30 hari', TransaksiAnalytics::agingBucket(30));
        $this->assertSame('>30 hari', TransaksiAnalytics::agingBucket(31));
    }

    public function test_pihak_key(): void
    {
        $this->assertSame('supplier|12|PT A', TransaksiAnalytics::pihakKey('supplier', 12, 'PT A'));
        $this->assertSame('lainnya|null|—', TransaksiAnalytics::pihakKey('lainnya', null, '—'));
    }
}
