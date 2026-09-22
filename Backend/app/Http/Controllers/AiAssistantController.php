<?php

namespace App\Http\Controllers;

use App\Http\Requests\ChatAiRequest;
use App\Models\AiProposal;
use App\Services\Ai\AiExecutor;
use App\Services\Ai\AiOrchestrator;
use App\Services\Ai\AiProvider;
use App\Services\Ai\AiProviderException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Endpoint AI Assistant (F8). Semua aksi memakai middleware yang sama dengan
 * API lain (auth:sanctum, user.active, scope.warehouse, role.access) sehingga
 * AI mewarisi izin user — tak pernah punya jalur istimewa.
 *
 * - POST /api/ai/chat    → usul rencana (TIDAK mengeksekusi apa pun).
 * - POST /api/ai/execute → eksekusi proposal terkonfirmasi (Draft-only).
 * - GET  /api/ai/proposals/{id} → status satu proposal.
 * - GET  /api/ai/status  → apakah AI aktif (untuk gate UI).
 */
class AiAssistantController extends Controller
{
    public function status(AiProvider $provider): JsonResponse
    {
        return response()->json([
            'data' => [
                'enabled' => (bool) config('ai.enabled'),
                'available' => $provider->isAvailable(),
                'provider' => config('ai.provider'),
                'daily_quota' => (int) config('ai.daily_quota'),
            ],
        ]);
    }

    public function chat(ChatAiRequest $request, AiOrchestrator $orchestrator): JsonResponse
    {
        // ChatAiRequest sudah menormalisasi riwayat (potong N turn × M
        // karakter) via prepareForValidation, jadi validated() selalu lolos
        // untuk input normal — tak ada lagi 422 panjang-riwayat.
        $data = $request->validated();

        try {
            $result = $orchestrator->chat($request->user(), $data['message'], $data['history'] ?? []);
        } catch (AiProviderException $e) {
            return $this->aiError($e);
        }

        return response()->json(['data' => $result]);
    }

    public function execute(Request $request, AiExecutor $executor): JsonResponse
    {
        $data = $request->validate([
            'proposal_id' => ['required', 'integer'],
            'corrections' => ['sometimes', 'array'],
        ]);

        try {
            $result = $executor->execute(
                $request->user(),
                (int) $data['proposal_id'],
                $data['corrections'] ?? null,
            );
        } catch (AiProviderException $e) {
            return $this->aiError($e);
        }

        return response()->json(['data' => $result]);
    }

    public function reject(Request $request): JsonResponse
    {
        $data = $request->validate(['proposal_id' => ['required', 'integer']]);

        $proposal = AiProposal::query()
            ->where('id', $data['proposal_id'])
            ->where('user_id', $request->user()->id)
            ->first();

        if ($proposal && $proposal->isPending()) {
            $proposal->update(['status' => AiProposal::STATUS_REJECTED]);
        }

        return response()->json(['data' => ['status' => 'rejected']]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $proposal = AiProposal::query()
            ->where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        return response()->json([
            'data' => [
                'id' => $proposal->id,
                'tool' => $proposal->tool_name,
                'status' => $proposal->status,
                'summary' => $proposal->summary,
                'payload' => $proposal->payload,
                'risk' => $proposal->risk,
                'expires_at' => $proposal->expires_at?->toIso8601String(),
                'executed_at' => $proposal->executed_at?->toIso8601String(),
                'result_document_id' => $proposal->result_document_id,
            ],
        ]);
    }

    /**
     * Normalisasi error AI: jangan bocorkan detail vendor; 503 bila provider
     * tak siap/kuota, 422 untuk kesalahan yang bisa dikoreksi user.
     */
    private function aiError(AiProviderException $e): JsonResponse
    {
        Log::info('AiAssistant: permintaan gagal.', ['message' => $e->getMessage()]);

        return response()->json(['message' => $e->getMessage()], 422);
    }
}
