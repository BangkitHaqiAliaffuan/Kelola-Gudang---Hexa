<?php

namespace Tests\Support;

use App\Services\Ai\AiProvider;
use App\Services\Ai\AiResponse;

/**
 * Provider palsu untuk test (tanpa jaringan). Skrip respons dikembalikan
 * berurutan per panggilan chat(); guardScore dikonfigurasi.
 */
class FakeAiProvider implements AiProvider
{
    /** @var array<int, AiResponse> */
    private array $responses;

    private int $cursor = 0;

    /** @var array<int, array{messages: array, tools: array, jsonMode: bool}> */
    public array $calls = [];

    public function __construct(array $responses = [], private ?float $guard = null, private bool $available = true)
    {
        $this->responses = $responses;
    }

    public function isAvailable(): bool
    {
        return $this->available;
    }

    public function chat(array $messages, array $tools = [], bool $jsonMode = false): AiResponse
    {
        $this->calls[] = ['messages' => $messages, 'tools' => $tools, 'jsonMode' => $jsonMode];
        $res = $this->responses[$this->cursor] ?? end($this->responses);
        $this->cursor++;

        return $res ?: new AiResponse('(kosong)', [], 'fake');
    }

    public function guardScore(string $text): ?float
    {
        return $this->guard;
    }

    public static function text(string $content, string $model = 'fake'): AiResponse
    {
        return new AiResponse($content, [], $model);
    }

    public static function withTools(array $calls, string $model = 'fake'): AiResponse
    {
        return new AiResponse(null, $calls, $model);
    }
}
