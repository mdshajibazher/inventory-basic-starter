<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function index()
    {
        return response()->json([
            'data' => Category::query()
                ->with('parent:id,name')
                ->latest()
                ->get(),
        ]);
    }

    public function store(Request $request)
    {
        $category = Category::create($request->validate([
            'name' => ['required', 'string', 'max:255'],
            'parent_id' => ['nullable', 'integer', 'exists:categories,id'],
            'is_active' => ['nullable', 'boolean'],
        ]));

        return response()->json([
            'message' => 'Category created successfully.',
            'data' => $category->load('parent:id,name'),
        ], 201);
    }

    public function show(Category $category)
    {
        return response()->json([
            'data' => $category->load([
                'parent:id,name',
                'children:id,name,parent_id,is_active',
                'products',
            ]),
        ]);
    }

    public function update(Request $request, Category $category)
    {
        $category->update($request->validate([
            'name' => ['required', 'string', 'max:255'],
            'parent_id' => [
                'nullable',
                'integer',
                'exists:categories,id',
                Rule::notIn([$category->id]),
            ],
            'is_active' => ['nullable', 'boolean'],
        ]));

        return response()->json([
            'message' => 'Category updated successfully.',
            'data' => $category->load('parent:id,name'),
        ]);
    }

    public function destroy(Category $category)
    {
        $category->delete();

        return response()->json([
            'message' => 'Category deleted successfully.',
        ]);
    }
}
