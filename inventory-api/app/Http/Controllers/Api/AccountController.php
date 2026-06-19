<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AccountResource;
use App\Models\Account;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AccountController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return AccountResource::collection(
            Account::query()
                ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
                ->when($request->filled('search'), function ($query) use ($request) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term) {
                            $subQuery->where('account_no', 'like', "%{$term}%")
                                ->orWhere('name', 'like', "%{$term}%")
                                ->orWhere('note', 'like', "%{$term}%")
                                ->orWhereRaw(
                                    "case when is_default = 1 then 'default' else 'regular' end like ?",
                                    ["%{$term}%"]
                                )
                                ->orWhereRaw(
                                    "case when is_active = 1 then 'active' else 'inactive' end like ?",
                                    ["%{$term}%"]
                                );
                        });
                    }
                })
                ->orderByDesc('is_default')
                ->latest()
                ->paginate($perPage)
                ->withQueryString()
        );
    }

    public function store(Request $request)
    {
        $data = $this->validatedData($request);

        $account = DB::transaction(function () use ($data) {
            if (($data['is_default'] ?? false) || ! Account::query()->exists()) {
                Account::query()->update(['is_default' => false]);
                $data['is_default'] = true;
                $data['is_active'] = true;
            }

            return Account::create($data);
        });

        return response()->json([
            'message' => 'Account created successfully.',
            'data' => new AccountResource($account),
        ], 201);
    }

    public function show(Account $account)
    {
        return response()->json([
            'data' => new AccountResource($account),
        ]);
    }

    public function update(Request $request, Account $account)
    {
        $data = $this->validatedData($request, $account);

        $account = DB::transaction(function () use ($account, $data) {
            if (($data['is_default'] ?? false) === true) {
                Account::query()->where('id', '!=', $account->id)->update(['is_default' => false]);
                $data['is_active'] = true;
            } elseif ($account->is_default && ($data['is_default'] ?? false) === false) {
                abort(422, 'Select another default account before removing this default.');
            }

            $account->update($data);

            return $account->refresh();
        });

        return response()->json([
            'message' => 'Account updated successfully.',
            'data' => new AccountResource($account),
        ]);
    }

    public function destroy(Account $account)
    {
        if ($account->is_default) {
            return response()->json([
                'message' => 'Default account cannot be deleted.',
            ], 422);
        }

        $account->delete();

        return response()->json([
            'message' => 'Account deleted successfully.',
        ]);
    }

    private function validatedData(Request $request, ?Account $account = null): array
    {
        $data = $request->validate([
            'account_no' => [
                'required',
                'string',
                'max:255',
                Rule::unique('accounts', 'account_no')->ignore($account?->id),
            ],
            'name' => ['required', 'string', 'max:255'],
            'initial_balance' => ['nullable', 'numeric', 'min:0'],
            'total_balance' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string'],
            'is_default' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $data['initial_balance'] = $data['initial_balance'] ?? $account?->initial_balance ?? 0;
        $data['total_balance'] = $data['total_balance'] ?? $account?->total_balance ?? $data['initial_balance'];
        $data['is_default'] = $data['is_default'] ?? $account?->is_default ?? false;
        $data['is_active'] = $data['is_active'] ?? $account?->is_active ?? true;

        return $data;
    }
}
