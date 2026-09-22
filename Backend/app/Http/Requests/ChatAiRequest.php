<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validasi POST /api/ai/chat.
 *
 * Normalisasi dulu, tolak belakangan: riwayat klarifikasi multi-turn
 * dipotong ke N turn terakhir × M karakter per turn (selaras dengan
 * pemotongan AiOrchestrator) SEBELUM aturan dievaluasi, sehingga jawaban
 * AI yang panjang di turn lama tidak pernah meledak jadi 422
 * "history.*.text must not be greater than 1000 characters" — request
 * lolos, model tetap melihat riwayat yang sudah dipangkas.
 */
class ChatAiRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $history = $this->input('history');
        if (! is_array($history)) {
            return;
        }

        $maxTurns = (int) config('ai.history_max_turns', 10);
        $perTurn = (int) config('ai.history_per_turn', 1000);

        $trimmed = array_map(function ($turn) use ($perTurn) {
            if (! is_array($turn)) {
                return $turn;
            }

            return [
                'role' => $turn['role'] ?? null,
                'text' => array_key_exists('text', $turn) && $turn['text'] !== null
                    ? mb_substr(trim((string) $turn['text']), 0, $perTurn)
                    : null,
            ];
        }, array_slice(array_values($history), -$maxTurns));

        $this->merge(['history' => $trimmed]);
    }

    public function rules(): array
    {
        $maxTurns = (int) config('ai.history_max_turns', 10);
        $perTurn = (int) config('ai.history_per_turn', 1000);

        return [
            'message' => ['required', 'string', 'max:4000'],
            // Riwayat opsional agar klarifikasi multi-turn punya konteks.
            // Batas di sini hanya pengaman payload; input normal selalu
            // lolos karena prepareForValidation sudah memangkasnya.
            'history' => ['sometimes', 'array', 'max:'.$maxTurns],
            'history.*.role' => ['required_with:history', 'in:user,assistant'],
            'history.*.text' => ['required_with:history', 'string', 'max:'.$perTurn],
        ];
    }

    public function messages(): array
    {
        return [
            'message.required' => 'Pesan tidak boleh kosong.',
            'message.string' => 'Pesan harus berupa teks.',
            'message.max' => 'Pesan maksimal 4000 karakter.',
            'history.array' => 'Riwayat harus berupa daftar percakapan.',
            'history.max' => 'Riwayat maksimal :max turn terakhir.',
            'history.*.role.required_with' => 'Setiap turn riwayat wajib punya peran.',
            'history.*.role.in' => 'Peran riwayat harus user atau assistant.',
            'history.*.text.required_with' => 'Setiap turn riwayat wajib punya teks.',
            'history.*.text.string' => 'Teks riwayat harus berupa teks.',
            'history.*.text.max' => 'Teks riwayat maksimal :max karakter per turn.',
        ];
    }
}
