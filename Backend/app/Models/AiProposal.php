<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Proposal aksi AI (F8.4). Siklus: pending → executed | rejected | expired
 * (via status transien 'executing' saat klaim atomik anti double-execute —
 * kembali ke pending bila gagal agar bisa dikoreksi).
 * Bind aksi persis (tool + payload + aktor + expiry) untuk anti-replay.
 */
class AiProposal extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_EXECUTING = 'executing'; // terklaim atomik, anti double-execute

    public const STATUS_EXECUTED = 'executed';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_EXPIRED = 'expired';

    protected $fillable = [
        'user_id',
        'status',
        'tool_name',
        'payload',
        'summary',
        'risk',
        'context',
        'result_document_id',
        'expires_at',
        'executed_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'context' => 'array',
            'expires_at' => 'datetime',
            'executed_at' => 'datetime',
            'result_document_id' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }
}
