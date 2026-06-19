<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UnitGroupResource;
use App\Models\UnitGroup;

class UnitGroupController extends Controller
{
    public function index()
    {
        return UnitGroupResource::collection(
            UnitGroup::query()
                ->orderBy('title')
                ->get()
        );
    }
}
