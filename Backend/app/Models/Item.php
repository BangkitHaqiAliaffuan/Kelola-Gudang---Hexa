<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Item extends Model
{
    use HasFactory;

    protected $fillable = [
        'sku',
        'barcode',
        'internal_barcode',
        'name',
        'category_id',
        'sub_category_id',
        'brand_id',
        'unit_id',
        'preferred_supplier_id',
        'default_warehouse_id',
        'default_rack_id',
        'default_bin_id',
        'weight',
        'dimension',
        'cost',
        'price',
        'min_stock',
        'max_stock',
        'lead_time',
        'stock',
        'reserved',
        'status',
        'image_url',
    ];

    protected $casts = [
        'weight' => 'float',
        'cost' => 'float',
        'price' => 'float',
        'min_stock' => 'integer',
        'max_stock' => 'integer',
        'lead_time' => 'integer',
        'stock' => 'integer',
        'reserved' => 'integer',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function subCategory(): BelongsTo
    {
        return $this->belongsTo(SubCategory::class);
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Merk::class, 'brand_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'unit_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'default_warehouse_id');
    }
}
