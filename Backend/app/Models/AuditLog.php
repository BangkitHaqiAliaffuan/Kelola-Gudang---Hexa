<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    public const ACTIONS = [
        'Login',
        'Logout',
        'Create',
        'Update',
        'Delete',
        'Post',
        'Cancel',
        'Submit',
        'Approve',
        'Reject',
        'Reassign',
        'Force Unlock',
        'Export',
    ];

    protected $fillable = [
        'occurred_at',
        'user_id',
        'user_name',
        'role',
        'action',
        'module',
        'auditable_type',
        'auditable_id',
        'record_no',
        'old_values',
        'new_values',
        'ip_address',
        'user_agent',
        'batch_id',
    ];

    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
            'old_values' => 'array',
            'new_values' => 'array',
        ];
    }
}
