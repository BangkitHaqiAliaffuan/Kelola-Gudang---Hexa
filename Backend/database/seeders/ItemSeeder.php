<?php

namespace Database\Seeders;

use App\Models\Bin;
use App\Models\Category;
use App\Models\Item;
use App\Models\Merk;
use App\Models\Rack;
use App\Models\SubCategory;
use App\Models\Supplier;
use App\Models\Unit;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;

class ItemSeeder extends Seeder
{
    public function run(): void
    {
        if (Item::where('sku', 'SKU-10001-001')->exists()) {
            return;
        }

        // Deterministic LCG PRNG (analog to the seeded approach in the frontend
        // wms-data.ts, but with different data and seed; PHP-safe 64-bit LCG).
        $state = 20260214;
        $rnd = static function () use (&$state): float {
            $state = ($state * 1664525 + 1013904223) & 0xFFFFFFFF;

            return $state / 4294967296.0;
        };
        $pick = static function (array $arr) use ($rnd) {
            return $arr[(int) floor($rnd() * count($arr))];
        };
        $int = static function (int $min, int $max) use ($rnd) {
            return (int) floor($rnd() * ($max - $min + 1)) + $min;
        };
        $ean13 = static function (string $digits): string {
            $sum = 0;
            foreach (str_split($digits) as $pos => $digit) {
                $sum += ((int) $digit) * (($pos % 2 === 0) ? 1 : 3);
            }

            return $digits.(string) ((10 - ($sum % 10)) % 10);
        };

        $prefixes = [
            'Resistor', 'Kapasitor', 'Sensor Suhu', 'Motor DC', 'Katup Bola',
            'Selang Udara', 'Mata Bor HSS', 'Ampelas', 'Oli Gir', 'Grease EP',
            'Kabel NYM', 'Saklar Seri', 'Fitting Kabel', 'Papan Partikel', 'Kayu Jati',
            'Kanvas Tenda', 'Sarung Tangan Nitril', 'Masker N95', 'Pembersih Lantai', 'Sabun Cuci',
            'Lem Epoksi', 'Thinner', 'Baut L', 'Mur Kunci', 'Multimeter Digital',
            'Jangka Sorong', 'Baterai Kering', 'Ban Dalam', 'Flange Besi', 'Pelat Baja',
            'Batang Aluminium', 'Pipa Galvanis', 'Meja Lipat', 'Rak Gantung', 'Tinta Sublimasi',
            'Kertas Duplex', 'Pensil Mekanik', 'Spidol Board', 'Penggaris Baja', 'Kabel Listrik',
            'Oli Mesin', 'Cat Dasar', 'Demineralizer', 'Kawat Las', 'Aki Kering',
        ];
        $suffixes = [
            '10K', '100uF', 'PT100', '24V', '1/2 inch', '3/4 inch', 'M6x20', 'M8x30',
            '1500W', '5 Meter', '50x50 cm', 'Type A', 'Industrial', 'Heavy Duty',
            'Premium', 'Grade 304', '1200x2400', '100ml', '1 Liter', '25kg',
        ];

        $categories = Category::orderBy('id')->get();
        $subByCategory = SubCategory::all()->groupBy('category_id');
        $merks = Merk::orderBy('id')->get();
        $units = Unit::orderBy('id')->get();
        $warehouses = Warehouse::orderBy('id')->get();
        $racks = Rack::orderBy('id')->get();
        $bins = Bin::orderBy('id')->get();
        $suppliers = Supplier::orderBy('id')->get();
        $statuses = ['Aktif', 'Aktif', 'Aktif', 'Nonaktif'];

        for ($i = 0; $i < 300; $i++) {
            $category = $categories[$i % $categories->count()];
            $subs = $subByCategory->get($category->id, collect());
            $sub = $subs->count() ? $subs->get($i % $subs->count()) : null;

            $cost = $int(2000, 4500000);
            $status = $pick($statuses);

            $warehouse = $warehouses[$i % $warehouses->count()];
            $racksOfWarehouse = $racks->where('warehouse_id', $warehouse->id)->values();
            $rack = $racksOfWarehouse[$i % $racksOfWarehouse->count()];
            $binsOfRack = $bins->where('rack_id', $rack->id)->values();
            $bin = $binsOfRack[$i % $binsOfRack->count()];

            Item::create([
                'sku' => 'SKU-'.(10001 + $i).'-'.str_pad((string) (1 + ($i % 9)), 3, '0', STR_PAD_LEFT),
                'barcode' => $ean13('899'.str_pad((string) (1000000 + $i * 7919), 9, '0', STR_PAD_LEFT)),
                'internal_barcode' => 'IB-'.str_pad((string) ($i + 1), 3, '0', STR_PAD_LEFT),
                'name' => $pick($prefixes).' '.$pick($suffixes),
                'category_id' => $category->id,
                'sub_category_id' => $sub?->id,
                'brand_id' => $merks[$i % $merks->count()]->id,
                'unit_id' => $units[$i % $units->count()]->id,
                'default_warehouse_id' => $warehouse->id,
                'default_rack_id' => $rack->id,
                'default_bin_id' => $bin->id,
                'preferred_supplier_id' => $suppliers[$i % $suppliers->count()]->id,
                'weight' => round(($rnd() * 48) + 0.05, 2),
                'dimension' => $int(5, 120).'x'.$int(5, 120).'x'.$int(1, 60).' cm',
                'cost' => $cost,
                'price' => round($cost * (1 + (($rnd() * 0.5) + 0.1)), 2),
                'min_stock' => $int(2, 60),
                'max_stock' => $int(80, 4000),
                'lead_time' => $int(1, 21),
                // Stock is derived from the movement ledger (StockMovementSeeder),
                // not seeded as a raw number — keeps it reconciliable with the stock card.
                'stock' => 0,
                'reserved' => 0,
                'status' => $status,
            ]);
        }
    }
}
