<?php

namespace App\Http\Controllers\Api;

use App\Actions\Purchases\StorePurchaseReturnAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\StorePurchaseReturnRequest;
use App\Http\Resources\ReturnPurchaseResource;
use App\Models\ReturnPurchase;
use App\Services\ApprovalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class PurchaseReturnController extends Controller
{
    private const RELATIONS = [
        'supplier:id,name,email,phone_number',
        'warehouse:id,name',
        'biller:id,name,company_name',
        'user:id,name,email',
        'approver:id,name,email',
        'products.product:id,name,code,type,purchase_unit_id,sale_unit_id,cost,price,tax_id,is_batch,is_variant',
        'products.product.variants.variant:id,name',
        'products.unit:id,unit_code,unit_name',
        'products.batch:id,batch_no,expired_date',
        'products.variant:id,name',
    ];

    public function index(Request $request): JsonResponse
    {
        $perPage = min((int) $request->query('per_page', 15), 100);
        $search = trim((string) $request->query('search', ''));
        $billerId = $request->user()?->requireCurrentBillerId();

        $returns = ReturnPurchase::query()
            ->with(['supplier:id,name', 'warehouse:id,name', 'biller:id,name'])
            ->when($billerId, fn ($query) => $query->where('biller_id', $billerId))
            ->when($request->boolean('approved_only'), fn ($query) => $query->where('approval_status', ApprovalService::APPROVED))
            ->when($request->filled('supplier_id'), fn ($query) => $query->where('supplier_id', $request->integer('supplier_id')))
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($searchQuery) use ($search) {
                    $searchQuery->where('reference_no', 'like', "%{$search}%")
                        ->orWhereHas('supplier', fn ($supplier) => $supplier->where('name', 'like', "%{$search}%"));
                });
            })
            ->latest('id')
            ->paginate($perPage);

        return response()->json(ReturnPurchaseResource::collection($returns)->response()->getData(true));
    }

    public function show(ReturnPurchase $returnPurchase, Request $request): JsonResponse
    {
        $this->authorizeBranch($returnPurchase, $request);

        return response()->json([
            'data' => new ReturnPurchaseResource($returnPurchase->load([
                ...self::RELATIONS,
                'activities' => fn ($query) => $query->with('causer')->latest()->limit(25),
            ])),
        ]);
    }

    public function store(StorePurchaseReturnRequest $request, StorePurchaseReturnAction $storePurchaseReturn): JsonResponse
    {
        try {
            $returnPurchase = $storePurchaseReturn->execute(
                $request->validated(),
                $request->user(),
                $request->file('document')
            );

            return response()->json([
                'message' => 'Purchase return created successfully.',
                'data' => new ReturnPurchaseResource($returnPurchase),
            ], 201);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::error('Failed to create purchase return.', [
                'user_id' => $request->user()?->id,
                'reference_no' => $request->input('reference_no'),
                'exception' => $exception,
            ]);

            return response()->json([
                'message' => 'Unable to create purchase return.',
            ], 500);
        }
    }

    public function update(StorePurchaseReturnRequest $request, ReturnPurchase $returnPurchase, StorePurchaseReturnAction $storePurchaseReturn, ApprovalService $approvals): JsonResponse
    {
        $this->authorizeBranch($returnPurchase, $request);

        try {
            $previousDocument = $returnPurchase->document;
            $approvals->resetPurchaseReturnApproval($returnPurchase);
            $returnPurchase = $storePurchaseReturn->execute(
                $request->validated(),
                $request->user(),
                $request->file('document'),
                $returnPurchase
            );

            if ($request->hasFile('document') && $previousDocument && $previousDocument !== $returnPurchase->document) {
                Storage::disk('public')->delete($previousDocument);
            }

            return response()->json([
                'message' => 'Purchase return updated successfully.',
                'data' => new ReturnPurchaseResource($returnPurchase),
            ]);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::error('Failed to update purchase return.', [
                'user_id' => $request->user()?->id,
                'return_purchase_id' => $returnPurchase->id,
                'exception' => $exception,
            ]);

            return response()->json([
                'message' => 'Unable to update purchase return.',
            ], 500);
        }
    }

    public function approve(ReturnPurchase $returnPurchase, Request $request, ApprovalService $approvals): JsonResponse
    {
        $this->authorizeBranch($returnPurchase, $request);

        $returnPurchase = $approvals->approvePurchaseReturn($returnPurchase, $request->user());

        return response()->json([
            'message' => 'Purchase return approved successfully.',
            'data' => new ReturnPurchaseResource($returnPurchase),
        ]);
    }

    private function authorizeBranch(ReturnPurchase $returnPurchase, Request $request): void
    {
        abort_unless((int) $returnPurchase->biller_id === $request->user()->requireCurrentBillerId(), 404);
    }
}
