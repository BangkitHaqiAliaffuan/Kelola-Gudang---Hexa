<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use App\Models\WorkOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_paginated_projects(): void
    {
        Project::factory()->count(5)->create();

        $this->getJson('/api/master/projects')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta'])
            ->assertJsonCount(5, 'data');
    }

    public function test_index_counts_work_orders(): void
    {
        $project = Project::factory()->create();
        WorkOrder::factory()->count(3)->create(['project_id' => $project->id]);

        $this->getJson('/api/master/projects')
            ->assertOk()
            ->assertJsonPath('data.0.work_orders_count', 3);
    }

    public function test_index_resolves_pic_name(): void
    {
        $pic = User::factory()->create(['name' => 'Rudi Hartono']);
        Project::factory()->create(['pic_user_id' => $pic->id]);

        $this->getJson('/api/master/projects')
            ->assertOk()
            ->assertJsonPath('data.0.pic', 'Rudi Hartono')
            ->assertJsonPath('data.0.pic_user_id', $pic->id);
    }

    public function test_index_can_search(): void
    {
        Project::factory()->create(['name' => 'Proyek Tol Cisumdawu']);
        Project::factory()->count(3)->create();

        $this->getJson('/api/master/projects?search=cisumdawu')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_index_filters_by_status(): void
    {
        Project::factory()->count(2)->create(['status' => 'Berjalan']);
        Project::factory()->count(1)->create(['status' => 'Selesai']);

        $this->getJson('/api/master/projects?status=Berjalan')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_can_store_project(): void
    {
        $this->postJson('/api/master/projects', [
            'code' => 'PRJ-999',
            'name' => 'Instalasi Panel Gedung B',
            'status' => 'Perencanaan',
            'budget' => 120000000,
        ])->assertCreated()
            ->assertJsonPath('data.code', 'PRJ-999')
            ->assertJsonPath('data.status', 'Perencanaan')
            ->assertJsonPath('data.budget', 120000000);

        $this->assertDatabaseHas('projects', ['code' => 'PRJ-999']);
    }

    public function test_store_auto_generates_code(): void
    {
        $this->postJson('/api/master/projects', [
            'name' => 'Proyek Otomatis',
        ])->assertCreated()
            ->assertJsonPath('data.code', 'PRJ-001');

        $this->assertDatabaseHas('projects', ['code' => 'PRJ-001']);
    }

    public function test_store_validates_required_fields(): void
    {
        $this->postJson('/api/master/projects', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_store_rejects_invalid_status(): void
    {
        $this->postJson('/api/master/projects', [
            'name' => 'Status Salah',
            'status' => 'Batal',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['status']);
    }

    public function test_can_show_project(): void
    {
        $project = Project::factory()->create(['name' => 'Maintenance Rutin']);

        $this->getJson("/api/master/projects/{$project->id}")
            ->assertOk()
            ->assertJsonPath('data.name', 'Maintenance Rutin');
    }

    public function test_can_update_project(): void
    {
        $project = Project::factory()->create(['name' => 'Lama']);

        $this->putJson("/api/master/projects/{$project->id}", [
            'name' => 'Baru',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Baru');

        $this->assertDatabaseHas('projects', ['id' => $project->id, 'name' => 'Baru']);
    }

    public function test_cannot_delete_project_that_has_work_orders(): void
    {
        $project = Project::factory()->create();
        WorkOrder::factory()->create(['project_id' => $project->id]);

        $this->deleteJson("/api/master/projects/{$project->id}")
            ->assertUnprocessable();

        $this->assertDatabaseHas('projects', ['id' => $project->id]);
    }

    public function test_can_delete_empty_project(): void
    {
        $project = Project::factory()->create();

        $this->deleteJson("/api/master/projects/{$project->id}")
            ->assertOk();

        $this->assertDatabaseMissing('projects', ['id' => $project->id]);
    }
}
