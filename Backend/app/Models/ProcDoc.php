<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProcDoc extends Model
{
    use HasFactory;

    public const KINDS = ['PR', 'PO', 'GR'];

    // PR lifecycle: Draft → Menunggu Approval → Disetujui | Ditolak; cancel dari Draft/Menunggu/Disetujui (selama belum dirujuk PO).
    public const PR_STATUSES = [
        'Draft',
        'Menunggu Approval',
        'Disetujui',
        'Ditolak',
        'Dibatalkan',
    ];

    // PO lifecycle: Draft → Menunggu Approval → Disetujui | Ditolak; cancel dari Draft/Menunggu/Disetujui.
    public const PO_STATUSES = [
        'Draft',
        'Menunggu Approval',
        'Disetujui',
        'Ditolak',
        'Dibatalkan',
    ];

    protected $fillable = [
        'no',
        'kind',
        'status',
        'document_date',
        'need_date',
        'requester_user_id',
        'department_id',
        'supplier_id',
        'warehouse_id',
        'source_proc_doc_id',
        'reference',
        'note',
        'submitted_at',
        'approver_user_id',
        'approved_by',
        'approved_at',
        'decision_note',
        'created_by',
    ];

    protected $casts = [
        'document_date' => 'datetime',
        'need_date' => 'date',
        'submitted_at' => 'datetime',
        'approved_at' => 'datetime',
    ];

    public function lines(): HasMany
    {
        return $this->hasMany(ProcDocLine::class, 'proc_doc_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_id');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class, 'department_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_user_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function activeApprover(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_user_id');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(ProcDocApproval::class, 'proc_doc_id')->orderBy('level');
    }

    public function sourceProcDoc(): BelongsTo
    {
        return $this->belongsTo(self::class, 'source_proc_doc_id');
    }

    public function sourceProcDocs(): HasMany
    {
        return $this->hasMany(self::class, 'source_proc_doc_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isDraft(): bool
    {
        return $this->status === 'Draft';
    }

    public function isPendingApproval(): bool
    {
        return $this->status === 'Menunggu Approval';
    }

    public function isApproved(): bool
    {
        return $this->status === 'Disetujui';
    }

    public function isLate(): bool
    {
        return $this->need_date !== null && $this->need_date->lt(now()->startOfDay());
    }

    public function lateDays(): int
    {
        if ($this->need_date === null) {
            return 0;
        }

        return max(0, (int) $this->need_date->diffInDays(now()->startOfDay()));
    }

    public static function statusesFor(?string $kind): array
    {
        return $kind === 'PO' ? self::PO_STATUSES : self::PR_STATUSES;
    }
}
