<?php

namespace App\Services\Ai;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Penyedia AI yang berbicara protokol OpenAI-compatible (`/chat/completions`).
 *
 * Dipakai untuk BEBERAPA backend sekaligus, cukup via config:
 * - **Groq** (`https://api.groq.com/openai/v1`) — qwen/gpt-oss.
 * - **9Router** (`http://localhost:20128/v1`) — gateway lokal multi-provider
 *   dengan auto-fallback & kompresi token.
 * - **OpenRouter/Ollama/vLLM/LM Studio** — semuanya OpenAI-compatible.
 *
 * Fitur:
 * - Tool calling + JSON mode (OpenAI-style).
 * - Fallback otomatis ke `fallback_model` bila model utama gagal (429/5xx).
 * - Guardrail prompt-injection via model khusus (opsional).
 *
 * Semua kegagalan dinormalisasi ke AiProviderException; detail asli hanya
 * dilog (tidak bocor ke respons API — konsisten bootstrap/app.php).
 */
class OpenAiCompatibleProvider implements AiProvider
{
    public function __construct(
        private readonly ?string $apiKey,
        private readonly string $baseUrl,
        private readonly string $model,
        private readonly string $fallbackModel,
        private readonly ?string $guardModel,
        private readonly int $timeout,
    ) {}

    public function isAvailable(): bool
    {
        return $this->apiKey !== null && $this->apiKey !== '';
    }

    public function chat(array $messages, array $tools = [], bool $jsonMode = false): AiResponse
    {
        if (! $this->isAvailable()) {
            throw new AiProviderException('Kredensial penyedia AI belum diisi.');
        }

        $payload = [
            'messages' => array_map(fn (AiMessage $m) => $m->toArray(), $messages),
            'max_tokens' => (int) config('ai.max_tokens', 1024),
        ];

        if ($tools !== []) {
            $payload['tools'] = $tools;
            $payload['tool_choice'] = 'auto';
        }

        if ($jsonMode) {
            // Beberapa vendor (termasuk Groq) mensyaratkan kata "json" pada
            // pesan saat response_format=json_object — dijamin oleh caller.
            $payload['response_format'] = ['type' => 'json_object'];
        }

        // Coba model utama lalu fallback (bila berbeda) pada kegagalan tertentu.
        $models = array_values(array_unique(array_filter([$this->model, $this->fallbackModel])));
        $lastError = null;

        foreach ($models as $index => $model) {
            try {
                $response = $this->post('/chat/completions', ['model' => $model] + $payload);

                return $this->normalize($response, $model);
            } catch (AiProviderException $e) {
                $lastError = $e;
                $isLast = $index === count($models) - 1;
                if ($isLast) {
                    break;
                }
                Log::warning('AiProvider: model utama gagal, mencoba fallback.', [
                    'model' => $model,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        throw $lastError ?? new AiProviderException('Panggilan AI gagal.');
    }

    public function guardScore(string $text): ?float
    {
        if (! $this->isAvailable() || $this->guardModel === null || $this->guardModel === '') {
            return null;
        }

        try {
            $response = $this->post('/chat/completions', [
                'model' => $this->guardModel,
                'messages' => [['role' => 'user', 'content' => $text]],
                'max_tokens' => 16,
            ]);

            $content = $response->json('choices.0.message.content');
            if (! is_string($content)) {
                return null;
            }

            // Model guard mengembalikan satu angka (mis. "0.9995").
            return is_numeric(trim($content)) ? (float) trim($content) : null;
        } catch (\Throwable $e) {
            // Guardrail gagal bukan alasan menggagalkan seluruh alur; log & lanjut.
            Log::warning('AiProvider: guardrail gagal dijalankan.', ['error' => $e->getMessage()]);

            return null;
        }
    }

    /**
     * POST ke API; normalisasi error jaringan/HTTP ke AiProviderException.
     *
     * @param  array<string, mixed>  $body
     */
    private function post(string $path, array $body): Response
    {
        try {
            $response = Http::withToken((string) $this->apiKey)
                ->baseUrl(rtrim($this->baseUrl, '/'))
                ->timeout($this->timeout)
                ->acceptJson()
                ->asJson()
                ->post($path, $body);
        } catch (ConnectionException $e) {
            throw new AiProviderException('Gagal menghubungi penyedia AI.', previous: $e);
        }

        if ($response->failed()) {
            $status = $response->status();
            Log::warning('AiProvider: respons HTTP gagal.', [
                'status' => $status,
                'body' => mb_substr($response->body(), 0, 500),
            ]);

            if ($status === 429) {
                throw new AiProviderException('Penyedia AI sedang sibuk (batas laju tercapai). Coba lagi sesaat lagi.');
            }
            if ($status === 413) {
                throw new AiProviderException('Permintaan terlalu besar untuk diproses.');
            }

            throw new AiProviderException('Penyedia AI tidak dapat memproses permintaan (status '.$status.').');
        }

        return $response;
    }

    /**
     * Ubah respons OpenAI-compatible jadi AiResponse.
     */
    private function normalize(Response $response, string $model): AiResponse
    {
        $message = $response->json('choices.0.message');
        if (! is_array($message)) {
            throw new AiProviderException('Respons AI tidak memiliki struktur yang diharapkan.');
        }

        $toolCalls = [];
        foreach (($message['tool_calls'] ?? []) as $raw) {
            if (! is_array($raw) || ! isset($raw['function']['name'])) {
                continue;
            }
            $args = $raw['function']['arguments'] ?? [];
            // `arguments` bisa string JSON, objek, atau (jarang) array. Normalisasi
            // ke array ASOSIATIF saja; list/array dianggap kosong (lihat ToolCall).
            $decoded = is_string($args) ? json_decode($args, true) : $args;
            if (! is_array($decoded) || ($decoded !== [] && array_is_list($decoded))) {
                $decoded = [];
            }

            $toolCalls[] = new ToolCall(
                id: (string) ($raw['id'] ?? ''),
                name: (string) $raw['function']['name'],
                arguments: $decoded,
            );
        }

        $content = $message['content'] ?? null;

        return new AiResponse(
            content: is_string($content) ? $content : null,
            toolCalls: $toolCalls,
            model: (string) ($response->json('model') ?? $model),
            usage: (array) ($response->json('usage') ?? []),
        );
    }
}
