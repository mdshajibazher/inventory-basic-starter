<?php

namespace Database\Seeders;

use App\Models\Account;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class AccountSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        $accounts = collect(range(1, 10))->map(function (int $index) {
            $balance = $index === 1 ? 25000 : $index * 1750;

            return [
                'account_no' => 'ACCT-'.str_pad((string) (1000 + $index), 4, '0', STR_PAD_LEFT),
                'name' => $index === 1 ? 'Default Cash Account' : "Demo Account {$index}",
                'initial_balance' => $balance,
                'total_balance' => $balance,
                'note' => $index === 1 ? 'Default account for seeded transactions.' : "Demo account {$index}.",
                'is_default' => $index === 1,
                'is_active' => true,
            ];
        });

        DB::transaction(function () use ($accounts) {
            $accounts->each(function (array $data) {
                Account::query()->updateOrCreate(
                    ['account_no' => $data['account_no']],
                    $data
                );
            });

            Account::query()
                ->where('account_no', '!=', 'ACCT-1001')
                ->update(['is_default' => false]);
            Account::query()
                ->where('account_no', '=', 'ACCT-1001')
                ->update(['is_default' => true, 'is_active' => true]);
        });
    }
}
