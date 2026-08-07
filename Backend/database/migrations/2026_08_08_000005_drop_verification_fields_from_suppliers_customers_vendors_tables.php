<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn(['verification_status', 'verification_note', 'verified_at']);
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['verification_status', 'verification_note', 'verified_at']);
        });

        Schema::table('vendors', function (Blueprint $table) {
            $table->dropColumn(['verification_status', 'verification_note', 'verified_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('verification_status')->default('unverified')->after('bank_account_name');
            $table->string('verification_note')->nullable()->after('verification_status');
            $table->timestamp('verified_at')->nullable()->after('verification_note');
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->string('verification_status')->default('unverified')->after('bank_account_name');
            $table->string('verification_note')->nullable()->after('verification_status');
            $table->timestamp('verified_at')->nullable()->after('verification_note');
        });

        Schema::table('vendors', function (Blueprint $table) {
            $table->string('verification_status')->default('unverified')->after('bank_account_name');
            $table->string('verification_note')->nullable()->after('verification_status');
            $table->timestamp('verified_at')->nullable()->after('verification_note');
        });
    }
};
