<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TaxResource;
use App\Models\Tax;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TaxController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return TaxResource::collection(
            Tax::query()
                ->when($request->filled('search'), function ($query) use ($request) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term) {
                            $subQuery->where('name', 'like', "%{$term}%")
                                ->orWhere('rate', 'like', "%{$term}%")
                                ->orWhereRaw(
                                    "case when is_active = 1 then 'active' else 'inactive' end like ?",
                                    ["%{$term}%"]
                                );
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
        $tax = Tax::create($this->validatedData($request));

        return response()->json([
            'message' => 'Tax created successfully.',
            'data' => new TaxResource($tax),
        ], 201);
    }

    public function show(Tax $tax)
    {
        return response()->json([
            'data' => new TaxResource($tax),
        ]);
    }

    public function update(Request $request, Tax $tax)
    {
        $tax->update($this->validatedData($request, $tax));

        return response()->json([
            'message' => 'Tax updated successfully.',
            'data' => new TaxResource($tax),
        ]);
    }

    public function destroy(Tax $tax)
    {
        $tax->update(['is_active' => false]);

        return response()->json([
            'message' => 'Tax deleted successfully.',
        ]);
    }

    private function validatedData(Request $request, ?Tax $tax = null): array
    {
        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('taxes', 'name')->where('is_active', true)->ignore($tax?->id),
            ],
            'rate' => ['required', 'numeric', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $data['is_active'] = $data['is_active'] ?? true;

        return $data;
    }
}
