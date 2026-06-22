<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Services\CustomerLedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerLedgerController extends Controller
{
    public function __invoke(Request $request, Customer $customer, CustomerLedgerService $ledger): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        return response()->json([
            'data' => $ledger->statement(
                $customer,
                $validated['from'] ?? null,
                $validated['to'] ?? null
            ),
        ]);
    }
}
