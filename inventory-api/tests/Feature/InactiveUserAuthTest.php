<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class InactiveUserAuthTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->rememberToken();
            $table->string('phone');
            $table->string('company_name')->nullable();
            $table->integer('role_id')->nullable();
            $table->integer('biller_id')->nullable();
            $table->integer('warehouse_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_deleted')->default(false);
            $table->timestamps();
        });

        Schema::create('personal_access_tokens', function (Blueprint $table) {
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

    protected function tearDown(): void
    {
        Schema::dropIfExists('personal_access_tokens');
        Schema::dropIfExists('users');

        parent::tearDown();
    }

    public function test_inactive_user_cannot_login(): void
    {
        $user = User::factory()->create([
            'email' => 'inactive@example.com',
            'phone' => '01700000000',
            'is_active' => false,
            'is_deleted' => false,
        ]);

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_inactive_logged_in_user_is_logged_out(): void
    {
        $user = User::factory()->create([
            'phone' => '01700000000',
            'is_active' => true,
            'is_deleted' => false,
        ]);
        $plainTextToken = $user->createToken('inventory-mobile')->plainTextToken;

        $user->update(['is_active' => false]);

        $this->withToken($plainTextToken)
            ->getJson('/api/me')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Your account is inactive. Please contact an administrator.');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_deleted_user_cannot_keep_using_existing_token(): void
    {
        $user = User::factory()->create([
            'phone' => '01700000000',
            'is_active' => true,
            'is_deleted' => false,
        ]);
        $plainTextToken = $user->createToken('inventory-mobile')->plainTextToken;

        $user->update(['is_deleted' => true]);

        $this->withToken($plainTextToken)
            ->getJson('/api/me')
            ->assertUnauthorized();

        $this->assertFalse(PersonalAccessToken::query()->exists());
    }
}
