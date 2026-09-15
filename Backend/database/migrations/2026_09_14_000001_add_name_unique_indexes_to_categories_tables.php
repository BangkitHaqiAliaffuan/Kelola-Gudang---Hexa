<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Guard duplikat nama: kategori unik global, sub-kategori unik per parent.
 *
 * Melengkapi Rule::unique di FormRequest (Store/UpdateCategoryRequest,
 * Store/UpdateSubCategoryRequest) sebagai penegak lapis DB — menutup jendela
 * race antar request konkuren dan jalur create langsung (mis. resolusi
 * category_name di ItemController::bulkImport). PostgreSQL DDL transaksional,
 * jadi migrasi gagal total (tanpa data berubah) bila DB sudah berisi nama
 * ganda — dedup manual dulu, jangan migrate:fresh.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->unique('name', 'categories_name_unique');
        });
        Schema::table('sub_categories', function (Blueprint $table) {
            $table->unique(['category_id', 'name'], 'sub_categories_category_name_unique');
        });
    }

    public function down(): void
    {
        Schema::table('sub_categories', function (Blueprint $table) {
            $table->dropUnique('sub_categories_category_name_unique');
        });
        Schema::table('categories', function (Blueprint $table) {
            $table->dropUnique('categories_name_unique');
        });
    }
};
