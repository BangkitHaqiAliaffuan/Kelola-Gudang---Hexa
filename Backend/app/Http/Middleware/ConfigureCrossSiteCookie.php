<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Symfony\Component\HttpFoundation\Response;

class ConfigureCrossSiteCookie
{
    private const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];

    public function handle(Request $request, Closure $next): Response
    {
        $originHost = strtolower((string) parse_url((string) $request->headers->get('origin', ''), PHP_URL_HOST));

        if ($originHost !== '' && in_array($originHost, self::remoteFrontendHosts(), true)) {
            config([
                'session.same_site' => 'none',
                'session.secure' => true,
            ]);
        }

        return $next($request);
    }

    /** Origins in config('cors.allowed_origins') that are not local loopback (e.g. the Vercel production origin). */
    private static function remoteFrontendHosts(): array
    {
        return Collection::make(config('cors.allowed_origins', []))
            ->map(fn (string $url): string => strtolower((string) parse_url(trim($url), PHP_URL_HOST)))
            ->filter(fn (string $host): bool => $host !== '' && ! in_array($host, self::LOOPBACK_HOSTS, true))
            ->unique()
            ->values()
            ->all();
    }
}
