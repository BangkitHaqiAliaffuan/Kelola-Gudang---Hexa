<?php

namespace Tests\Unit;

use Database\Seeders\ScaleBenchmarkSeeder;
use PHPUnit\Framework\TestCase;

class ScaleBenchmarkSeederTest extends TestCase
{
    public function test_database_benchmark_diizinkan(): void
    {
        $this->assertTrue(ScaleBenchmarkSeeder::isBenchmarkDatabase('pgsql', 'kelolagudang_bench'));
        $this->assertTrue(ScaleBenchmarkSeeder::isBenchmarkDatabase('pgsql', 'kelolagudang_test'));
    }

    public function test_database_dev_ditolak(): void
    {
        $this->assertFalse(ScaleBenchmarkSeeder::isBenchmarkDatabase('pgsql', 'kelolagudang'));
    }

    public function test_driver_lain_ditolak(): void
    {
        $this->assertFalse(ScaleBenchmarkSeeder::isBenchmarkDatabase('sqlite', 'kelolagudang_test'));
        $this->assertFalse(ScaleBenchmarkSeeder::isBenchmarkDatabase('mysql', 'kelolagudang_test'));
    }

    public function test_nama_mirip_tapi_tidak_persis_ditolak(): void
    {
        $this->assertFalse(ScaleBenchmarkSeeder::isBenchmarkDatabase('pgsql', 'kelolagudang_test2'));
        $this->assertFalse(ScaleBenchmarkSeeder::isBenchmarkDatabase('pgsql', 'xkelolagudang_test'));
        $this->assertFalse(ScaleBenchmarkSeeder::isBenchmarkDatabase('pgsql', ''));
    }
}
