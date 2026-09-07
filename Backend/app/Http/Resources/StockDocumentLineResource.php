<?php

namespace App\Http\Resources;

use App\Models\StockDocumentLine;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

class StockDocumentLineResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // Hitung sisa retur untuk baris Penerimaan/Pengeluaran — dipakai FE Maks retur.
        $remainingQty = null;
        $returnedQty = null;
        if ($this->qty !== null && $this->qty > 0) {
            $returnedQty = (int) StockDocumentLine::where('source_line_id', $this->id)
                ->whereHas('document', fn ($q) => $q->where('type', 'Retur Pembelian')->where('status', '!=', 'Dibatalkan'))
                ->sum(DB::raw('ABS(qty)'));
            $remainingQty = max(0, (int) $this->qty - $returnedQty);
        } elseif ($this->qty !== null && $this->qty < 0) {
            $returnedQty = (int) StockDocumentLine::where('source_line_id', $this->id)
                ->whereHas('document', fn ($q) => $q->where('type', 'Retur Penjualan')->where('status', '!=', 'Dibatalkan'))
                ->sum(DB::raw('ABS(qty)'));
            $remainingQty = max(0, (int) abs($this->qty) - $returnedQty);
        }

        return [
            'id' => $this->id,
            'line_no' => $this->line_no,
            'item_id' => $this->item_id,
            'sku' => $this->whenLoaded('item', fn () => $this->item?->sku),
            'name' => $this->whenLoaded('item', fn () => $this->item?->name),
            'unit' => $this->whenLoaded('item', fn () => $this->item?->unit?->name),
            'qty' => $this->qty,
            'remaining_qty' => $remainingQty,
            'returned_qty' => $returnedQty,
            'system_qty' => $this->system_qty,
            'actual_qty' => $this->actual_qty,
            'variance' => $this->system_qty !== null && $this->actual_qty !== null
                ? (int) $this->actual_qty - (int) $this->system_qty
                : null,
            'direction' => $this->whenLoaded('movement', fn () => $this->movement?->direction),
            'from_bin_id' => $this->from_bin_id,
            'from_bin' => $this->whenLoaded('fromBin', fn () => $this->fromBin?->code),
            'from_rack' => $this->whenLoaded('fromBin.rack', fn () => $this->fromBin?->rack?->code),
            'to_bin_id' => $this->to_bin_id,
            'to_bin' => $this->whenLoaded('toBin', fn () => $this->toBin?->code),
            'to_rack' => $this->whenLoaded('toBin.rack', fn () => $this->toBin?->rack?->code),
            'source_line_id' => $this->source_line_id,
            'unit_cost' => $this->unit_cost,
            'unit_price' => $this->unit_price !== null ? (float) $this->unit_price : null,
            'unit_price_estimated' => (bool) $this->unit_price_estimated,
            'note' => $this->note,
            'reason_code' => $this->reason_code,
            'counted_by' => $this->whenLoaded('countedBy', fn () => $this->countedBy?->name),
            'counted_at' => $this->counted_at?->toIso8601String(),
        ];
    }
}
