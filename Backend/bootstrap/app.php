<?php

use App\Http\Middleware\EnsureRoleAccess;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role.access' => EnsureRoleAccess::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        // Jangan pernah membocorkan detail SQL/exception ke klien API —
        // frontend menampilkan `message` apa adanya di toast.
        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }
            if ($e instanceof QueryException) {
                report($e);

                // Detail asli tetap tercatat di storage/logs/laravel.log.
                return response()->json([
                    'message' => 'Terjadi kesalahan pada server. Silakan coba lagi atau hubungi administrator.',
                ], 500);
            }
            if (! $e instanceof HttpExceptionInterface
                && ! $e instanceof AuthenticationException
                && ! $e instanceof ValidationException) {
                report($e);
                if (! config('app.debug')) {
                    return response()->json([
                        'message' => 'Terjadi kesalahan pada server. Silakan coba lagi atau hubungi administrator.',
                    ], 500);
                }
            }

            return null;
        });
    })->create();
