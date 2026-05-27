<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SupplierResource;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class SupplierController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return SupplierResource::collection(
            Supplier::query()
                ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
                ->when($request->filled('search'), function ($query) use ($request) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term) {
                            $subQuery->where('name', 'like', "%{$term}%")
                                ->orWhere('company_name', 'like', "%{$term}%")
                                ->orWhere('vat_number', 'like', "%{$term}%")
                                ->orWhere('email', 'like', "%{$term}%")
                                ->orWhere('phone_number', 'like', "%{$term}%")
                                ->orWhere('address', 'like', "%{$term}%")
                                ->orWhere('city', 'like', "%{$term}%")
                                ->orWhere('state', 'like', "%{$term}%")
                                ->orWhere('postal_code', 'like', "%{$term}%")
                                ->orWhere('country', 'like', "%{$term}%")
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
        $data = $this->validatedData($request);

        if ($request->hasFile('image')) {
            $data['image'] = $request->file('image')->store('suppliers', 'public');
        }

        unset($data['remove_image']);

        $supplier = Supplier::create($data);

        return response()->json([
            'message' => 'Supplier created successfully.',
            'data' => new SupplierResource($supplier),
        ], 201);
    }

    public function show(Supplier $supplier)
    {
        return response()->json([
            'data' => new SupplierResource($supplier),
        ]);
    }

    public function update(Request $request, Supplier $supplier)
    {
        $data = $this->validatedData($request, $supplier);

        if ($request->boolean('remove_image') && $supplier->image) {
            Storage::disk('public')->delete($supplier->image);
            $data['image'] = null;
        }

        if ($request->hasFile('image')) {
            if ($supplier->image) {
                Storage::disk('public')->delete($supplier->image);
            }

            $data['image'] = $request->file('image')->store('suppliers', 'public');
        }

        unset($data['remove_image']);

        $supplier->update($data);

        return response()->json([
            'message' => 'Supplier updated successfully.',
            'data' => new SupplierResource($supplier),
        ]);
    }

    public function destroy(Supplier $supplier)
    {
        if ($supplier->image) {
            Storage::disk('public')->delete($supplier->image);
        }

        $supplier->delete();

        return response()->json([
            'message' => 'Supplier deleted successfully.',
        ]);
    }

    private function validatedData(Request $request, ?Supplier $supplier = null): array
    {
        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('suppliers', 'name')->ignore($supplier?->id),
            ],
            'image' => ['nullable', 'image', 'max:2048'],
            'company_name' => ['required', 'string', 'max:255'],
            'vat_number' => ['nullable', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'phone_number' => ['required', 'string', 'max:255'],
            'address' => ['required', 'string', 'max:255'],
            'city' => ['required', 'string', 'max:255'],
            'state' => ['nullable', 'string', 'max:255'],
            'postal_code' => ['nullable', 'string', 'max:255'],
            'country' => ['nullable', 'string', 'max:255'],
            'is_active' => ['nullable', 'boolean'],
            'remove_image' => ['nullable', 'boolean'],
        ]);

        $data['is_active'] = $data['is_active'] ?? true;

        return $data;
    }
}
