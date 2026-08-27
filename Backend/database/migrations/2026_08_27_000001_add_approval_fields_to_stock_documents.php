<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->timestamp('submitted_at')->nullable()->after('posted_at');
            $table->foreignId('approver_user_id')->nullable()->after('requester_user_id')->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approver_user_id');
            $table->string('decision_note', 1000)->nullable()->after('approved_at');
        });
    }

    public function down(): void
    {
        Schema::table('stock_documents', function (Blueprint $table) {
            $table->dropColumn(['submitted_at', 'approver_user_id', 'approved_at', 'decision_note']);
        });
    }
};
