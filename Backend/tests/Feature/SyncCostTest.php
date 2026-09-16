<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SyncCostTest extends TestCase
{
    use RefreshDatabase;

    private function stockUp(Item $item, float $avg, int $stock = 10): void
    {
        $warehouse = Warehouse::factory()->create();

        ItemStock::query()->updateOrInsert(
            ['item_id' => $item->id, 'warehouse_id' => $warehouse->id, 'bin_id' => null],
            ['stock' => $stock, 'reserved' => 0, 'unit_cost_avg' => $avg, 'updated_at' => now()]
        );
    }

    public function test_sync_cost_updates_to_running_average(): void
    {
        $this->actingAsMasterAdmin();
        $item = Item::factory()->create([
            'category_id' => Category::factory()->create()->id,
            'cost' => 10000,
        ]);
        $this->stockUp($item, 15500.0);

        $response = $this->postJson('/api/master/items/sync-cost', ['ids' => [$item->id]]);

        $response->assertOk()->assertJsonPath('applied.0.item_id', $item->id);
        $this->assertSame(15500.0, (float) $item->fresh()->cost);
    }

    public function test_sync_cost_skips_zero_stock_and_noop_diff(): void
    {
        $this->actingAsMasterAdmin();
        $categoryId = Category::factory()->create()->id;

        $zeroStock = Item::factory()->create(['category_id' => $categoryId, 'cost' => 10000]);
        $this->stockUp($zeroStock, 20000.0, 0);

        $sameCost = Item::factory()->create(['category_id' => $categoryId, 'cost' => 15000]);
        $this->stockUp($sameCost, 15000.0);

        $response = $this->postJson('/api/master/items/sync-cost', [
            'ids' => [$zeroStock->id, $sameCost->id],
        ]);

        $response->assertOk()->assertJsonPath('applied', []);
        $this->assertSame(10000.0, (float) $zeroStock->fresh()->cost);
        $this->assertSame(15000.0, (float) $sameCost->fresh()->cost);
    }

    public function test_sync_cost_rejects_invalid_payload(): void
    {
        $this->actingAsMasterAdmin();

        $this->postJson('/api/master/items/sync-cost', [])->assertUnprocessable();
        $this->postJson('/api/master/items/sync-cost', ['ids' => [999999]])->assertUnprocessable();
    }

    public function test_sync_cost_forbids_non_entitled_user(): void
    {
        $user = User::factory()->create(['role' => 'Supervisor']);
        RolePermission::create(['role' => 'Supervisor', 'module' => 'Master Data', 'level' => 'Baca']);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/master/items/sync-cost', ['ids' => [1]])
            ->assertForbidden();
    }

    public function test_sync_cost_requires_authentication(): void
    {
        $this->postJson('/api/master/items/sync-cost', ['ids' => [1]])->assertUnauthorized();
    }
}
