<?php

namespace App\Services\Ai;

use RuntimeException;

/**
 * Kegagalan panggilan penyedia AI (jaringan, HTTP non-2xx, respons tak valid).
 * Ditangkap di controller → 503 ramah ke user (jangan bocorkan detail vendor).
 */
class AiProviderException extends RuntimeException {}
