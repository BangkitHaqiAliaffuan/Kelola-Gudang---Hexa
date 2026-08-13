<?php

namespace App\Support;

use App\Models\ProcDoc;
use App\Models\ProcDocApproval;
use App\Models\RolePermission;
use App\Models\User;

/**
 * Approval engine untuk dokumen pengadaan (PR/PO) — single-level:
 * approver Level 1 = Kepala Departemen dari department_id dokumen,
 * dengan fallback ke user Pengadaan Kelola dan penegakan SoD
 * (approver tidak boleh requester). Penolakan bersifat terminal.
 */
class ApprovalEngine
{
    /**
     * Menentukan approver aktif (Level 1) untuk dokumen yang diajukan.
     * - Utama: kepala departemen (departments.head_user_id) bila aktif dan bukan requester.
     * - Fallback: user aktif pertama (by id) yang rolenya punya Pengadaan + Kelola, selain requester.
     * - Null bila tidak ada yang memenuhi → butuh penugasan manual.
     */
    public static function resolveApprover(ProcDoc $procDoc): ?int
    {
        if (! $procDoc->relationLoaded('department')) {
            $procDoc->load('department');
        }

        $requesterId = $procDoc->requester_user_id;
        $headId = $procDoc->department?->head_user_id;

        if ($headId !== null && $headId !== $requesterId) {
            $head = User::whereKey($headId)->where('is_active', true)->first();
            if ($head !== null) {
                return (int) $head->id;
            }
        }

        $kelolaRoles = RolePermission::where('module', 'Pengadaan')
            ->where('level', 'Kelola')
            ->pluck('role');

        $fallback = User::whereIn('role', $kelolaRoles)
            ->where('is_active', true)
            ->when($requesterId !== null, fn ($q) => $q->whereKeyNot($requesterId))
            ->orderBy('id')
            ->first();

        return $fallback?->id;
    }

    /**
     * Seed rekaman approval Level 1 (status Menunggu) saat submit.
     */
    public static function start(ProcDoc $procDoc): void
    {
        $approverId = self::resolveApprover($procDoc);

        ProcDocApproval::create([
            'proc_doc_id' => $procDoc->id,
            'level' => 1,
            'status' => 'Menunggu',
            'approver_user_id' => $approverId,
        ]);

        $procDoc->update(['approver_user_id' => $approverId]);
    }

    /**
     * Catat keputusan (Disetujui/Ditolak) pada Level 1 dan finalisasi dokumen.
     * Penolakan bersifat terminal.
     */
    public static function decide(ProcDoc $procDoc, int $userId, string $status, ?string $note): void
    {
        ProcDocApproval::where('proc_doc_id', $procDoc->id)
            ->where('level', 1)
            ->where('status', 'Menunggu')
            ->update([
                'status' => $status,
                'approver_user_id' => $userId,
                'decision_note' => $note,
                'decided_at' => now(),
            ]);

        $procDoc->update([
            'status' => $status === 'Disetujui' ? 'Disetujui' : 'Ditolak',
            'approver_user_id' => null,
            'approved_by' => $userId,
            'approved_at' => now(),
            'decision_note' => $note,
        ]);
    }

    /**
     * Apakah user berhak memutuskan dokumen: approver yang ditunjuk, atau
     * siapa pun dengan Pengadaan Kelola (override) — kecuali requester (SoD).
     */
    public static function canDecide(ProcDoc $procDoc, int $userId): bool
    {
        if ($procDoc->requester_user_id === $userId) {
            return false;
        }

        if ($procDoc->approver_user_id === $userId) {
            return true;
        }

        $user = User::find($userId);
        if ($user === null) {
            return false;
        }

        return RolePermission::where('role', $user->role)
            ->where('module', 'Pengadaan')
            ->where('level', 'Kelola')
            ->exists();
    }
}