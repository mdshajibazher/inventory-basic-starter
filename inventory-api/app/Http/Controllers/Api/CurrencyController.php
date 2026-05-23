<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CurrencyResource;
use App\Models\Currency;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CurrencyController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return CurrencyResource::collection(
            Currency::query()
                ->when($request->filled('search'), function ($query) use ($request) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term) {
                            $subQuery->where('name', 'like', "%{$term}%")
                                ->orWhere('code', 'like', "%{$term}%")
                                ->orWhere('exchange_rate', 'like', "%{$term}%");
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
        $currency = Currency::create($this->validatedData($request));

        return response()->json([
            'message' => 'Currency created successfully.',
            'data' => new CurrencyResource($currency),
        ], 201);
    }

    public function show(Currency $currency)
    {
        return response()->json([
            'data' => new CurrencyResource($currency),
        ]);
    }

    public function update(Request $request, Currency $currency)
    {
        $currency->update($this->validatedData($request, $currency));

        return response()->json([
            'message' => 'Currency updated successfully.',
            'data' => new CurrencyResource($currency),
        ]);
    }

    public function destroy(Currency $currency)
    {
        $currency->delete();

        return response()->json([
            'message' => 'Currency deleted successfully.',
        ]);
    }

    private function validatedData(Request $request, ?Currency $currency = null): array
    {
        return $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('currencies', 'name')->ignore($currency?->id),
            ],
            'code' => [
                'required',
                'string',
                'max:10',
                Rule::unique('currencies', 'code')->ignore($currency?->id),
            ],
            'exchange_rate' => ['required', 'numeric', 'min:0'],
        ]);
    }
}
