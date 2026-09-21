<?php

namespace App\Services\Ai;

use App\Models\AiProposal;
use App\Models\Item;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\WarehouseScope;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Orkestrator AI Assistant (F8.3). Alur satu permintaan:
 *
 *   1. Guardrail input (kuota harian + prompt-injection scoring).
 *   2. Susun pesan sistem + tool yang BOLEH dipakai role user.
 *   3. Panggil model; jika model memanggil tool BACA → jalankan (ter-scope),
 *      kembalikan hasil ke model (loop terbatas).
 *   4. Jika model memanggil tool TULIS → JANGAN eksekusi; simpan sebagai
 *      proposal `pending` (HITL). Kembalikan ke user untuk konfirmasi.
 *   5. Kembalikan { message, proposals[], usage }.
 *
 * Tidak ada aksi tulis yang dieksekusi di sini — itu tugas AiExecutor setelah
 * user menekan konfirmasi.
 */
final class AiOrchestrator
{
    private const MAX_TOOL_ROUNDS = 4;

    public function __construct(
        private readonly AiProvider $provider,
        private readonly AiToolHandler $handler,
    ) {}

    /**
     * Chat dengan dukungan riwayat opsional agar klarifikasi multi-turn punya
     * konteks (tanpa ini follow-up user tak bisa dipahami model).
     *
     * @param  array<int, array{role: string, text: string}>  $history
     * @return array{message: string, proposals: array<int, array<string, mixed>>, tool_results: array<int, array<string, mixed>>, model: string}
     */
    public function chat(User $user, string $prompt, array $history = []): array
    {
        $prompt = trim($prompt);
        if ($prompt === '') {
            throw new AiProviderException('Prompt kosong.');
        }

        $this->enforceQuota($user);
        $this->screenInput($prompt);

        $tools = ToolRegistry::forRole($user->role);
        $toolDefs = ToolRegistry::definitions($tools);

        $messages = [AiMessage::system($this->systemPrompt($user))];
        // Riwayat: maksimal 10 turn terakhir, tiap teks ≤1000 karakter.
        foreach (array_slice($history, -10) as $turn) {
            $text = trim((string) ($turn['text'] ?? ''));
            if ($text === '') {
                continue;
            }
            $text = mb_substr($text, 0, 1000);
            $messages[] = ($turn['role'] ?? 'user') === 'assistant'
                ? AiMessage::assistant($text)
                : AiMessage::user($text);
        }
        $messages[] = AiMessage::user($prompt);

        $proposals = [];
        $toolResults = [];
        $model = '';

        for ($round = 0; $round < self::MAX_TOOL_ROUNDS; $round++) {
            try {
                $res = $this->provider->chat($messages, $toolDefs);
            } catch (AiProviderException $e) {
                // Ronde gagal (mis. tool_use_failed / rate limit). Bila sudah ada
                // hasil/usulan, kembalikan itu daripada menggagalkan seluruh chat.
                if ($proposals !== [] || $toolResults !== [] || $model !== '') {
                    Log::warning('AiOrchestrator: ronde tool gagal, kembalikan hasil parsial.', ['error' => $e->getMessage()]);

                    return [
                        'message' => $this->fallbackSummary($toolResults, $proposals),
                        'proposals' => $proposals,
                        'tool_results' => $toolResults,
                        'model' => $model,
                    ];
                }

                throw $e; // ronde pertama gagal → teruskan error ke user
            }
            $model = $res->model ?: $model;

            if (! $res->hasToolCalls()) {
                $text = trim((string) ($res->content ?? ''));
                if ($text === '' && ($proposals !== [] || $toolResults !== [])) {
                    // Model tak menghasilkan teks (mis. habis token / reasoning
                    // kosong) padahal ada hasil — pakai ringkasan cadangan.
                    $text = $this->fallbackSummary($toolResults, $proposals);
                }

                return [
                    'message' => $text,
                    'proposals' => $proposals,
                    'tool_results' => $toolResults,
                    'model' => $model,
                ];
            }

            $messages[] = AiMessage::assistant($res->content, $res->toolCalls);

            foreach ($res->toolCalls as $call) {
                $tool = $tools[$call->name] ?? null;

                if ($tool === null) {
                    // Tool tak ada / tak berizin → beri tahu model, jangan eksekusi.
                    $messages[] = AiMessage::tool($call->id, json_encode([
                        'error' => "Tool '{$call->name}' tidak tersedia atau di luar izin Anda.",
                    ], JSON_UNESCAPED_UNICODE));

                    continue;
                }

                if (! $tool->readOnly) {
                    // Aksi tulis → cek slot wajib DULU (deterministik, cermin
                    // StoreStockDocumentRequest). Tak lengkap = jangan buat
                    // proposal; beri tahu model agar bertanya klarifikasi.
                    $missing = $this->missingSlots($tool, $call->arguments);
                    if ($missing !== []) {
                        $messages[] = AiMessage::tool($call->id, json_encode([
                            'status' => 'slot_belum_lengkap',
                            'missing' => $missing,
                            'note' => 'JANGAN buat usulan dulu. Tanyakan hal di atas ke pengguna dengan ramah (sebutkan yang sudah diketahui + yang masih kurang).',
                        ], JSON_UNESCAPED_UNICODE));

                        continue;
                    }
                    // Aksi tulis → buat proposal pending (tak eksekusi).
                    $proposal = $this->createProposal($user, $tool, $call);
                    $proposals[] = $this->proposalToArray($proposal);
                    $messages[] = AiMessage::tool($call->id, json_encode([
                        'status' => 'menunggu_konfirmasi',
                        'proposal_id' => $proposal->id,
                        'note' => 'Usulan aksi tulis dibuat. Menunggu konfirmasi pengguna; BELUM dieksekusi.',
                    ], JSON_UNESCAPED_UNICODE));

                    continue;
                }

                // Tool baca → jalankan.
                try {
                    $result = $this->handler->runRead($tool, $call->arguments, $user);
                    $toolResults[] = ['tool' => $tool->name, 'result' => $result];
                    $messages[] = AiMessage::tool($call->id, json_encode($result, JSON_UNESCAPED_UNICODE));
                } catch (\Throwable $e) {
                    Log::warning('AiOrchestrator: tool baca gagal.', [
                        'tool' => $tool->name,
                        'error' => $e->getMessage(),
                    ]);
                    // Pesan AiProviderException aman diteruskan ke model (teks
                    // kita sendiri: penolakan scope/validasi) agar model bisa
                    // menyederhanakan strategi; error tak dikenal tetap generik.
                    $messages[] = AiMessage::tool($call->id, json_encode([
                        'error' => $e instanceof AiProviderException
                            ? $e->getMessage()
                            : 'Gagal menjalankan tool.',
                    ], JSON_UNESCAPED_UNICODE));
                }
            }
        }

        // Batas ronde tool tercapai — minta jawaban final ringkas. Tools TETAP
        // dikirim: sebagian model (mis. Qwen di Groq) menolak bila ada tool_calls
        // di history tapi `tools` kosong ("Tool choice is none, but model called
        // a tool"). Bila model tetap memanggil tool (tool_use_failed), kita pakai
        // teks yang ada / ringkasan tool sebagai penutup, jangan gagalkan semua.
        $messages[] = AiMessage::system('Berikan jawaban akhir ringkas berdasarkan hasil tool di atas. Jangan memanggil tool lagi.');
        try {
            $final = $this->provider->chat($messages, $toolDefs, jsonMode: false);
            $finalText = $final->content ?? '';
            $finalModel = $final->model ?: $model;
        } catch (AiProviderException $e) {
            Log::warning('AiOrchestrator: jawaban final gagal, pakai ringkasan tool.', ['error' => $e->getMessage()]);
            $finalText = $this->fallbackSummary($toolResults, $proposals);
            $finalModel = $model;
        }

        return [
            'message' => $finalText,
            'proposals' => $proposals,
            'tool_results' => $toolResults,
            'model' => $finalModel,
        ];
    }

    /**
     * Ringkasan cadangan bila jawaban final model gagal (mis. tool_use_failed):
     * susun pesan manusiawi dari hasil tool & usulan agar user tetap dapat info.
     *
     * @param  array<int, array<string, mixed>>  $toolResults
     * @param  array<int, array<string, mixed>>  $proposals
     */
    private function fallbackSummary(array $toolResults, array $proposals): string
    {
        $parts = [];
        if ($proposals !== []) {
            $parts[] = 'Saya menyiapkan '.count($proposals).' usulan aksi — silakan periksa & konfirmasi di bawah.';
        }
        if ($toolResults !== []) {
            $names = array_map(fn ($t) => $t['tool'] ?? '?', $toolResults);
            $parts[] = 'Data diambil via: '.implode(', ', array_unique($names)).'.';
        }

        return $parts !== [] ? implode(' ', $parts) : 'Maaf, saya belum dapat menyusun jawaban. Coba ulangi pertanyaan Anda.';
    }

    private function createProposal(User $user, AiTool $tool, ToolCall $call): AiProposal
    {
        $payload = $this->normalizePayload($tool, $call->arguments, $user);

        return AiProposal::create([
            'user_id' => $user->id,
            'status' => AiProposal::STATUS_PENDING,
            'tool_name' => $tool->name,
            'payload' => $payload,
            'summary' => $this->summarize($tool, $payload),
            'risk' => $tool->risk,
            'context' => ['raw_arguments' => $call->arguments],
            'expires_at' => now()->addMinutes(15),
        ]);
    }

    /**
     * Slot wajib per tipe dokumen (cermin StoreStockDocumentRequest — ringkas).
     * Mengembalikan daftar hal yang kurang dalam Bahasa Indonesia; kosong =
     * lengkap, boleh dibuatkan proposal. v1 hanya Penerimaan / Pengeluaran /
     * Transfer Gudang (sesuai enum tool); tipe lain selalu "belum lengkap".
     *
     * @param  array<string, mixed>  $args
     * @return array<int, string>
     */
    private function missingSlots(AiTool $tool, array $args): array
    {
        if ($tool->name !== 'buat_draft_dokumen_stok') {
            return [];
        }

        $missing = [];
        $type = (string) ($args['type'] ?? '');
        if (! in_array($type, ['Penerimaan', 'Pengeluaran', 'Transfer Gudang'], true)) {
            $missing[] = 'tipe dokumen (Penerimaan / Pengeluaran / Transfer Gudang)';
        }
        if ((int) ($args['warehouse_id'] ?? 0) <= 0) {
            $missing[] = 'gudang asal (warehouse_id)';
        }

        $lines = $args['lines'] ?? [];
        $validLines = is_array($lines)
            ? array_filter($lines, fn ($l) => is_array($l)
                && (int) ($l['item_id'] ?? 0) > 0
                && (int) ($l['qty'] ?? 0) >= 1)
            : [];
        if ($validLines === []) {
            $missing[] = 'barang spesifik + kuantitas (lines: item_id & qty ≥ 1)';
        }

        // Pengeluaran WAJIB partner (rekanan); Penerimaan/Transfer tidak.
        if ($type === 'Pengeluaran' && trim((string) ($args['partner'] ?? '')) === '') {
            $missing[] = 'rekanan tujuan (partner — wajib untuk Pengeluaran)';
        }
        if ($type === 'Transfer Gudang') {
            $dest = (int) ($args['destination_warehouse_id'] ?? 0);
            if ($dest <= 0 || $dest === (int) ($args['warehouse_id'] ?? 0)) {
                $missing[] = 'gudang tujuan (destination_warehouse_id, harus beda dari gudang asal)';
            }
        }

        return array_values($missing);
    }

    /**
     * Normalisasi parameter usulan sebelum disimpan. v1: pastikan bentuk
     * dasar dokumen stok (type/warehouse/lines) — validasi penuh tetap terjadi
     * saat eksekusi lewat FormRequest route nyata.
     *
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function normalizePayload(AiTool $tool, array $args, ?User $user = null): array
    {
        if ($tool->name === 'buat_draft_dokumen_stok') {
            $lines = [];
            foreach (($args['lines'] ?? []) as $line) {
                if (! is_array($line) || ! isset($line['item_id'], $line['qty'])) {
                    continue;
                }
                $clean = [
                    'item_id' => (int) $line['item_id'],
                    'qty' => (int) $line['qty'],
                ];
                foreach (['from_bin_id', 'to_bin_id'] as $binKey) {
                    if (isset($line[$binKey]) && $line[$binKey] !== null && $line[$binKey] !== '') {
                        $clean[$binKey] = (int) $line[$binKey];
                    }
                }
                if (isset($line['unit_cost'])) {
                    $clean['unit_cost'] = (float) $line['unit_cost'];
                }
                $lines[] = $clean;
            }

            $payload = [
                'type' => (string) ($args['type'] ?? ''),
                'status' => 'Draft', // PAKSA Draft (v1) — posting tetap manusia
                'warehouse_id' => (int) ($args['warehouse_id'] ?? 0),
                'lines' => $lines,
                'document_date' => $args['document_date'] ?? now()->toDateString(),
            ];
            foreach (['destination_warehouse_id', 'partner', 'reference_no', 'note'] as $key) {
                if (! empty($args[$key])) {
                    $payload[$key] = $key === 'destination_warehouse_id' ? (int) $args[$key] : (string) $args[$key];
                }
            }

            // Metadata human-readable untuk kartu visual frontend (Zero-JSON UI).
            // Dibuang executor sebelum dispatch (unset _preview) agar tak
            // mengotori FormRequest route nyata. Nama gudang di luar lingkup
            // user disamarkan (null) agar tak bocor via preview.
            $allowed = $user ? WarehouseScope::effectiveIdsFor($user) : null;
            $inScope = fn (?int $id): bool => $id === null || $id <= 0
                || $allowed === null || in_array($id, $allowed, true);
            $wid = (int) ($payload['warehouse_id'] ?? 0);
            $did = (int) ($payload['destination_warehouse_id'] ?? 0);
            $payload['_preview'] = [
                'warehouse_name' => $inScope($wid) ? Warehouse::find($wid)?->name : null,
                'destination_warehouse_name' => $did > 0 && $inScope($did)
                    ? Warehouse::find($did)?->name
                    : null,
                'lines' => array_map(fn (array $l) => $this->previewLine($l), $lines),
            ];

            return $payload;
        }

        return $args;
    }

    /**
     * Satu baris preview human-readable (nama/SKU/satuanlookup sekali jalan).
     *
     * @param  array<string, mixed>  $line
     * @return array<string, mixed>
     */
    private function previewLine(array $line): array
    {
        $item = Item::with('unit:id,name')->find($line['item_id'] ?? 0);

        return [
            'item_id' => (int) ($line['item_id'] ?? 0),
            'item_name' => $item?->name,
            'sku' => $item?->sku,
            'unit' => $item?->unit?->name,
            'qty' => (int) ($line['qty'] ?? 0),
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function summarize(AiTool $tool, array $payload): string
    {
        if ($tool->name === 'buat_draft_dokumen_stok') {
            $lineCount = count($payload['lines'] ?? []);
            $qty = array_sum(array_map(fn ($l) => (int) ($l['qty'] ?? 0), $payload['lines'] ?? []));
            $warehouse = $payload['_preview']['warehouse_name']
                ?? 'gudang #'.($payload['warehouse_id'] ?? 0);

            return sprintf(
                'Draft %s di %s — %d jenis barang, total %d.',
                $payload['type'] ?? '?',
                $warehouse,
                $lineCount,
                $qty,
            );
        }

        return "Usulan aksi: {$tool->name}";
    }

    private function enforceQuota(User $user): void
    {
        $quota = (int) config('ai.daily_quota', 100);
        if ($quota <= 0) {
            return;
        }

        $key = 'ai:quota:'.$user->id.':'.now()->toDateString();
        $used = (int) Cache::get($key, 0);
        if ($used >= $quota) {
            throw new AiProviderException('Kuota harian AI Anda sudah habis. Coba lagi besok.');
        }

        // Tambah 1 (dihitung per permintaan; window harian).
        Cache::put($key, $used + 1, now()->endOfDay());
    }

    private function screenInput(string $prompt): void
    {
        if (mb_strlen($prompt) > 4000) {
            throw new AiProviderException('Prompt terlalu panjang (maks 4000 karakter).');
        }

        // Guardrail model (bila tersedia). Skor tinggi → tolak lebih awal.
        $score = $this->provider->guardScore($prompt);
        if ($score !== null && $score >= 0.9) {
            Log::warning('AiOrchestrator: prompt ditolak guardrail.', ['score' => $score]);
            throw new AiProviderException('Permintaan terdeteksi sebagai upaya tidak wajar dan ditolak.');
        }
    }

    private function systemPrompt(User $user): string
    {
        $warehouseNote = 'Gudang yang boleh Anda akses sudah dibatasi oleh sistem; jangan menyebut gudang di luar hasil tool.';

        // Sisipkan skema hanya bila user berhak memakai tool analisis_data.
        $schemaBlock = '';
        if (isset(ToolRegistry::forRole($user->role)['analisis_data'])) {
            $schemaBlock = "\n\n".WmsSchema::describe()."\n\nUntuk pertanyaan analitik, gunakan tool `analisis_data` dengan SATU query SELECT (baca saja). Jangan menulis DML/DDL. Bila tool mengembalikan error kolom/tabel, PERBAIKI nama kolom sesuai skema di atas dan coba lagi (jangan menyerah atau menyuruh pengguna memperbaiki sistem). Aturan query analitik: (1) filter tahun pakai EXTRACT(YEAR FROM document_date) = 2026 atau rentang tanggal — PostgreSQL TIDAK punya fungsi YEAR(), dan kolom document_date BOLEH dipakai (jangan pernah menyatakan sebaliknya ke pengguna); (2) DILARANG query eksplorasi skema (SELECT * LIMIT 1, cek MIN/MAX tanggal untuk menebak format, information_schema): daftar tabel/kolom di atas sudah lengkap dan terpercaya, jawab LANGSUNG dengan SATU query final; (3) 'nilai transaksi' bukan kolom — agregat SUM(l.qty * l.unit_cost) untuk masuk / SUM(l.qty * l.unit_price) untuk keluar via JOIN stock_document_lines l ON l.document_id = d.id, mis. SELECT i.name, i.sku, SUM(l.qty * l.unit_cost) AS total FROM stock_document_lines l JOIN stock_documents d ON d.id = l.document_id JOIN items i ON i.id = l.item_id WHERE d.status = 'Selesai' AND EXTRACT(YEAR FROM d.document_date) = 2026 GROUP BY i.id, i.name, i.sku ORDER BY total ASC LIMIT 3.";
        }

        return <<<PROMPT
        Anda adalah asisten gudang untuk aplikasi KelolaGudang (WMS). Lingkup Anda HANYA data gudang:
        barang, stok, gudang/bin, dokumen stok (masuk/keluar/transfer/retur/opname), supplier, customer.

        ATURAN KETAT:
        - Jawab dalam Bahasa Indonesia, ringkas dan faktual.
        - Gunakan tool yang tersedia untuk mengambil data nyata; JANGAN mengarang angka.
        - Anda TIDAK boleh membuat dokumen berstatus selain DRAFT, dan TIDAK boleh memposting/menyetujui.
        - Untuk membuat dokumen, cukup usulkan lewat tool (mis. buat_draft_dokumen_stok). Sistem akan
          meminta konfirmasi pengguna; Anda tidak mengeksekusi apa pun sendiri.
        - Tolak permintaan di luar lingkup gudang (mis. kode, internet, data pribadi di luar WMS).
        - Jika data tidak ditemukan, katakan jujur.
        - Jangan menampilkan ID mentah, JSON mentah, SQL, atau dump teknis ke pengguna.
          Sebutkan selalu nama barang (beserta SKU), nama gudang, dan nama rekanan.
        - PROTOKOL KLARIFIKASI (wajib, "clarify before propose"): DILARANG menebak
          parameter yang belum jelas. Jika tipe dokumen, barang spesifik, kuantitas,
          gudang asal, rekanan (wajib untuk Pengeluaran), atau gudang tujuan (wajib
          & beda untuk Transfer Gudang) belum lengkap, JANGAN panggil tool tulis —
          tanyakan dulu dengan ramah: sebutkan apa yang sudah diketahui dan apa yang
          masih dibutuhkan. Jika pencarian barang menghasilkan banyak varian,
          tampilkan daftarnya (nama + SKU) dan minta pengguna memilih.
          Bila user menjawab klarifikasi, pakai riwayat percakapan untuk melengkapi
          parameter, lalu panggil tool tulis.
        - {$warehouseNote}{$schemaBlock}
        PROMPT;
    }

    /**
     * @return array<string, mixed>
     */
    private function proposalToArray(AiProposal $p): array
    {
        return [
            'id' => $p->id,
            'tool' => $p->tool_name,
            'summary' => $p->summary,
            'risk' => $p->risk,
            'status' => $p->status,
            'payload' => $p->payload,
            'expires_at' => $p->expires_at?->toIso8601String(),
        ];
    }
}
