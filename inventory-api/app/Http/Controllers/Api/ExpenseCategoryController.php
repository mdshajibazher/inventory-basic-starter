<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ExpenseCategoryResource;
use App\Models\ExpenseCategory;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ExpenseCategoryController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 100), 1), 100);

        return ExpenseCategoryResource::collection(
            ExpenseCategory::query()
                ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
                ->when($request->filled('search'), function ($query) use ($request) {
                    $search = trim((string) $request->string('search'));

                    $query->where(function ($subQuery) use ($search) {
                        $subQuery->where('code', 'like', "%{$search}%")
                            ->orWhere('name', 'like', "%{$search}%");
                    });
                })
                ->orderBy('name')
                ->paginate($perPage)
                ->withQueryString()
        );
    }

    public function store(Request $request)
    {
        $category = ExpenseCategory::create($this->validatedData($request));

        return response()->json([
            'message' => 'Expense category created successfully.',
            'data' => new ExpenseCategoryResource($category),
        ], 201);
    }

    public function show(ExpenseCategory $expenseCategory)
    {
        return response()->json([
            'data' => new ExpenseCategoryResource($expenseCategory),
        ]);
    }

    public function update(Request $request, ExpenseCategory $expenseCategory)
    {
        $expenseCategory->update($this->validatedData($request, $expenseCategory));

        return response()->json([
            'message' => 'Expense category updated successfully.',
            'data' => new ExpenseCategoryResource($expenseCategory->refresh()),
        ]);
    }

    public function destroy(ExpenseCategory $expenseCategory)
    {
        if ($expenseCategory->expenses()->exists()) {
            return response()->json([
                'message' => 'Expense category is already used by expenses.',
            ], 422);
        }

        $expenseCategory->delete();

        return response()->json([
            'message' => 'Expense category deleted successfully.',
        ]);
    }

    private function validatedData(Request $request, ?ExpenseCategory $expenseCategory = null): array
    {
        $data = $request->validate([
            'code' => [
                'required',
                'string',
                'max:255',
                Rule::unique('expense_categories', 'code')->ignore($expenseCategory?->id),
            ],
            'name' => ['required', 'string', 'max:255'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $data['is_active'] = $data['is_active'] ?? $expenseCategory?->is_active ?? true;

        return $data;
    }
}
