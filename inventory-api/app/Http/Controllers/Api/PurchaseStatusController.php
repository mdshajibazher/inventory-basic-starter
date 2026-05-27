<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PurchaseStatus;
use Illuminate\Http\JsonResponse;

class PurchaseStatusController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => PurchaseStatus::query()
                ->orderBy('id')
                ->get(['id', 'value', 'label']),
        ]);
    }
}
