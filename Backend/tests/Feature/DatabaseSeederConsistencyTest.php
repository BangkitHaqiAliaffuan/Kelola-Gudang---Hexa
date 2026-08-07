<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Department;
use App\Models\Item;
use App\Models\Project;
use App\Models\Rack;
use App\Models\Supplier;
use App\Models\Vendor;
use App\Models\Warehouse;
use App\Models\WorkOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DatabaseSeederConsistencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeded_data_is_consistent_with_schema(): void
    {
        $this->seed();

        $this->assertMasterCounts();
        $this->assertNibUniqueAcrossEntities();
        $this->assertItemCodesUnique();
        $this->assertItemBarcodesAreValidEan13();
        $this->assertItemRelationshipsConsistent();
        $this->assertItemValuesValid();
        $this->assertWarehousesHaveStock();
        $this->assertRacksHaveBins();
        $this->assertWorkOrdersConsistent();
        $this->assertHeadPicsResolve();
    }

    private function assertMasterCounts(): void
    {
        $this->assertDatabaseCount('categories', 15);
        $this->assertDatabaseCount('sub_categories', 46);
        $this->assertDatabaseCount('merks', 12);
        $this->assertDatabaseCount('units', 9);
        $this->assertDatabaseCount('warehouses', 8);
        $this->assertDatabaseCount('racks', 32);
        $this->assertDatabaseCount('bins', 192);
        $this->assertDatabaseCount('suppliers', 20);
        $this->assertDatabaseCount('customers', 16);
        $this->assertDatabaseCount('vendors', 8);
        $this->assertDatabaseCount('users', 6);
        $this->assertDatabaseCount('departments', 6);
        $this->assertDatabaseCount('projects', 5);
        $this->assertDatabaseCount('work_orders', 24);
        $this->assertDatabaseCount('items', 300);
    }

    private function assertNibUniqueAcrossEntities(): void
    {
        $nibs = Supplier::pluck('nib')
            ->concat(Customer::pluck('nib'))
            ->concat(Vendor::pluck('nib'))
            ->filter();

        $this->assertSame(44, $nibs->count());
        $this->assertSame($nibs->count(), $nibs->unique()->count());
    }

    private function assertItemCodesUnique(): void
    {
        $this->assertSame(300, Item::pluck('sku')->unique()->count());
        $this->assertSame(300, Item::whereNotNull('barcode')->pluck('barcode')->unique()->count());
        $this->assertSame(300, Item::pluck('internal_barcode')->unique()->count());
    }

    private function assertItemBarcodesAreValidEan13(): void
    {
        foreach (Item::pluck('barcode') as $barcode) {
            $this->assertMatchesRegularExpression('/^\d{13}$/', (string) $barcode, "barcode {$barcode} bukan 13 digit EAN-13");

            $sum = 0;
            foreach (str_split(substr((string) $barcode, 0, 12)) as $pos => $digit) {
                $sum += (int) $digit * (($pos % 2 === 0) ? 1 : 3);
            }

            $check = (10 - ($sum % 10)) % 10;

            $this->assertSame((string) $check, substr((string) $barcode, 12), "digit cek EAN-13 salah untuk {$barcode}");
        }
    }

    private function assertItemRelationshipsConsistent(): void
    {
        $this->assertSame(0, Item::whereNull('category_id')->count());
        $this->assertSame(0, Item::whereNull('sub_category_id')->count());
        $this->assertSame(0, Item::whereNull('brand_id')->count());
        $this->assertSame(0, Item::whereNull('unit_id')->count());
        $this->assertSame(0, Item::whereNull('default_warehouse_id')->count());
        $this->assertSame(0, Item::whereNull('default_rack_id')->count());
        $this->assertSame(0, Item::whereNull('default_bin_id')->count());
        $this->assertSame(0, Item::whereNull('preferred_supplier_id')->count());

        $warehouseMismatch = Item::query()
            ->join('racks', 'racks.id', '=', 'items.default_rack_id')
            ->whereColumn('racks.warehouse_id', '!=', 'items.default_warehouse_id')
            ->count();
        $this->assertSame(0, $warehouseMismatch);

        $rackMismatch = Item::query()
            ->join('bins', 'bins.id', '=', 'items.default_bin_id')
            ->whereColumn('bins.rack_id', '!=', 'items.default_rack_id')
            ->count();
        $this->assertSame(0, $rackMismatch);
    }

    private function assertItemValuesValid(): void
    {
        $this->assertSame(0, Item::whereNotIn('status', ['Aktif', 'Nonaktif'])->count());
        $this->assertSame(0, Item::where('stock', '<', 0)->count());
        $this->assertSame(0, Item::whereColumn('reserved', '>', 'stock')->count());
        $this->assertSame(0, Item::whereNotNull('max_stock')->whereColumn('max_stock', '<', 'min_stock')->count());
    }

    private function assertWarehousesHaveStock(): void
    {
        $this->assertSame(0, Warehouse::whereDoesntHave('items')->count());
    }

    private function assertRacksHaveBins(): void
    {
        $this->assertSame(0, Rack::whereDoesntHave('bins')->count());
    }

    private function assertWorkOrdersConsistent(): void
    {
        $this->assertSame(0, WorkOrder::whereNull('project_id')->count());
        $this->assertSame(0, WorkOrder::whereNull('item_id')->count());
        $this->assertSame(0, WorkOrder::whereNull('unit_id')->count());
        $this->assertSame(0, WorkOrder::whereNull('pic_user_id')->count());
    }

    private function assertHeadPicsResolve(): void
    {
        $this->assertSame(0, Department::whereNull('head_user_id')->count());
        $this->assertSame(0, Project::whereNull('pic_user_id')->count());
    }
}
