<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Registry role dinamis: nama role tidak lagi hardcoded di kode.
     * - Baris permission yang hilang = tidak ada akses (deny-by-default).
     * - `can_review` menggantikan pengecekan nama role 'Auditor' yang
     *   tersebar di controller (approve/review/force-unlock dokumen).
     */
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->string('description', 500)->nullable();
            $table->boolean('is_system')->default(false);
            $table->boolean('can_review')->default(false);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('roles');
    }
};
