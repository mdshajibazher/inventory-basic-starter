<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')
            ->whereNotNull('role_id')
            ->orderBy('id')
            ->select(['id', 'role_id'])
            ->chunk(500, function ($users) {
                foreach ($users as $user) {
                    DB::table('model_has_roles')->updateOrInsert([
                        'role_id' => $user->role_id,
                        'model_type' => User::class,
                        'model_id' => $user->id,
                    ], []);
                }
            });
    }

    public function down(): void
    {
        //
    }
};
