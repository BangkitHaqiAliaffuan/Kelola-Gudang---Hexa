<?php

namespace App\Http\Controllers;

use App\Http\Requests\AuditLogIndexRequest;
use App\Http\Resources\AuditLogResource;
use App\Models\AuditLog;

class AuditLogController extends Controller
{
    public function index(AuditLogIndexRequest $request)
    {
        $data = $request->validated();

        $query = AuditLog::query()
            ->when($data['action'] ?? null, fn ($q, $v) => $q->where('action', $v))
            ->when($data['module'] ?? null, fn ($q, $v) => $q->where('module', $v))
            ->when($data['user_id'] ?? null, fn ($q, $v) => $q->where('user_id', $v))
            ->when($data['from'] ?? null, fn ($q, $v) => $q->where('occurred_at', '>=', $v))
            ->when($data['to'] ?? null, fn ($q, $v) => $q->where('occurred_at', '<=', $v.' 23:59:59'))
            ->when($data['search'] ?? null, function ($q, $v) {
                $needle = mb_strtolower($v);
                $q->where(function ($q) use ($needle) {
                    $q->whereRaw('LOWER(record_no) LIKE ?', ["%{$needle}%"])
                        ->orWhereRaw('LOWER(user_name) LIKE ?', ["%{$needle}%"])
                        ->orWhereRaw('LOWER(ip_address::text) LIKE ?', ["%{$needle}%"]);
                });
            })
            ->orderByDesc('occurred_at')
            ->orderByDesc('id');

        $logs = $query->paginate((int) ($data['per_page'] ?? 20));

        return AuditLogResource::collection($logs);
    }
}
