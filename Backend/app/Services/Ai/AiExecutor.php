<?php

namespace App\Services\Ai;

use App\Models\AiProposal;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Eksekutor proposal AI TERKONFIRMASI (F8.4).
 *
 * Prinsip (permintaan: "user tetap konfirmasi & bisa mengoreksi"):
 * - HANYA proposal milik user ini, berstatus pending, belum kedaluwarsa.
 * - Eksekusi lewat ROUTE NYATA secara internal (dispatch HTTP ke
 *   /api/persediaan/stock-documents) dengan identitas user → RBAC, warehouse
 *   scope, FormRequest, state-machine, dan audit yang berlaku IDENTIK dengan
 *   request normal. AI tak punya jalur istimewa.
 * - Karena tulis selalu DRAFT, rollback = batalkan draft (aman).
 */
final class AiExecutor
{
    public function __construct(private readonly AiToolHandler $handler) {}

    /**
     * @param  array<string, mixed>|null  $corrections  Koreksi user atas payload usulan (opsional).
     * @return array<string, mixed>
     */
    public function execute(User $user, int $proposalId, ?array $corrections = null): array
    {
        $proposal = AiProposal::query()
            ->where('id', $proposalId)
            ->where('user_id', $user->id) // milik user ini saja
            ->first();

        if (! $proposal) {
            throw new AiProviderException('Proposal tidak ditemukan.');
        }

        if ($proposal->isExpired()) {
            $proposal->update(['status' => AiProposal::STATUS_EXPIRED]);
            throw new AiProviderException('Proposal kedaluwarsa. Buat usulan baru.');
        }

        // Klaim atomik: hanya SATU eksekusi yang lolos dari pending → executing.
        // Menutup balapan TOCTOU dua request konkuren (tanpa ini keduanya bisa
        // membuat dokumen ganda). Status executing juga anti-replay.
        $claimed = AiProposal::query()
            ->where('id', $proposal->id)
            ->where('user_id', $user->id)
            ->where('status', AiProposal::STATUS_PENDING)
            ->where('expires_at', '>', now())
            ->update(['status' => AiProposal::STATUS_EXECUTING, 'updated_at' => now()]);

        if ($claimed === 0) {
            throw new AiProviderException('Proposal sudah diproses.');
        }

        $proposal->refresh();

        $tool = ToolRegistry::find($proposal->tool_name);
        if (! $tool || $tool->readOnly) {
            $proposal->update(['status' => AiProposal::STATUS_PENDING]);
            throw new AiProviderException('Proposal tidak valid untuk dieksekusi.');
        }

        // Gabungkan koreksi user (kalau ada) — user boleh mengoreksi parameter.
        $payload = array_replace($proposal->payload, $corrections ?? []);

        try {
            $result = match ($tool->name) {
                'buat_draft_dokumen_stok' => $this->createStockDocument($user, $payload),
                default => throw new AiProviderException("Eksekusi tool '{$tool->name}' belum didukung."),
            };
        } catch (AiProviderException $e) {
            // Gagal (mis. validasi route) → kembalikan ke pending agar user
            // bisa koreksi dan coba lagi; bukan dead-end 'executing'.
            $proposal->update(['status' => AiProposal::STATUS_PENDING]);
            throw $e;
        }

        $proposal->update([
            'status' => AiProposal::STATUS_EXECUTED,
            'executed_at' => now(),
            'result_document_id' => $result['document_id'] ?? null,
        ]);

        AuditLogger::record([
            'action' => 'AiExecute',
            'module' => 'System',
            'auditable_type' => 'AiProposal',
            'record_no' => 'AI-Proposal:'.$proposal->id,
            'new_values' => [
                'tool' => $tool->name,
                'payload' => $payload,
                'result' => $result,
            ],
        ]);

        return $result;
    }

    /**
     * Jalankan pembuatan dokumen lewat route nyata (identitas user), sehingga
     * seluruh lapisan otorisasi/validasi/audit normal tetap berlaku.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function createStockDocument(User $user, array $payload): array
    {
        // Paksa Draft (v1) — pengaman ganda (orchestrator juga memaksa).
        $payload['status'] = 'Draft';
        unset($payload['_preview']);

        $request = Request::create('/api/persediaan/stock-documents', 'POST', $payload);
        $request->headers->set('Accept', 'application/json');

        $originalUser = auth()->user();
        auth()->setUser($user);
        $request->setUserResolver(fn () => $user);

        try {
            $response = app()->handle($request);
        } finally {
            if ($originalUser !== null) {
                auth()->setUser($originalUser);
            }
        }

        $status = $response->getStatusCode();
        $body = json_decode((string) $response->getContent(), true) ?: [];

        if ($status >= 400) {
            Log::warning('AiExecutor: pembuatan dokumen via route gagal.', ['status' => $status, 'body' => $body]);

            $message = $body['message'] ?? 'Gagal membuat dokumen.';
            // Sertakan error validasi pertama agar user bisa koreksi.
            if (! empty($body['errors']) && is_array($body['errors'])) {
                $first = reset($body['errors']);
                $message = is_array($first) ? (string) ($first[0] ?? $message) : (string) $first;
            }

            throw new AiProviderException($message);
        }

        $docId = $body['data']['id'] ?? null;
        $docNo = $body['data']['no'] ?? null;

        return [
            'document_id' => $docId,
            'no' => $docNo,
            'status' => 'Draft',
            'message' => $docNo
                ? "Draft dokumen {$docNo} berhasil dibuat. Silakan lanjutkan posting/approval secara manual."
                : 'Draft dokumen berhasil dibuat.',
        ];
    }
}
