<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerGroup;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\SensitivePermissionCatalog;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class SensitiveCustomerRoleAssignmentTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createTables();
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach ([
            'customers-index',
            'customers-add',
            'customers-edit',
            SensitivePermissionCatalog::SUPER_USER,
            SensitivePermissionCatalog::APPROVAL_PAYMENTS,
        ] as $permission) {
            $this->permission($permission);
        }

        CustomerGroup::query()->create([
            'name' => 'Retail',
            'percentage' => '0',
            'is_active' => true,
        ]);
    }

    protected function tearDown(): void
    {
        foreach ([
            'customers',
            'customer_groups',
            'model_has_roles',
            'model_has_permissions',
            'role_has_permissions',
            'permissions',
            'roles',
            'users',
        ] as $table) {
            Schema::dropIfExists($table);
        }

        parent::tearDown();
    }

    public function test_ordinary_customer_administrator_cannot_silently_assign_a_sensitive_customer_role(): void
    {
        $actor = $this->user('ordinary@example.test');
        $actor->givePermissionTo($this->permission('customers-add'));
        $this->sensitiveCustomerRole();

        $this->actingAs($actor)
            ->postJson('/api/customers', $this->customerPayload('blocked@example.test'))
            ->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'blocked@example.test']);
        $this->assertDatabaseMissing('customers', ['email' => 'blocked@example.test']);
    }

    public function test_sensitive_customer_role_assignment_requires_acknowledgment_and_rolls_back(): void
    {
        $actor = $this->customerAdministrator('customers-add');
        $this->sensitiveCustomerRole();

        $this->actingAs($actor)
            ->postJson('/api/customers', $this->customerPayload('ack-required@example.test'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('acknowledged');

        $this->assertDatabaseMissing('users', ['email' => 'ack-required@example.test']);
        $this->assertDatabaseMissing('customers', ['email' => 'ack-required@example.test']);
    }

    public function test_acknowledged_sensitive_customer_role_assignment_is_audited(): void
    {
        $actor = $this->customerAdministrator('customers-add');
        $role = $this->sensitiveCustomerRole();

        $response = $this->actingAs($actor)
            ->postJson('/api/customers', [
                ...$this->customerPayload('linked@example.test'),
                'acknowledged' => true,
            ])
            ->assertCreated();

        $customer = Customer::query()->findOrFail($response->json('data.id'));
        $linkedUser = User::query()->findOrFail($response->json('data.user.id'));
        $this->assertTrue($linkedUser->hasRole($role));
        $this->assertSensitiveRoleAudit($actor, $linkedUser, $customer, $role);
    }

    public function test_customer_update_uses_the_same_acknowledged_sensitive_role_assignment_path(): void
    {
        $actor = $this->customerAdministrator('customers-edit');
        $role = $this->sensitiveCustomerRole();
        $customer = Customer::query()->create($this->customerAttributes('existing@example.test'));

        $response = $this->actingAs($actor)
            ->putJson("/api/customers/{$customer->id}", [
                ...$this->customerPayload('new-linked@example.test'),
                'acknowledged' => true,
            ])
            ->assertOk();

        $linkedUser = User::query()->findOrFail($response->json('data.user.id'));
        $this->assertTrue($linkedUser->hasRole($role));
        $this->assertSensitiveRoleAudit($actor, $linkedUser, $customer, $role);
    }

    public function test_inactive_role_authority_cannot_create_a_linked_customer_user(): void
    {
        $actor = $this->user('inactive-authority@example.test');
        $authority = $this->role('Inactive customer administrators', false);
        $authority->givePermissionTo([
            $this->permission('customers-add'),
            $this->permission(SensitivePermissionCatalog::SUPER_USER),
        ]);
        $actor->assignRole($authority);
        $this->sensitiveCustomerRole();

        $this->actingAs($actor)
            ->postJson('/api/customers', [
                ...$this->customerPayload('forged-linked@example.test'),
                'acknowledged' => true,
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'forged-linked@example.test']);
    }

    public function test_customer_role_sensitive_details_are_exposed_only_to_effective_super_users(): void
    {
        $role = $this->sensitiveCustomerRole();
        $ordinary = $this->user('ordinary-options@example.test');
        $ordinary->givePermissionTo($this->permission('customers-index'));

        $ordinaryResponse = $this->actingAs($ordinary)->getJson('/api/customers/options')->assertOk();
        $ordinaryResponse
            ->assertJsonPath('data.customer_user_role.id', $role->id)
            ->assertJsonMissingPath('data.customer_user_role.sensitive_permissions');

        $superUser = $this->user('super-options@example.test');
        $superUser->givePermissionTo([
            $this->permission('customers-index'),
            $this->permission(SensitivePermissionCatalog::SUPER_USER),
        ]);

        $this->actingAs($superUser)
            ->getJson('/api/customers/options')
            ->assertOk()
            ->assertJsonPath(
                'data.customer_user_role.sensitive_permissions',
                [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
            );
    }

    private function customerAdministrator(string $permission): User
    {
        $actor = $this->user("{$permission}@example.test");
        $actor->givePermissionTo([
            $this->permission($permission),
            $this->permission(SensitivePermissionCatalog::SUPER_USER),
        ]);

        return $actor;
    }

    private function sensitiveCustomerRole(): Role
    {
        $role = Role::query()->firstOrCreate([
            'name' => 'Customer',
            'guard_name' => 'web',
        ], [
            'description' => 'Customer portal user.',
            'is_active' => true,
        ]);
        $role->givePermissionTo($this->permission(SensitivePermissionCatalog::APPROVAL_PAYMENTS));

        return $role;
    }

    private function customerPayload(string $email): array
    {
        return [
            ...$this->customerAttributes($email),
            'create_user' => true,
            'username' => 'Linked User',
            'password' => 'password',
        ];
    }

    private function customerAttributes(string $email): array
    {
        return [
            'customer_group_id' => CustomerGroup::query()->value('id'),
            'name' => 'Linked Customer',
            'company_name' => 'Linked Company',
            'email' => $email,
            'phone_number' => sprintf('017%08u', abs(crc32($email)) % 100000000),
            'address' => 'Dhaka',
            'city' => 'Dhaka',
            'is_active' => true,
        ];
    }

    private function assertSensitiveRoleAudit(User $actor, User $target, Customer $customer, Role $role): void
    {
        $activity = Activity::query()->where('log_name', 'sensitive_permissions')->latest('id')->first();
        $this->assertNotNull($activity);
        if (! $activity) {
            return;
        }

        $this->assertSame($actor->id, (int) $activity->causer_id);
        $this->assertSame($target->id, (int) $activity->subject_id);
        $this->assertSame($target->id, $activity->properties->get('target_user_id'));
        $this->assertSame($customer->id, $activity->properties->get('target_customer_id'));
        $this->assertSame([$role->id], collect($activity->properties->get('added_roles'))->pluck('id')->all());
        $this->assertSame(
            [SensitivePermissionCatalog::APPROVAL_PAYMENTS],
            $activity->properties->get('added_sensitive_permissions'),
        );
    }

    private function user(string $email): User
    {
        return User::query()->create([
            'name' => 'Administrator',
            'email' => $email,
            'password' => 'password',
            'phone' => '01700000000',
            'is_active' => true,
            'is_deleted' => false,
        ]);
    }

    private function role(string $name, bool $active = true): Role
    {
        return Role::query()->create([
            'name' => $name,
            'guard_name' => 'web',
            'is_active' => $active,
        ]);
    }

    private function permission(string $name): Permission
    {
        return Permission::query()->firstOrCreate([
            'name' => $name,
            'guard_name' => 'web',
        ]);
    }

    private function createTables(): void
    {
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
        Schema::create('customer_groups', function (Blueprint $table): void {
            $table->increments('id');
            $table->string('name');
            $table->string('percentage');
            $table->boolean('is_active')->nullable();
            $table->timestamps();
        });
        Schema::create('customers', function (Blueprint $table): void {
            $table->increments('id');
            $table->integer('customer_group_id');
            $table->integer('user_id')->nullable();
            $table->string('name');
            $table->string('company_name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone_number');
            $table->string('tax_no')->nullable();
            $table->string('address');
            $table->string('city');
            $table->string('state')->nullable();
            $table->string('postal_code')->nullable();
            $table->string('country')->nullable();
            $table->double('deposit')->nullable();
            $table->double('expense')->nullable();
            $table->boolean('is_active')->nullable();
            $table->timestamps();
        });
    }
}
