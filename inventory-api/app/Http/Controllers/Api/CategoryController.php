<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return CategoryResource::collection(
            Category::query()
                ->with('parent:id,name')
                ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
                ->when($request->filled('search'), function ($query) use ($request) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term) {
                            $subQuery->where('name', 'like', "%{$term}%")
                                ->orWhere('image', 'like', "%{$term}%")
                                ->orWhereRaw(
                                    "case when is_active = 1 then 'active' else 'inactive' end like ?",
                                    ["%{$term}%"]
                                )
                                ->orWhereHas('parent', function ($parentQuery) use ($term) {
                                    $parentQuery->where('name', 'like', "%{$term}%");
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
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'image' => ['nullable', 'image', 'max:2048'],
            'parent_id' => ['nullable', 'integer', 'exists:categories,id'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        if ($request->hasFile('image')) {
            $data['image'] = $request->file('image')->store('categories', 'public');
        }

        $category = Category::create($data);

        return response()->json([
            'message' => 'Category created successfully.',
            'data' => new CategoryResource($category->load('parent:id,name')),
        ], 201);
    }

    public function show(Category $category)
    {
        return response()->json([
            'data' => new CategoryResource($category->load([
                'parent:id,name',
                'children:id,name,parent_id,is_active',
                'products',
            ])),
        ]);
    }

    public function update(Request $request, Category $category)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'image' => ['nullable', 'image', 'max:2048'],
            'parent_id' => [
                'nullable',
                'integer',
                'exists:categories,id',
                Rule::notIn([$category->id]),
            ],
            'is_active' => ['nullable', 'boolean'],
            'remove_image' => ['nullable', 'boolean'],
        ]);

        if ($request->boolean('remove_image') && $category->image) {
            Storage::disk('public')->delete($category->image);
            $data['image'] = null;
        }

        if ($request->hasFile('image')) {
            if ($category->image) {
                Storage::disk('public')->delete($category->image);
            }

            $data['image'] = $request->file('image')->store('categories', 'public');
        }

        unset($data['remove_image']);

        $category->update($data);

        return response()->json([
            'message' => 'Category updated successfully.',
            'data' => new CategoryResource($category->load('parent:id,name')),
        ]);
    }

    public function destroy(Category $category)
    {
        if ($category->image) {
            Storage::disk('public')->delete($category->image);
        }

        $category->delete();

        return response()->json([
            'message' => 'Category deleted successfully.',
        ]);
    }
}
