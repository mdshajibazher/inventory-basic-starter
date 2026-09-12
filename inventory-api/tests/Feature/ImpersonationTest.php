<?php

namespace Tests\Feature;

use App\Models\Biller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class ImpersonationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->createTables();
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
        (require database_path('migrations/2026_09_12_000001_create_impersonation_sessions_table.php'))->up();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        Biller::create(['name' => 'Main', 'company_name' => 'Main', 'is_active' => true]);
    }

    public function test_start_uses_target_permissions_and_me_identifies_actor_without_changing_normal_branch(): void
    {
        [$actor, $original, $target] = $this->fixtures();
        $this->grant($target, 'products-index');
        $unrelated = $target->createToken('normal')->plainTextToken;
        $data = $this->api($original, 'POST', "/api/users/{$target->id}/impersonate")
            ->assertOk()->assertJsonPath('data.user.id', $target->id)
            ->assertJsonPath('data.user.permissions', ['products-index'])
            ->assertJsonPath('data.impersonation.actor.id', $actor->id)
            ->assertJsonPath('data.impersonation.target.id', $target->id)->json('data');
        $this->api($data['token'], 'GET', '/api/me')->assertOk()
            ->assertJsonPath('data.id', $target->id)
            ->assertJsonPath('data.impersonation', $data['impersonation']);
        $this->api($data['token'], 'GET', '/api/users')->assertForbidden();
        $this->api($original, 'GET', '/api/me')->assertOk()->assertJsonMissingPath('data.impersonation');
        $this->assertNotNull(PersonalAccessToken::findToken($unrelated));
        $this->assertNull($target->fresh()->current_biller_id);
        $stored = DB::table('impersonation_sessions')->first();
        $this->assertSame(PersonalAccessToken::findToken($original)->id, $stored->original_token_id);
        $this->assertStringNotContainsString($data['token'], json_encode($stored));
        $this->assertDatabaseHas('activity_log', ['log_name' => 'impersonation', 'event' => 'started', 'causer_id' => $actor->id]);
    }

    #[DataProvider('permissionCases')]
    public function test_only_effective_super_user_can_start(string $access, int $status): void
    {
        [$actor, $original, $target] = $this->fixtures(false);
        if ($access === 'direct') {
            $this->grant($actor, 'super-user');
        } elseif ($access === 'ordinary') {
            $this->grant($actor, 'users-index');
        } elseif (in_array($access, ['active-role', 'inactive-role'])) {
            $role = Role::create(['name' => $access, 'guard_name' => 'web', 'is_active' => $access === 'active-role']);
            $role->givePermissionTo($this->permission('super-user'));
            $actor->assignRole($role);
        }
        $this->api($original, 'POST', "/api/users/{$target->id}/impersonate")->assertStatus($status);
    }

    public static function permissionCases(): array
    {
        return [['direct', 200], ['active-role', 200], ['inactive-role', 403], ['ordinary', 403], ['none', 403]];
    }

    public function test_branch_selection_and_validation_match_login(): void
    {
        [, $original, $target] = $this->fixtures();
        $second = Biller::create(['name' => 'Second', 'company_name' => 'Second', 'is_active' => true]);
        $inactive = Biller::create(['name' => 'Inactive', 'company_name' => 'Inactive', 'is_active' => false]);
        $target->update(['biller_ids' => [1, $second->id, $inactive->id]]);
        $url = "/api/users/{$target->id}/impersonate";
        $this->api($original, 'POST', $url)->assertOk()->assertJsonPath('data.requires_branch', true)->assertJsonCount(2, 'data.branches');
        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->api($original, 'POST', $url, ['biller_id' => $inactive->id])->assertUnprocessable();
        $this->api($original, 'POST', $url, ['biller_id' => 999])->assertUnprocessable();
        $data = $this->api($original, 'POST', $url, ['biller_id' => $second->id])->assertOk()->assertJsonPath('data.user.current_biller_id', $second->id)->json('data');
        $this->api($data['token'], 'GET', '/api/me')->assertOk()->assertJsonPath('data.current_biller_id', $second->id);
        $target->update(['biller_ids' => []]);
        $this->api($original, 'POST', $url)->assertUnprocessable();
    }

    public function test_self_inactive_deleted_missing_and_nested_targets_are_rejected(): void
    {
        [$actor, $original, $target] = $this->fixtures();
        $this->api($original, 'POST', "/api/users/{$actor->id}/impersonate")->assertUnprocessable();
        $this->api($original, 'POST', '/api/users/999/impersonate')->assertNotFound();
        foreach ([['is_active' => false], ['is_active' => true, 'is_deleted' => true]] as $state) {
            $target->update($state);
            $this->api($original, 'POST', "/api/users/{$target->id}/impersonate")->assertUnprocessable();
        }
        $target->update(['is_deleted' => false]);
        $this->grant($target, 'super-user');
        $data = $this->start($original, $target);
        $this->api($data['token'], 'POST', "/api/users/{$actor->id}/impersonate")->assertForbidden();
    }

    public function test_stop_requires_exact_original_token_and_is_idempotent_after_target_is_disabled(): void
    {
        [$actor, $original, $target] = $this->fixtures();
        $data = $this->start($original, $target);
        $url = "/api/impersonations/{$data['impersonation']['id']}/stop";
        $this->api($data['token'], 'POST', $url)->assertForbidden();
        $otherOriginal = $actor->createToken('another-device')->plainTextToken;
        $this->api($otherOriginal, 'POST', $url)->assertForbidden();
        $stranger = $this->user()->createToken('stranger')->plainTextToken;
        $this->api($stranger, 'POST', $url)->assertForbidden();
        $this->api($original, 'POST', '/api/impersonations/999/stop')->assertNotFound();
        $target->update(['is_active' => false, 'is_deleted' => true]);
        PersonalAccessToken::findToken($data['token'])->delete();
        $actor->revokePermissionTo('super-user');
        $this->api($original, 'POST', $url)->assertOk();
        $this->api($original, 'POST', $url)->assertOk();
        $this->api($original, 'GET', '/api/me')->assertOk()->assertJsonPath('data.id', $actor->id);
        $this->assertSame(1, DB::table('activity_log')->where('log_name', 'impersonation')->where('event', 'stopped')->count());
    }

    #[DataProvider('revocationCases')]
    public function test_child_is_revoked_when_original_authority_is_lost(string $change): void
    {
        [$actor, $original, $target] = $this->fixtures();
        $unrelated = $target->createToken('normal')->plainTextToken;
        $data = $this->start($original, $target);
        match ($change) {
            'permission' => $actor->revokePermissionTo('super-user'),
            'inactive' => $actor->update(['is_active' => false]),
            'deleted' => $actor->update(['is_deleted' => true]),
            'token-deleted' => PersonalAccessToken::findToken($original)->delete(),
            'expires-at' => PersonalAccessToken::findToken($original)->update(['expires_at' => now()->subSecond()]),
            'sanctum-expiry' => PersonalAccessToken::findToken($original)->forceFill(['created_at' => now()->subMinutes(61)])->save(),
        };
        if ($change === 'sanctum-expiry') {
            config(['sanctum.expiration' => 60]);
        }
        $this->api($data['token'], 'GET', '/api/me')->assertUnauthorized();
        $this->assertNull(PersonalAccessToken::findToken($data['token']));
        $this->assertNotNull(PersonalAccessToken::findToken($unrelated));
        $this->assertNotNull(DB::table('impersonation_sessions')->first()->ended_at);
    }

    public static function revocationCases(): array
    {
        return array_map(fn ($case) => [$case], ['permission', 'inactive', 'deleted', 'token-deleted', 'expires-at', 'sanctum-expiry']);
    }

    public function test_second_start_replaces_only_the_child_of_the_same_original_token(): void
    {
        [$actor, $original, $target] = $this->fixtures();
        $other = $this->start($actor->createToken('second-device')->plainTextToken, $target);
        $first = $this->start($original, $target);
        $second = $this->start($original, $target);
        $this->assertNull(PersonalAccessToken::findToken($first['token']));
        $this->assertNotNull(PersonalAccessToken::findToken($second['token']));
        $this->assertNotNull(PersonalAccessToken::findToken($other['token']));
        $this->assertSame(2, DB::table('impersonation_sessions')->whereNull('ended_at')->count());
    }

    #[DataProvider('logoutCases')]
    public function test_logout_ends_child_without_disrupting_unrelated_target_tokens(bool $originalLogout): void
    {
        [, $original, $target] = $this->fixtures();
        $unrelated = $target->createToken('normal')->plainTextToken;
        $data = $this->start($original, $target);
        $this->api($originalLogout ? $original : $data['token'], 'POST', '/api/logout')->assertOk();
        $this->assertNull(PersonalAccessToken::findToken($data['token']));
        $this->assertNotNull(PersonalAccessToken::findToken($unrelated));
        $this->assertNotNull(DB::table('impersonation_sessions')->first()->ended_at);
        if (! $originalLogout) {
            $this->assertNotNull(PersonalAccessToken::findToken($original));
        }
    }

    public static function logoutCases(): array
    {
        return [[true], [false]];
    }

    public function test_normal_login_retains_branch_selection_behavior(): void
    {
        $target = $this->user();
        $this->postJson('/api/login', ['email' => $target->email, 'password' => 'password'])
            ->assertOk()->assertJsonPath('data.user.current_biller_id', 1)->assertJsonMissingPath('data.impersonation');
        $this->assertSame(1, $target->fresh()->current_biller_id);
    }

    private function api(string $token, string $method, string $uri, array $data = [])
    {
        Auth::forgetGuards();

        return $this->withToken($token)->json($method, $uri, $data);
    }

    private function start(string $token, User $target): array
    {
        return $this->api($token, 'POST', "/api/users/{$target->id}/impersonate")->assertOk()->json('data');
    }

    private function fixtures(bool $super = true): array
    {
        $actor = $this->user();
        if ($super) {
            $this->grant($actor, 'super-user');
        }

        return [$actor, $actor->createToken('normal')->plainTextToken, $this->user()];
    }

    private function user(): User
    {
        return User::factory()->create(['phone' => '01700000000', 'biller_ids' => [1], 'is_active' => true, 'is_deleted' => false]);
    }

    private function grant(User $user, string $name): void
    {
        $user->givePermissionTo($this->permission($name));
    }

    private function permission(string $name): Permission
    {
        return Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
    }

    private function createTables(): void
    {
        Schema::create('billers', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('company_name');
            foreach (['email', 'phone_number', 'address', 'city'] as $column) {
                $table->string($column)->nullable();
            }
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
    }
}
