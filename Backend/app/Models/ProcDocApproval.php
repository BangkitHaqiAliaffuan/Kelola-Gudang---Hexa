<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProcDocApproval extends Model
{
    use HasFactory;

    public const STATUSES = ['Menunggu', 'Disetujui', 'Ditolak'];

    protected $fillable = [
        'proc_doc_id',
        'level',
        'status',
        'approver_user_id',
        'decision_note',
        'decided_at',
    ];

    protected $casts = [
        'level' => 'integer',
        'decided_at' => 'datetime',
    ];

    public function procDoc(): BelongsTo
    {
        return $this->belongsTo(ProcDoc::class, 'proc_doc_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_user_id');
    }
}