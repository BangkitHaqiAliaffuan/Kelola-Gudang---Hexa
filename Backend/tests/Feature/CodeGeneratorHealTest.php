<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Support\CodeGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * F5.3: jalur heal menghitung MAX sufiks numerik di SQL (1 baris agregat),
 * bukan pluck seluruh kolom + fold PHP. next() melompat ke max+1 agar
 * sekuens monotonik di atas nomor manual/legacy.
 */
class CodeGeneratorHealTest extends TestCase
{
    use RefreshDatabase;

    public function test_heal_jumps_over_manual_code_above_counter(): void
    {
        Category::create(['code' => 'KAT-002', 'name' => 'Manual Rendah']);
        Category::create(['code' => 'KAT-005', 'name' => 'Manual Tinggi']);

        $next = CodeGenerator::next(Category::class, 'KAT', 'code');

        $this->assertSame('KAT-006', $next);
        $this->assertSame(6, (int) DB::table('document_counters')
            ->where('scope', 'plain')->where('counter_key', 'KAT')->value('current_number'));
    }

    public function test_heal_uses_numeric_not_string_max_for_mixed_width(): void
    {
        Category::create(['code' => 'KAT-999', 'name' => 'Batas Lebar']);
        Category::create(['code' => 'KAT-1000', 'name' => 'Overflow']);

        $next = CodeGenerator::next(Category::class, 'KAT', 'code');

        // MAX string akan salah ('KAT-999' > 'KAT-1000'); MAX numerik → 1001.
        $this->assertSame('KAT-1001', $next);
    }
}
