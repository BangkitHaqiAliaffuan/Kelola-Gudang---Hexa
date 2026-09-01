<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->foreignId('locked_by_user_id')->nullable()->after('approver_user_id')->constrained('users')->nullOnDelete();
            $table->timestamp('locked_at')->nullable()->after('locked_by_user_id');
            $table->index('locked_at');
        });
    }

    public function down(): void
    {
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('locked_by_user_id');
            $table->dropColumn('locked_at');
        });
    }
};
