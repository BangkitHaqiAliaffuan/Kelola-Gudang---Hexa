<?php

namespace App\Services\Ai;

/**
 * Satu pesan dalam percakapan yang dikirim ke penyedia LLM.
 *
 * `role`: system | user | assistant | tool.
 * `toolCallId`/`toolCalls` dipakai untuk pertukaran tool-calling (OpenAI-style).
 *
 * @phpstan-type ToolCallArray array{id: string, name: string, arguments: array<string, mixed>}
 */
final class AiMessage
{
    /**
     * @param  array<int, ToolCall>  $toolCalls
     */
    public function __construct(
        public readonly string $role,
        public readonly ?string $content = null,
        public readonly ?string $toolCallId = null,
        public readonly array $toolCalls = [],
    ) {}

    public static function system(string $content): self
    {
        return new self('system', $content);
    }

    public static function user(string $content): self
    {
        return new self('user', $content);
    }

    public static function assistant(?string $content = null, array $toolCalls = []): self
    {
        return new self('assistant', $content, null, $toolCalls);
    }

    public static function tool(string $toolCallId, string $content): self
    {
        return new self('tool', $content, $toolCallId);
    }

    /**
     * Bentuk payload OpenAI-compatible untuk satu pesan.
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        $payload = ['role' => $this->role];

        if ($this->content !== null) {
            $payload['content'] = $this->content;
        }

        if ($this->toolCallId !== null) {
            $payload['tool_call_id'] = $this->toolCallId;
        }

        if ($this->toolCalls !== []) {
            $payload['tool_calls'] = array_map(
                fn (ToolCall $call) => $call->toArray(),
                $this->toolCalls
            );
        }

        return $payload;
    }
}
