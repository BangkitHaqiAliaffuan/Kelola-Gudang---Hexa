<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'code', 'role', 'default_warehouse_id', 'is_active'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public function defaultWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'default_warehouse_id');
    }

    /**
     * Gudang konkret user untuk role ber-mode 'Terbatas' (pivot
     * `user_warehouse`). Bukan default tampilan — itu `defaultWarehouse`.
     */
    public function warehouses(): BelongsToMany
    {
        return $this->belongsToMany(Warehouse::class, 'user_warehouse')->withTimestamps();
    }

    /**
     * Mode lingkup gudang dari registry role. Role tak terdaftar / nilai
     * asing → 'Semua' (W10: tidak memutus role lama; deny dijaga permission).
     */
    public function warehouseScopeMode(): string
    {
        $mode = $this->relationLoaded('roleRecord')
            ? $this->roleRecord?->warehouse_scope_mode
            : $this->roleRecord()->first()?->warehouse_scope_mode;

        return in_array($mode, Role::WAREHOUSE_SCOPES, true) ? $mode : 'Semua';
    }

    /**
     * Baris registry role (relasi via string `users.role` → `roles.name`;
     * tanpa FK database — lihat RoleController). Null bila role tidak
     * terdaftar (deny-by-default di semua gate).
     */
    public function roleRecord(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role', 'name');
    }

    /**
     * Pengganti pengecekan nama role 'Auditor' yang hardcoded:
     * hak me-review/approve dokumen persediaan + force-unlock.
     */
    public function canReview(): bool
    {
        return (bool) ($this->relationLoaded('roleRecord')
            ? $this->roleRecord?->can_review
            : $this->roleRecord()->first()?->can_review);
    }

    /**
     * Guard integritas akun Administrator (Fase keamanan F1).
     *
     * Dua aturan, berlaku untuk semua jalur (controller, tinker, command):
     * 1. Administrator AKTIF terakhir tidak boleh dihapus atau dicabut
     *    (role diubah / is_active dinonaktifkan) — mencegah lockout total.
     * 2. Sebuah user tidak boleh menghapus atau mengubah role/is_active
     *    akunnya SENDIRI (mutlak, tanpa pengecualian) — kejelasan audit.
     *
     * Guard di-skip saat tidak ada aktor terautentikasi (console/seeder) —
     * lihat justifikasi di masing-masing closure.
     */
    protected static function booted(): void
    {
        static::deleting(function (User $user) {
            self::guardSelfMutation($user, 'menghapus');
            self::guardLastAdministrator($user, 'Administrator terakhir tidak dapat dihapus. Angkat user lain menjadi Administrator terlebih dahulu.');
        });

        static::updating(function (User $user) {
            // Hanya relevan bila role/is_active berubah.
            $roleChanged = $user->isDirty('role');
            $activeChanged = $user->isDirty('is_active');
            if (! $roleChanged && ! $activeChanged) {
                return;
            }

            self::guardSelfMutation($user, 'mengubah peran/status');

            $losesAdmin = $roleChanged && $user->getOriginal('role') === 'Administrator' && $user->role !== 'Administrator';
            $deactivated = $activeChanged && $user->getOriginal('is_active') && ! $user->is_active;

            if ($losesAdmin || $deactivated) {
                self::guardLastAdministrator($user, 'Administrator terakhir tidak dapat dicabut perannya atau dinonaktifkan. Angkat user lain menjadi Administrator terlebih dahulu.');
            }
        });
    }

    /**
     * Larang user memutasi akunnya sendiri. Hanya berlaku saat ada aktor
     * terautentikasi (request HTTP) — pada console/seeder tidak ada "diri
     * sendiri" sehingga cek dilewati.
     */
    private static function guardSelfMutation(User $user, string $verb): void
    {
        $actorId = auth()->id();
        if ($actorId !== null && (int) $actorId === (int) $user->id) {
            throw ValidationException::withMessages([
                'user' => ["Anda tidak dapat {$verb} akun Anda sendiri."],
            ]);
        }
    }

    /**
     * Larang mutasi yang menyisakan nol Administrator aktif. Hanya berlaku
     * bila user yang dimutasi adalah Administrator aktif dan tidak ada
     * Administrator aktif lain — pada console/seeder (mis. seed pertama)
     * tidak ada admin lain, jadi kita hanya blokir bila minimal SATU admin
     * aktif lain belum ada DAN operasi dilakukan lewat request HTTP. Saat
     * console, guard dilewati agar seeding/bootstrap tidak terkunci.
     */
    private static function guardLastAdministrator(User $user, string $message): void
    {
        // Saat update, `role`/`is_active` sudah bernilai BARU di atribut model;
        // untuk kasus pencabutan gunakan nilai asli. Untuk delete, gunakan
        // nilai saat ini.
        $originalRole = $user->getOriginal('role') ?? $user->role;
        $currentlyAdmin = $user->role === 'Administrator' || $originalRole === 'Administrator';
        $active = (bool) ($user->getOriginal('is_active') ?? $user->is_active);

        if (! $currentlyAdmin || ! $active) {
            return;
        }

        // Console/seeder: tidak ada aktor HTTP; biarkan (bootstrap).
        if (auth()->id() === null && app()->runningInConsole()) {
            return;
        }

        $otherActiveAdmins = static::query()
            ->where('role', 'Administrator')
            ->where('is_active', true)
            ->whereKeyNot($user->getKey())
            ->exists();

        if (! $otherActiveAdmins) {
            throw ValidationException::withMessages(['user' => [$message]]);
        }
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'default_warehouse_id' => 'integer',
        ];
    }
}
