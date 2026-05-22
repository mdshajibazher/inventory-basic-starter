<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UnitResource;
use App\Models\Unit;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UnitController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return UnitResource::collection(
            Unit::query()
                ->with('baseUnit:id,unit_name')
                ->where('is_active', true)
                ->when($request->filled('search'), function ($query) use ($request) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term) {
                            $subQuery->where('unit_code', 'like', "%{$term}%")
                                ->orWhere('unit_name', 'like', "%{$term}%")
                                ->orWhere('operator', 'like', "%{$term}%")
                                ->orWhere('operation_value', 'like', "%{$term}%")
                                ->orWhereHas('baseUnit', function ($baseQuery) use ($term) {
                                    $baseQuery->where('unit_name', 'like', "%{$term}%")
                                        ->orWhere('unit_code', 'like', "%{$term}%");
                                });
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
        $unit = Unit::create($this->validatedData($request));

        return response()->json([
            'message' => 'Unit created successfully.',
            'data' => new UnitResource($unit->load('baseUnit:id,unit_name')),
        ], 201);
    }

    public function show(Unit $unit)
    {
        return response()->json([
            'data' => new UnitResource($unit->load([
                'baseUnit:id,unit_name',
                'relatedUnits:id,unit_code,unit_name,base_unit,is_active',
                'products',
            ])),
        ]);
    }

    public function update(Request $request, Unit $unit)
    {
        $unit->update($this->validatedData($request, $unit));

        return response()->json([
            'message' => 'Unit updated successfully.',
            'data' => new UnitResource($unit->load('baseUnit:id,unit_name')),
        ]);
    }

    public function destroy(Unit $unit)
    {
        $unit->update(['is_active' => false]);

        return response()->json([
            'message' => 'Unit deleted successfully.',
        ]);
    }

    private function validatedData(Request $request, ?Unit $unit = null): array
    {
        $data = $request->validate([
            'unit_code' => [
                'required',
                'string',
                'max:255',
                Rule::unique('units', 'unit_code')
                    ->where('is_active', true)
                    ->ignore($unit?->id),
            ],
            'unit_name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('units', 'unit_name')
                    ->where('is_active', true)
                    ->ignore($unit?->id),
            ],
            'base_unit' => [
                'nullable',
                'integer',
                'exists:units,id',
            ],
            'operator' => ['required_with:base_unit', 'nullable', 'string', 'in:*,/'],
            'operation_value' => ['required_with:base_unit', 'nullable', 'numeric', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        if (empty($data['base_unit'])) {
            $data['operator'] = '*';
            $data['operation_value'] = 1;
        }

        return $data;
    }
}
