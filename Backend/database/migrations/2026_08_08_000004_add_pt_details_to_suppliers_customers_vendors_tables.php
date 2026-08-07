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
            $table->renameColumn('tax_id', 'npwp');
        });

        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('legal_name')->nullable()->after('name');
            $table->string('nib', 13)->nullable()->after('legal_name');
            $table->string('pic_name')->nullable()->after('email');
            $table->string('website')->nullable()->after('pic_name');
            $table->string('bank_name')->nullable()->after('payment_terms');
            $table->string('bank_account_no')->nullable()->after('bank_name');
            $table->string('bank_account_name')->nullable()->after('bank_account_no');
            $table->string('verification_status')->default('unverified')->after('bank_account_name');
            $table->string('verification_note')->nullable()->after('verification_status');
            $table->timestamp('verified_at')->nullable()->after('verification_note');
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->string('legal_name')->nullable()->after('name');
            $table->string('nib', 13)->nullable()->after('legal_name');
            $table->string('npwp')->nullable()->after('nib');
            $table->string('pic_name')->nullable()->after('email');
            $table->string('website')->nullable()->after('pic_name');
            $table->string('bank_name')->nullable()->after('segment');
            $table->string('bank_account_no')->nullable()->after('bank_name');
            $table->string('bank_account_name')->nullable()->after('bank_account_no');
            $table->string('verification_status')->default('unverified')->after('bank_account_name');
            $table->string('verification_note')->nullable()->after('verification_status');
            $table->timestamp('verified_at')->nullable()->after('verification_note');
        });

        Schema::table('vendors', function (Blueprint $table) {
            $table->string('legal_name')->nullable()->after('name');
            $table->string('nib', 13)->nullable()->after('legal_name');
            $table->string('npwp')->nullable()->after('nib');
            $table->string('pic_name')->nullable()->after('email');
            $table->string('website')->nullable()->after('pic_name');
            $table->string('bank_name')->nullable()->after('service_type');
            $table->string('bank_account_no')->nullable()->after('bank_name');
            $table->string('bank_account_name')->nullable()->after('bank_account_no');
            $table->string('verification_status')->default('unverified')->after('bank_account_name');
            $table->string('verification_note')->nullable()->after('verification_status');
            $table->timestamp('verified_at')->nullable()->after('verification_note');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->renameColumn('npwp', 'tax_id');
        });

        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn([
                'legal_name',
                'nib',
                'pic_name',
                'website',
                'bank_name',
                'bank_account_no',
                'bank_account_name',
                'verification_status',
                'verification_note',
                'verified_at',
            ]);
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn([
                'legal_name',
                'nib',
                'npwp',
                'pic_name',
                'website',
                'bank_name',
                'bank_account_no',
                'bank_account_name',
                'verification_status',
                'verification_note',
                'verified_at',
            ]);
        });

        Schema::table('vendors', function (Blueprint $table) {
            $table->dropColumn([
                'legal_name',
                'nib',
                'npwp',
                'pic_name',
                'website',
                'bank_name',
                'bank_account_no',
                'bank_account_name',
                'verification_status',
                'verification_note',
                'verified_at',
            ]);
        });
    }
};
