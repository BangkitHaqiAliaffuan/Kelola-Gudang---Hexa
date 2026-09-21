<?php

namespace App\Services\Ai;

/**
 * Satu panggilan tool (function call) yang diusulkan model.
 *
 * `arguments` sudah di-decode dari JSON string; validasi bentuk per-tool
 * dilakukan di lapisan atas (ToolRegistry), bukan di sini.
 */
final class ToolCall
{
    /**
     * @param  array<string, mixed>  $arguments
     */
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly array $arguments,
    ) {}

    /**
     * Bentuk payload OpenAI-compatible.
     *
     * `arguments` HARUS string JSON berisi OBJEK (Groq menolak array:
     * "cannot unmarshal array into Go value of type map"). Bila arguments
     * kosong / list (bukan objek asosiatif), emit "{}".
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'type' => 'function',
            'function' => [
                'name' => $this->name,
                'arguments' => $this->encodedArguments(),
            ],
        ];
    }

    /**
     * String JSON objek (fallback "{}" bila bukan objek asosiatif).
     */
    public function encodedArguments(): string
    {
        $isObject = $this->arguments !== [] && array_is_list($this->arguments) === false;
        if ($this->arguments === []) {
            return '{}';
        }
        if (! $isObject) {
            // List/array bukan objek → bungkus sebagai objek "{}" agar sah.
            return '{}';
        }

        $json = json_encode($this->arguments, JSON_UNESCAPED_UNICODE);

        return $json === false ? '{}' : $json;
    }
}
