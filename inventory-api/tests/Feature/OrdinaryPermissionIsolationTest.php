<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\SensitivePermissionAssignmentService;
use App\Services\SensitivePermissionCatalog;
use App\Services\SuperUserInvariantService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class OrdinaryPermissionIsolationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createTables();
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        DB::table('billers')->insert([
            'id' => 1,
            'name' => 'Main Branch',
            'company_name' => 'Inventory',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach ([
            ...app(SensitivePermissionCatalog::class)->all(),
            ...app(SensitivePermissionCatalog::class)->retiredGeneralSettingsPermissions(),
            'users-index',
            'products-index',
            'sales-index',
        ] as $permission) {
            $this->permission($permission);
        }
    }

    protected function tearDown(): void
    {
        foreach ([
            'personal_access_tokens',
            'model_has_roles',
            'model_has_permissions',
            'role_has_permissions',
            'permissions',
            'roles',
            'users',
            'billers',
        ] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_ordinary_role_permission_catalog_excludes_sensitive_and_retired_names(): void
    {
        $actor = $this->ordinaryAdministrator();

        $response = $this->actingAs($actor)->getJson('/api/roles/permissions')->assertOk();
        $names = collect($response->json('data'))->pluck('name')->all();

        $this->assertSame(['products-index', 'sales-index', 'users-index'], $names);
    }

    public function test_user_options_permission_catalog_excludes_sensitive_and_retired_names(): void
    {
        $actor = $this->ordinaryAdministrator();

        $response = $this->actingAs($actor)->getJson('/api/users/options')->assertOk();
        $names = collect($response->json('data.permissions'))->pluck('name')->all();

        $this->assertSame(['products-index', 'sales-index', 'users-index'], $names);
    }

    public function test_ordinary_user_options_hide_sensitive_bearing_roles_while_super_users_can_see_them(): void
    {
        $actor = $this->usersAdministrator();
        $ordinaryRole = $this->role('Ordinary role');
        $ordinaryRole->givePermissionTo($this->permission('products-index'));
        $sensitiveRole = $this->role('Sensitive role');
        $sensitiveRole->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $ordinaryResponse = $this->actingAs($actor)->getJson('/api/users/options')->assertOk();

        $this->assertSame(
            ['Ordinary role'],
            collect($ordinaryResponse->json('data.roles'))->pluck('name')->all(),
        );
        $this->assertArrayNotHasKey('sensitive_permissions', $ordinaryResponse->json('data.roles.0'));

        $actor->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));

        $superResponse = $this->actingAs($actor->fresh())->getJson('/api/users/options')->assertOk();

        $this->assertSame(
            ['Ordinary role', 'Sensitive role'],
            collect($superResponse->json('data.roles'))->pluck('name')->all(),
        );
        $this->assertSame([], $superResponse->json('data.roles.0.sensitive_permissions'));
        $this->assertSame(
            [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
            $superResponse->json('data.roles.1.sensitive_permissions'),
        );
    }

    public function test_super_user_without_ordinary_mutation_authority_cannot_see_sensitive_role_options(): void
    {
        $actor = $this->user();
        $actor->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));
        $ordinaryRole = $this->role('Ordinary role');
        $ordinaryRole->givePermissionTo($this->permission('products-index'));
        $sensitiveRole = $this->role('Sensitive role');
        $sensitiveRole->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $response = $this->actingAs($actor)->getJson('/api/users/options')->assertOk();

        $this->assertSame(
            ['Ordinary role'],
            collect($response->json('data.roles'))->pluck('name')->all(),
        );
        $this->assertArrayNotHasKey('sensitive_permissions', $response->json('data.roles.0'));
    }

    public function test_ordinary_user_creation_cannot_assign_a_sensitive_bearing_role(): void
    {
        $actor = $this->usersAdministrator();
        $role = $this->role('Super administrators');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));

        $this->actingAs($actor)
            ->postJson('/api/users', [
                'name' => 'Forged Administrator',
                'email' => 'forged-admin@example.test',
                'phone' => '01700000001',
                'password' => 'password',
                'biller_ids' => [1],
                'roles' => [$role->id],
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'forged-admin@example.test']);
    }

    public function test_ordinary_full_user_update_cannot_add_a_sensitive_bearing_role(): void
    {
        $actor = $this->usersAdministrator();
        $guardian = $this->user();
        $guardian->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));
        $target = $this->user();
        $role = $this->role('Payment approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}", [
                ...$this->userWritePayload($target),
                'roles' => [$role->id],
            ])
            ->assertForbidden();

        $this->assertFalse($target->fresh()->hasRole($role));
    }

    public function test_ordinary_dedicated_role_reassignment_cannot_add_a_sensitive_bearing_role(): void
    {
        $actor = $this->usersAdministrator();
        $guardian = $this->user();
        $guardian->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));
        $target = $this->user();
        $role = $this->role('Sales approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_SALES_INVOICE));

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}/roles", ['roles' => [$role->id]])
            ->assertForbidden();

        $this->assertFalse($target->fresh()->hasRole($role));
    }

    public function test_sensitive_role_addition_on_user_creation_requires_acknowledgment(): void
    {
        $actor = $this->ordinaryAdministrator();
        $role = $this->role('Payment approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $this->actingAs($actor)
            ->postJson('/api/users', [
                'name' => 'Acknowledgment Required',
                'email' => 'ack-required@example.test',
                'phone' => '01700000001',
                'password' => 'password',
                'biller_ids' => [1],
                'roles' => [$role->id],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('acknowledged');

        $this->assertDatabaseMissing('users', ['email' => 'ack-required@example.test']);
    }

    public function test_acknowledged_sensitive_role_addition_on_user_creation_is_audited(): void
    {
        $actor = $this->ordinaryAdministrator();
        $role = $this->role('Payment approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $response = $this->actingAs($actor)
            ->postJson('/api/users', [
                'name' => 'Acknowledged User',
                'email' => 'acknowledged@example.test',
                'phone' => '01700000001',
                'password' => 'password',
                'biller_ids' => [1],
                'roles' => [$role->id],
                'acknowledged' => true,
            ])
            ->assertCreated();

        $target = User::query()->findOrFail($response->json('data.id'));
        $this->assertTrue($target->hasRole($role));
        $this->assertSensitiveRoleAudit($actor, $target, [$role->id], [], [SensitivePermissionCatalog::APPROVAL_PAYMENTS], []);
    }

    public function test_acknowledged_sensitive_role_addition_on_full_user_update_is_audited(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();
        $role = $this->role('Sales approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_SALES_INVOICE));

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}", [
                ...$this->userWritePayload($target),
                'roles' => [$role->id],
                'acknowledged' => true,
            ])
            ->assertOk();

        $this->assertTrue($target->fresh()->hasRole($role));
        $this->assertSensitiveRoleAudit($actor, $target, [$role->id], [], [SensitivePermissionCatalog::APPROVAL_SALES_INVOICE], []);
    }

    public function test_acknowledged_sensitive_role_addition_on_dedicated_role_update_is_audited(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();
        $role = $this->role('Purchase approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PURCHASE_INVOICE));

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}/roles", [
                'roles' => [$role->id],
                'acknowledged' => true,
            ])
            ->assertOk();

        $this->assertTrue($target->fresh()->hasRole($role));
        $this->assertSensitiveRoleAudit($actor, $target, [$role->id], [], [SensitivePermissionCatalog::APPROVAL_PURCHASE_INVOICE], []);
    }

    public function test_sensitive_role_removal_does_not_require_acknowledgment_and_is_audited(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();
        $role = $this->role('Sales approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_SALES_INVOICE));
        $target->assignRole($role);

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}/roles", ['roles' => []])
            ->assertOk();

        $this->assertFalse($target->fresh()->hasRole($role));
        $this->assertSensitiveRoleAudit($actor, $target, [], [$role->id], [], [SensitivePermissionCatalog::APPROVAL_SALES_INVOICE]);
    }

    public function test_ordinary_administrator_cannot_remove_a_sensitive_role_membership(): void
    {
        $actor = $this->usersAdministrator();
        $this->activeSuperUserGuardian();
        $target = $this->user();
        $role = $this->role('Payment approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));
        $target->assignRole($role);

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}/roles", ['roles' => []])
            ->assertForbidden();

        $this->assertTrue($target->fresh()->hasRole($role));
    }

    public function test_ordinary_administrator_cannot_change_membership_of_a_directly_sensitive_user(): void
    {
        $actor = $this->usersAdministrator();
        $this->activeSuperUserGuardian();
        $target = $this->user();
        $target->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));
        $ordinaryRole = $this->role('Stock clerk');
        $ordinaryRole->givePermissionTo($this->permission('products-index'));

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}/roles", ['roles' => [$ordinaryRole->id]])
            ->assertForbidden();

        $this->assertFalse($target->fresh()->hasRole($ordinaryRole));
    }

    public function test_full_user_update_preserves_an_existing_sensitive_role_when_roles_are_omitted(): void
    {
        $actor = $this->usersAdministrator();
        $this->activeSuperUserGuardian();
        $target = $this->user();
        $role = $this->role('Existing sensitive role');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));
        $target->assignRole($role);

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}", [
                ...$this->userWritePayload($target),
                'name' => 'Profile only change',
            ])
            ->assertOk();

        $this->assertTrue($target->fresh()->hasRole($role));
    }

    public function test_full_user_update_allows_an_unchanged_sensitive_membership_without_acknowledgment(): void
    {
        $actor = $this->usersAdministrator();
        $this->activeSuperUserGuardian();
        $target = $this->user();
        $role = $this->role('Existing sensitive role');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));
        $target->assignRole($role);

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}", [
                ...$this->userWritePayload($target),
                'roles' => [$role->id],
            ])
            ->assertOk();

        $this->assertTrue($target->fresh()->hasRole($role));
    }

    public function test_current_user_permissions_use_direct_and_active_role_grants_only(): void
    {
        $user = $this->user();
        $user->givePermissionTo($this->permission('products-index'));
        $activeRole = $this->role('Active sales role');
        $activeRole->givePermissionTo($this->permission('sales-index'));
        $inactiveRole = $this->role('Inactive administrator role', false);
        $inactiveRole->givePermissionTo([
            $this->permission('users-index'),
            $this->permission(SensitivePermissionCatalog::SUPER_USER),
        ]);
        $user->assignRole([$activeRole, $inactiveRole]);

        $this->actingAs($user)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.permissions', ['products-index', 'sales-index']);
    }

    public function test_inactive_role_ordinary_authority_cannot_reactivate_that_role(): void
    {
        $actor = $this->user();
        $role = $this->role('Inactive self-service administrator', false);
        $role->givePermissionTo([
            $this->permission('users-index'),
            $this->permission(SensitivePermissionCatalog::SUPER_USER),
        ]);
        $actor->assignRole($role);

        $this->actingAs($actor)
            ->putJson("/api/roles/{$role->id}", [
                'name' => $role->name,
                'is_active' => true,
            ])
            ->assertForbidden();

        $this->assertFalse($role->fresh()->is_active);
    }

    public function test_ordinary_administrator_cannot_reset_an_active_super_user_password(): void
    {
        $actor = $this->usersAdministrator();
        $target = $this->user();
        $target->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));
        $originalPassword = $target->password;

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}", [
                ...$this->userWritePayload($target),
                'password' => 'taken-over-password',
            ])
            ->assertForbidden();

        $this->assertSame($originalPassword, $target->fresh()->password);
        $this->assertFalse(Hash::check('taken-over-password', $target->fresh()->password));
    }

    public function test_ordinary_administrator_cannot_reactivate_an_inactive_sensitive_user(): void
    {
        $actor = $this->usersAdministrator();
        $this->activeSuperUserGuardian();
        $target = $this->user(false);
        $target->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}", [
                ...$this->userWritePayload($target),
                'is_active' => true,
            ])
            ->assertForbidden();

        $this->assertFalse($target->fresh()->is_active);
    }

    public function test_ordinary_administrator_cannot_reactivate_an_inactive_sensitive_role(): void
    {
        $actor = $this->usersAdministrator();
        $this->activeSuperUserGuardian();
        $role = $this->role('Inactive payment approvers', false);
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $this->actingAs($actor)
            ->putJson("/api/roles/{$role->id}", [
                'name' => $role->name,
                'is_active' => true,
            ])
            ->assertForbidden();

        $this->assertFalse($role->fresh()->is_active);
    }

    public function test_ordinary_administrator_cannot_delete_a_sensitive_user_or_role(): void
    {
        $actor = $this->usersAdministrator();
        $this->activeSuperUserGuardian();
        $target = $this->user();
        $target->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));
        $role = $this->role('Unassigned payment approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $this->actingAs($actor)->deleteJson("/api/users/{$target->id}")->assertForbidden();
        $this->actingAs($actor)->deleteJson("/api/roles/{$role->id}")->assertForbidden();

        $target->refresh();
        $this->assertTrue($target->is_active);
        $this->assertFalse($target->is_deleted);
        $this->assertDatabaseHas('roles', ['id' => $role->id]);
    }

    public function test_super_user_reactivation_of_a_sensitive_user_audits_the_effective_transition(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user(false);
        $target->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}", [
                ...$this->userWritePayload($target),
                'is_active' => true,
            ])
            ->assertOk();

        $activity = Activity::query()->where('log_name', 'sensitive_permissions')->latest('id')->first();
        $this->assertNotNull($activity);
        if (! $activity) {
            return;
        }
        $this->assertSame($actor->id, (int) $activity->causer_id);
        $this->assertSame($target->id, (int) $activity->subject_id);
        $this->assertSame('status_changed', $activity->properties->get('action'));
        $this->assertSame([], $activity->properties->get('before_effective_sensitive_permissions'));
        $this->assertSame(
            [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
            $activity->properties->get('after_effective_sensitive_permissions'),
        );
    }

    public function test_super_user_reactivation_of_a_sensitive_role_audits_the_effective_transition(): void
    {
        $actor = $this->ordinaryAdministrator();
        $role = $this->role('Inactive payment approvers', false);
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $this->actingAs($actor)
            ->putJson("/api/roles/{$role->id}", [
                'name' => $role->name,
                'is_active' => true,
            ])
            ->assertOk();

        $activity = Activity::query()->where('log_name', 'sensitive_permissions')->latest('id')->first();
        $this->assertNotNull($activity);
        if (! $activity) {
            return;
        }
        $this->assertSame($actor->id, (int) $activity->causer_id);
        $this->assertSame($role->id, (int) $activity->subject_id);
        $this->assertSame('status_changed', $activity->properties->get('action'));
        $this->assertSame([], $activity->properties->get('before_effective_sensitive_permissions'));
        $this->assertSame(
            [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
            $activity->properties->get('after_effective_sensitive_permissions'),
        );
    }

    public function test_super_user_deletion_of_an_unassigned_sensitive_role_audits_the_effective_transition(): void
    {
        $actor = $this->ordinaryAdministrator();
        $role = $this->role('Retired payment approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $this->actingAs($actor)
            ->deleteJson("/api/roles/{$role->id}")
            ->assertOk();

        $activity = Activity::query()->where('log_name', 'sensitive_permissions')->latest('id')->first();
        $this->assertNotNull($activity);
        if (! $activity) {
            return;
        }
        $this->assertSame($actor->id, (int) $activity->causer_id);
        $this->assertSame($role->id, (int) $activity->subject_id);
        $this->assertSame('deleted', $activity->properties->get('action'));
        $this->assertSame(
            [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
            $activity->properties->get('before_effective_sensitive_permissions'),
        );
        $this->assertSame([], $activity->properties->get('after_effective_sensitive_permissions'));
    }

    public function test_ordinary_user_search_does_not_match_sensitive_or_retired_permissions(): void
    {
        $actor = $this->usersAdministrator();
        $directSensitive = $this->user();
        $directSensitive->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));
        $retired = $this->user();
        $retired->givePermissionTo($this->permission('general-settings-index'));
        $roleSensitive = $this->user();
        $role = $this->role('Financial approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));
        $roleSensitive->assignRole($role);
        $ordinary = $this->user();
        $ordinary->givePermissionTo($this->permission('products-index'));

        foreach ([
            SensitivePermissionCatalog::SUPER_USER => $directSensitive,
            'general-settings-index' => $retired,
            SensitivePermissionCatalog::APPROVAL_PAYMENTS => $roleSensitive,
        ] as $search => $target) {
            $response = $this->actingAs($actor)->getJson('/api/users?search='.urlencode($search))->assertOk();

            $this->assertNotContains($target->id, collect($response->json('data'))->pluck('id')->all());
        }

        $ordinaryResponse = $this->actingAs($actor)->getJson('/api/users?search=products-index')->assertOk();
        $this->assertContains($ordinary->id, collect($ordinaryResponse->json('data'))->pluck('id')->all());

        $actor->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));

        foreach ([
            SensitivePermissionCatalog::SUPER_USER => $directSensitive,
            'general-settings-index' => $retired,
            SensitivePermissionCatalog::APPROVAL_PAYMENTS => $roleSensitive,
        ] as $search => $target) {
            $response = $this->actingAs($actor->fresh())->getJson('/api/users?search='.urlencode($search))->assertOk();

            $this->assertContains($target->id, collect($response->json('data'))->pluck('id')->all());
        }
    }

    public function test_dedicated_user_ordinary_sync_preserves_sensitive_permissions(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();
        $target->givePermissionTo([
            $this->permission('sales-index'),
            $this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS),
        ]);

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}/permissions", ['permissions' => ['products-index']])
            ->assertOk();

        $this->assertSame(
            ['approvals-payments', 'products-index'],
            $target->fresh()->getDirectPermissions()->sortBy('name')->pluck('name')->values()->all(),
        );
    }

    public function test_dedicated_user_ordinary_sync_locks_before_reading_sensitive_grants(): void
    {
        $actor = $this->usersAdministrator();
        $target = $this->user();
        $sensitive = $this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS);
        $locker = new class($target, $sensitive) extends SuperUserInvariantService
        {
            public function __construct(
                private readonly User $target,
                private readonly Permission $permission,
            ) {}

            public function lockState(): void
            {
                parent::lockState();
                $this->target->givePermissionTo($this->permission);
            }
        };
        $this->app->instance(SuperUserInvariantService::class, $locker);

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}/permissions", ['permissions' => ['products-index']])
            ->assertOk();

        $this->assertSame(
            ['approvals-payments', 'products-index'],
            $target->fresh()->getDirectPermissions()->sortBy('name')->pluck('name')->values()->all(),
        );
    }

    public function test_full_user_update_preserves_sensitive_permissions(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();
        $target->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}", [
                'name' => $target->name,
                'email' => $target->email,
                'phone' => $target->phone,
                'is_active' => true,
                'biller_ids' => [1],
                'permissions' => ['products-index'],
            ])
            ->assertOk();

        $this->assertSame(
            ['approvals-payments', 'products-index'],
            $target->fresh()->getDirectPermissions()->sortBy('name')->pluck('name')->values()->all(),
        );
    }

    public function test_role_ordinary_sync_preserves_sensitive_permissions(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->role('Stock clerk');
        $target->givePermissionTo([
            $this->permission('sales-index'),
            $this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS),
        ]);

        $this->actingAs($actor)
            ->putJson("/api/roles/{$target->id}", [
                'name' => $target->name,
                'description' => null,
                'is_active' => true,
                'permissions' => ['products-index'],
            ])
            ->assertOk();

        $this->assertSame(
            ['approvals-payments', 'products-index'],
            $target->fresh()->permissions()->orderBy('name')->pluck('name')->all(),
        );
    }

    public function test_user_ordinary_sync_rejects_forged_sensitive_and_retired_names_with_403(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();
        $target->givePermissionTo($this->permission('sales-index'));

        foreach ([SensitivePermissionCatalog::SUPER_USER, 'general-settings-index'] as $forged) {
            $this->actingAs($actor)
                ->putJson("/api/users/{$target->id}/permissions", ['permissions' => [$forged]])
                ->assertForbidden();
        }

        $this->assertSame(['sales-index'], $target->fresh()->getDirectPermissions()->pluck('name')->all());
    }

    public function test_full_user_write_rejects_a_forged_sensitive_name_with_403(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();

        $this->actingAs($actor)
            ->putJson("/api/users/{$target->id}", [
                'name' => $target->name,
                'email' => $target->email,
                'phone' => $target->phone,
                'is_active' => true,
                'biller_ids' => [1],
                'permissions' => [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
            ])
            ->assertForbidden();
    }

    public function test_role_writes_reject_forged_sensitive_and_retired_names_with_403(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->role('Clerk');

        $this->actingAs($actor)
            ->putJson("/api/roles/{$target->id}", [
                'name' => $target->name,
                'is_active' => true,
                'permissions' => [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
            ])
            ->assertForbidden();

        $this->actingAs($actor)
            ->postJson('/api/roles', [
                'name' => 'Forged role',
                'permissions' => ['general-settings-edit'],
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('roles', ['name' => 'Forged role']);
    }

    public function test_ordinary_permission_rename_endpoint_cannot_modify_or_create_sensitive_names(): void
    {
        $actor = $this->ordinaryAdministrator();
        $sensitive = $this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS);
        $ordinary = $this->permission('products-index');

        $this->actingAs($actor)
            ->putJson("/api/roles/permissions/{$sensitive->id}", ['name' => 'renamed'])
            ->assertForbidden();

        $this->actingAs($actor)
            ->putJson("/api/roles/permissions/{$ordinary->id}", ['name' => SensitivePermissionCatalog::SUPER_USER])
            ->assertForbidden();

        $this->assertSame(SensitivePermissionCatalog::APPROVAL_PAYMENTS, $sensitive->fresh()->name);
        $this->assertSame('products-index', $ordinary->fresh()->name);
    }

    public function test_user_payload_separates_ordinary_direct_and_inherited_sensitive_permissions(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->user();
        $target->givePermissionTo([
            $this->permission('products-index'),
            $this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS),
        ]);
        $role = $this->role('Sales approvers');
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_SALES_INVOICE));
        $target->assignRole($role);

        $response = $this->actingAs($actor)->getJson("/api/users/{$target->id}");

        $response
            ->assertOk()
            ->assertJsonPath('data.permissions.0', 'products-index')
            ->assertJsonPath('data.direct_permissions.0.name', 'products-index')
            ->assertJsonPath('data.sensitive_permissions.direct.0', SensitivePermissionCatalog::APPROVAL_PAYMENTS)
            ->assertJsonPath('data.sensitive_permissions.inherited.0.name', SensitivePermissionCatalog::APPROVAL_SALES_INVOICE)
            ->assertJsonPath('data.sensitive_permissions.inherited.0.roles.0.name', 'Sales approvers');

        $this->assertCount(1, $response->json('data.permissions'));
        $this->assertCount(1, $response->json('data.direct_permissions'));
    }

    public function test_role_payload_separates_ordinary_and_sensitive_permissions(): void
    {
        $actor = $this->ordinaryAdministrator();
        $target = $this->role('Payment approvers');
        $target->givePermissionTo([
            $this->permission('products-index'),
            $this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS),
        ]);

        $response = $this->actingAs($actor)->getJson("/api/roles/{$target->id}");

        $response
            ->assertOk()
            ->assertJsonPath('data.permissions.0.name', 'products-index')
            ->assertJsonPath('data.sensitive_permissions.0', SensitivePermissionCatalog::APPROVAL_PAYMENTS);
        $this->assertCount(1, $response->json('data.permissions'));
    }

    public function test_unauthorized_user_payload_does_not_resolve_sensitive_data(): void
    {
        $actor = $this->usersAdministrator();
        $target = $this->user();
        $this->app->instance(SensitivePermissionAssignmentService::class, new class extends SensitivePermissionAssignmentService
        {
            public function __construct() {}

            public function userPayload(User $user): array
            {
                throw new \RuntimeException('Sensitive payload must be resolved lazily.');
            }
        });

        $this->actingAs($actor)
            ->getJson("/api/users/{$target->id}")
            ->assertOk()
            ->assertJsonMissingPath('data.sensitive_permissions');
    }

    private function ordinaryAdministrator(): User
    {
        $user = $this->user();
        $user->givePermissionTo([
            $this->permission('users-index'),
            $this->permission(SensitivePermissionCatalog::SUPER_USER),
        ]);

        return $user;
    }

    private function usersAdministrator(): User
    {
        $user = $this->user();
        $user->givePermissionTo($this->permission('users-index'));

        return $user;
    }

    private function activeSuperUserGuardian(): User
    {
        $user = $this->user();
        $user->givePermissionTo($this->permission(SensitivePermissionCatalog::SUPER_USER));

        return $user;
    }

    private function user(bool $active = true): User
    {
        return User::factory()->create([
            'phone' => '01700000000',
            'biller_id' => 1,
            'current_biller_id' => 1,
            'biller_ids' => [1],
            'is_active' => $active,
            'is_deleted' => false,
        ]);
    }

    private function role(string $name, bool $active = true): Role
    {
        return Role::create([
            'name' => $name,
            'guard_name' => 'web',
            'is_active' => $active,
        ]);
    }

    private function userWritePayload(User $user): array
    {
        return [
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'is_active' => true,
            'biller_ids' => [1],
        ];
    }

    private function permission(string $name): Permission
    {
        return Permission::query()->firstOrCreate([
            'name' => $name,
            'guard_name' => 'web',
        ]);
    }

    private function assertSensitiveRoleAudit(
        User $actor,
        User $target,
        array $addedRoleIds,
        array $removedRoleIds,
        array $addedSensitivePermissions,
        array $removedSensitivePermissions,
    ): void {
        $activity = Activity::query()->where('log_name', 'sensitive_permissions')->latest('id')->first();
        $this->assertNotNull($activity);
        if (! $activity) {
            return;
        }

        $this->assertSame($actor->id, (int) $activity->causer_id);
        $this->assertSame($target->id, (int) $activity->subject_id);
        $this->assertSame($target->id, $activity->properties->get('target_user_id'));
        $this->assertSame($addedRoleIds, collect($activity->properties->get('added_roles'))->pluck('id')->all());
        $this->assertSame($removedRoleIds, collect($activity->properties->get('removed_roles'))->pluck('id')->all());
        $this->assertSame($addedSensitivePermissions, $activity->properties->get('added_sensitive_permissions'));
        $this->assertSame($removedSensitivePermissions, $activity->properties->get('removed_sensitive_permissions'));
    }

    private function createTables(): void
    {
        Schema::create('billers', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('company_name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password')->nullable();
            $table->rememberToken();
            $table->string('phone')->nullable();
            $table->string('company_name')->nullable();
            $table->unsignedInteger('role_id')->nullable();
            $table->unsignedInteger('biller_id')->nullable();
            $table->unsignedInteger('current_biller_id')->nullable();
            $table->json('biller_ids')->nullable();
            $table->unsignedInteger('warehouse_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_deleted')->default(false);
            $table->timestamps();
        });
        Schema::create('roles', function (Blueprint $table): void {
            $table->increments('id');
            $table->string('name');
            $table->string('guard_name');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['name', 'guard_name']);
        });
        Schema::create('permissions', function (Blueprint $table): void {
            $table->increments('id');
            $table->string('name');
            $table->string('guard_name');
            $table->timestamps();
            $table->unique(['name', 'guard_name']);
        });
        Schema::create('role_has_permissions', function (Blueprint $table): void {
            $table->unsignedInteger('permission_id');
            $table->unsignedInteger('role_id');
            $table->primary(['permission_id', 'role_id']);
        });
        Schema::create('model_has_permissions', function (Blueprint $table): void {
            $table->unsignedInteger('permission_id');
            $table->string('model_type');
            $table->unsignedBigInteger('model_id');
            $table->primary(['permission_id', 'model_id', 'model_type']);
        });
        Schema::create('model_has_roles', function (Blueprint $table): void {
            $table->unsignedInteger('role_id');
            $table->string('model_type');
            $table->unsignedBigInteger('model_id');
            $table->primary(['role_id', 'model_id', 'model_type']);
        });
        Schema::create('personal_access_tokens', function (Blueprint $table): void {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });
    }
}
