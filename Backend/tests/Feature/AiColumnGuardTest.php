<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Services\Ai\AiProvider;
use App\Services\Ai\AiProviderException;
use App\Services\Ai\SqlReadOnlyExecutor;
use App\Services\Ai\ToolCall;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\FakeAiProvider;
use Tests\TestCase;

/**
 * F8.x — guard kolom deterministik: model yang mengarang nama kolom
 * (insiden prod: `d.document_type` padahal kolom asli `type`) DITOLAK
 * sebelum menyentuh DB beserta saran koreksi, sehingga ronde berikutnya
 * berhasil — tanpa opsi "menyerah" ke pengguna. Memakai FakeAiProvider
 * (tanpa jaringan); query benar dieksekusi sungguhan ke DB test.
 */
class AiColumnGuardTest extends TestCase
{
    use RefreshDatabase;

    private function analyst(): User
    {
        Role::firstOrCreate(['name' => 'Analis Tulis'], ['is_system' => true, 'warehouse_scope_mode' => 'Semua']);
        RolePermission::firstOrCreate(['role' => 'Analis Tulis', 'module' => 'Persediaan'], ['level' => 'Tulis']);
        RolePermission::firstOrCreate(['role' => 'Analis Tulis', 'module' => 'Laporan'], ['level' => 'Baca']);
        RolePermission::firstOrCreate(['role' => 'Analis Tulis', 'module' => 'AI Assistant'], ['level' => 'Baca']);

        return User::factory()->create(['role' => 'Analis Tulis', 'is_active' => true]);
    }

    private function bindProvider(FakeAiProvider $fake): void
    {
        $this->app->instance(AiProvider::class, $fake);
    }

    public function test_wrong_column_gets_correction_hint_then_retry_succeeds(): void
    {
        config(['ai.enabled' => true, 'ai.provider' => 'groq', 'ai.daily_quota' => 100]);

        $bad = "SELECT i.name, SUM(l.qty) AS total_qty FROM stock_document_lines l JOIN stock_documents d ON d.id = l.document_id JOIN items i ON i.id = l.item_id WHERE d.document_type = 'Pengeluaran' GROUP BY i.name ORDER BY total_qty DESC LIMIT 10";
        $good = str_replace('d.document_type', 'd.type', $bad);

        $fake = new FakeAiProvider([
            FakeAiProvider::withTools([new ToolCall('c1', 'analisis_data', ['sql' => $bad, 'penjelasan' => 'uji'])]),
            FakeAiProvider::withTools([new ToolCall('c2', 'analisis_data', ['sql' => $good, 'penjelasan' => 'uji'])]),
            FakeAiProvider::text('Analisis selesai.'),
        ]);
        $this->bindProvider($fake);

        $res = $this->actingAs($this->analyst(), 'sanctum')
            ->postJson('/api/ai/chat', ['message' => '10 barang paling sering keluar']);

        $res->assertOk()->assertJsonPath('data.message', 'Analisis selesai.');
        // 3 panggilan provider = kirim salah → terima koreksi → kirim benar
        // (bukan menyerah setelah 1 ronde gagal).
        $this->assertCount(3, $fake->calls);
        $this->assertDatabaseCount('ai_proposals', 0);
    }

    public function test_db_unknown_column_error_is_translated_safely(): void
    {
        // Lapisan cadangan: bila kolom lolos validator statis namun gagal di
        // DB (mis. ambiguitas), error 42703 diterjemahkan aman (tanpa SQL).
        $executor = new SqlReadOnlyExecutor;
        try {
            // `type` ambigu? Tidak — pakai kolom yang pasti tak ada di tabel
            // mana pun namun lolos cek telanjang multi-tabel (dilewati).
            $executor->run('SELECT bogus_col_xyz FROM items JOIN warehouses ON true LIMIT 1');
            $this->fail('Seharusnya melempar');
        } catch (AiProviderException $e) {
            $this->assertStringContainsString('bogus_col_xyz', $e->getMessage());
            $this->assertStringNotContainsString('SELECT', $e->getMessage());
        }
    }
}
