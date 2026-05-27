<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BrandResource;
use App\Models\Brand;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class BrandController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return BrandResource::collection(
            Brand::query()
                ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
                ->when($request->filled('search'), function ($query) use ($request) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term) {
                            $subQuery->where('title', 'like', "%{$term}%")
                                ->orWhere('image', 'like', "%{$term}%")
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
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'image' => ['nullable', 'image', 'max:2048'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        if ($request->hasFile('image')) {
            $data['image'] = $request->file('image')->store('brands', 'public');
        }

        $brand = Brand::create($data);

        return response()->json([
            'message' => 'Brand created successfully.',
            'data' => new BrandResource($brand),
        ], 201);
    }

    public function show(Brand $brand)
    {
        return response()->json([
            'data' => new BrandResource($brand->load('products')),
        ]);
    }

    public function update(Request $request, Brand $brand)
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'image' => ['nullable', 'image', 'max:2048'],
            'is_active' => ['nullable', 'boolean'],
            'remove_image' => ['nullable', 'boolean'],
        ]);

        if ($request->boolean('remove_image') && $brand->image) {
            Storage::disk('public')->delete($brand->image);
            $data['image'] = null;
        }

        if ($request->hasFile('image')) {
            if ($brand->image) {
                Storage::disk('public')->delete($brand->image);
            }

            $data['image'] = $request->file('image')->store('brands', 'public');
        }

        unset($data['remove_image']);

        $brand->update($data);

        return response()->json([
            'message' => 'Brand updated successfully.',
            'data' => new BrandResource($brand),
        ]);
    }

    public function destroy(Brand $brand)
    {
        if ($brand->image) {
            Storage::disk('public')->delete($brand->image);
        }

        $brand->delete();

        return response()->json([
            'message' => 'Brand deleted successfully.',
        ]);
    }
}
