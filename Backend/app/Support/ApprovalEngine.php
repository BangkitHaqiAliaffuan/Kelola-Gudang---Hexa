<?php

namespace App\Support;

use App\Models\ProcDoc;
use App\Models\ProcDocApproval;
use App\Models\RolePermission;
use App\Models\User;

/**
 * Approval engine untuk dokumen pengadaan (PR/PO) — single-level.
 * PR: approver = kepala departemen pemohon (departments.head_user_id,
 * user-based). PO: approver = user aktif ber-role yang punya modul 'Approval
 * Pengadaan' (diatur admin via Master → Role). User Pengadaan Kelola dapat
 * memutuskan sebagai override; requester tidak pernah boleh memutuskan (SoD).
 * Penolakan bersifat terminal.
 */
class ApprovalEngine
{
    public const APPROVAL_MODULE = 'Approval Pengadaan';

    /**
     * Apakah role memiliki modul 'Approval Pengadaan' (keberadaan modul dengan
     * level apa pun = boleh menyetujui).
     */
    public static function roleCanApprove(string $role): bool
    {
        return RolePermission::where('role', $role)
            ->where('module', self::APPROVAL_MODULE)
            ->exists();
    }

    /**
     * Menentukan approver aktif (Level 1) untuk dokumen yang diajukan.
     * - PR: kepala departemen pemohon (departments.head_user_id, user-based —
     *   bukan role). Null bila head kosong atau head === requester (SoD) →
     *   dokumen menunggu tanpa penugasan; hanya user Pengadaan Kelola yang
     *   dapat memutuskan.
     * - PO: user aktif pertama (by id) ber-role ber-modul 'Approval Pengadaan',
     *   selain requester. Null bila tidak ada yang memenuhi → butuh penugasan
     *   manual; user berhak memutuskan mana pun tetap bisa memutuskan.
     */
    public static function resolveApprover(ProcDoc $procDoc): ?int
    {
        $requesterId = $procDoc->requester_user_id;

        if ($procDoc->kind === 'PR') {
            $headId = $procDoc->department?->head_user_id;

            if ($headId === null || $headId === $requesterId) {
                return null;
            }

            return $headId;
        }

        $approvalRoles = RolePermission::where('module', self::APPROVAL_MODULE)
            ->pluck('role');

        $approver = User::whereIn('role', $approvalRoles)
            ->where('is_active', true)
            ->when($requesterId !== null, fn ($q) => $q->whereKeyNot($requesterId))
            ->orderBy('id')
            ->first();

        return $approver?->id;
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
     * Apakah user berhak memutuskan dokumen: approver yang ditugaskan
     * (approver_user_id — mencakup kepala departemen untuk PR), role ber-modul
     * 'Approval Pengadaan', atau siapa pun dengan Pengadaan Kelola (override) —
     * kecuali requester (SoD).
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

        if (self::roleCanApprove($user->role)) {
            return true;
        }

        return RolePermission::where('role', $user->role)
            ->where('module', 'Pengadaan')
            ->where('level', 'Kelola')
            ->exists();
    }
}
