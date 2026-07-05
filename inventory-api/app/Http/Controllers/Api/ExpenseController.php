<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ExpenseResource;
use App\Models\Account;
use App\Models\Expense;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ExpenseController extends Controller
{
    private array $relations = ['category', 'warehouse', 'account', 'biller', 'user'];

    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return ExpenseResource::collection(
            Expense::query()
                ->with($this->relations)
                ->where('biller_id', $request->user()->requireCurrentBillerId())
                ->when($request->filled('warehouse_id'), fn ($query) => $query->where('warehouse_id', $request->integer('warehouse_id')))
                ->when($request->filled('account_id'), fn ($query) => $query->where('account_id', $request->integer('account_id')))
                ->when($request->filled('expense_category_id'), fn ($query) => $query->where('expense_category_id', $request->integer('expense_category_id')))
                ->when($request->filled('from'), fn ($query) => $query->whereDate('created_at', '>=', $request->date('from')))
                ->when($request->filled('to'), fn ($query) => $query->whereDate('created_at', '<=', $request->date('to')))
                ->when($request->filled('search'), function ($query) use ($request) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term) {
                            $subQuery->where('reference_no', 'like', "%{$term}%")
                                ->orWhere('note', 'like', "%{$term}%")
                                ->orWhereHas('category', fn ($category) => $category->where('name', 'like', "%{$term}%"))
                                ->orWhereHas('warehouse', fn ($warehouse) => $warehouse->where('name', 'like', "%{$term}%"))
                                ->orWhereHas('account', fn ($account) => $account->where('name', 'like', "%{$term}%"));
                        });
                    }
                })
                ->latest()
                ->paginate($perPage)
                ->withQueryString()
        );
    }

    public function store(Request $request)
    {
        $data = $this->validatedData($request);
        $data['user_id'] = $request->user()->id;
        $data['biller_id'] = $request->user()->requireCurrentBillerId();
        $data['created_at'] = $this->expenseDate($data['expense_date'] ?? null);
        unset($data['expense_date']);

        $expense = DB::transaction(function () use ($data) {
            $expense = Expense::create($data);
            $this->applyAccountMovement($expense->account_id, -1 * (float) $expense->amount);

            return $expense;
        });

        return response()->json([
            'message' => 'Expense created successfully.',
            'data' => new ExpenseResource($expense->load($this->relations)),
        ], 201);
    }

    public function show(Expense $expense, Request $request)
    {
        $this->authorizeBranch($expense, $request);

        return response()->json([
            'data' => new ExpenseResource($expense->load($this->relations)),
        ]);
    }

    public function update(Request $request, Expense $expense)
    {
        $this->authorizeBranch($expense, $request);

        $data = $this->validatedData($request, $expense);
        $data['biller_id'] = $request->user()->requireCurrentBillerId();
        $data['created_at'] = $this->expenseDate($data['expense_date'] ?? null, $expense->created_at);
        unset($data['expense_date']);

        $expense = DB::transaction(function () use ($expense, $data) {
            $this->applyAccountMovement($expense->account_id, (float) $expense->amount);
            $expense->update($data);
            $this->applyAccountMovement($expense->account_id, -1 * (float) $expense->amount);

            return $expense->refresh();
        });

        return response()->json([
            'message' => 'Expense updated successfully.',
            'data' => new ExpenseResource($expense->load($this->relations)),
        ]);
    }

    public function destroy(Expense $expense, Request $request)
    {
        $this->authorizeBranch($expense, $request);

        DB::transaction(function () use ($expense) {
            $this->applyAccountMovement($expense->account_id, (float) $expense->amount);
            $expense->delete();
        });

        return response()->json([
            'message' => 'Expense deleted successfully.',
        ]);
    }

    private function validatedData(Request $request, ?Expense $expense = null): array
    {
        return $request->validate([
            'reference_no' => [
                'required',
                'string',
                'max:255',
                Rule::unique('expenses', 'reference_no')->ignore($expense?->id),
            ],
            'expense_category_id' => ['required', 'integer', 'exists:expense_categories,id'],
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'account_id' => ['required', 'integer', 'exists:accounts,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'note' => ['nullable', 'string'],
            'expense_date' => ['nullable', 'date'],
        ]);
    }

    private function expenseDate(?string $date, ?Carbon $fallback = null): Carbon
    {
        return $date ? Carbon::parse($date)->startOfDay() : ($fallback ?? now());
    }

    private function applyAccountMovement(int $accountId, float $amount): void
    {
        Account::query()
            ->whereKey($accountId)
            ->increment('total_balance', $amount);
    }

    private function authorizeBranch(Expense $expense, Request $request): void
    {
        abort_unless((int) $expense->biller_id === $request->user()->requireCurrentBillerId(), 404);
    }
}
